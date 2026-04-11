<?php

/**
 * Lazada Open Platform OAuth callback handler.
 * Lazada redirects here after the seller authorizes the app.
 * URL: /lazada-oauth.php?code={auth_code}&state={state}
 */

declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
require_once __DIR__ . '/includes/LazadaClient.php';

use Dashboard\LazadaClient;

start_session();

// ── Validate session ──────────────────────────────────────────────────────────
if (empty($_SESSION['logged_in'])) {
    header('Location: index.php?error=not_logged_in');
    exit;
}

$code     = trim($_GET['code']  ?? '');
$state    = trim($_GET['state'] ?? '');
$errParam = trim($_GET['error'] ?? '');

if ($errParam) {
    header('Location: index.php?lazada_error=' . urlencode($errParam));
    exit;
}

// Verify state to prevent CSRF
$expectedState = $_SESSION['lazada_oauth_state'] ?? '';
unset($_SESSION['lazada_oauth_state']);
$savedRedirectUri = $_SESSION['lazada_oauth_redirect_uri'] ?? '';
unset($_SESSION['lazada_oauth_redirect_uri']);

if ($state === '' || $state !== $expectedState) {
    header('Location: index.php?lazada_error=invalid_state');
    exit;
}

if ($code === '') {
    header('Location: index.php?lazada_error=missing_code');
    exit;
}

// ── Exchange code for token ───────────────────────────────────────────────────
try {
    $pdo = db($config);

    $appKey    = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='lazada_app_key'")->fetchColumn() ?: '';
    $appSecret = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='lazada_app_secret'")->fetchColumn() ?: '';

    if ($appKey === '' || $appSecret === '') {
        header('Location: index.php?lazada_error=missing_credentials');
        exit;
    }

    $client   = new LazadaClient($appKey, $appSecret);
    $tokenRes = $client->getAccessToken($code);

    // Lazada wraps token in {"data": {...}} with code inside data
    $data = isset($tokenRes['data']) && is_array($tokenRes['data'])
        ? $tokenRes['data']
        : $tokenRes;

    // Check error code (sits inside data in Lazada's actual response)
    $respCode = (string) ($data['code'] ?? $tokenRes['code'] ?? '0');
    if ($respCode !== '0') {
        $msg = urlencode($data['message'] ?? $tokenRes['message'] ?? ('code_' . $respCode));
        header("Location: index.php?lazada_error=$msg");
        exit;
    }

    $accessToken  = (string) ($data['access_token']  ?? '');
    $refreshToken = (string) ($data['refresh_token'] ?? '');
    $atExpireIn   = (int)    ($data['expires_in']     ?? 604800);
    // Lazada uses "refresh_expires_in" (not refresh_token_expires_in / refresh_token_valid_time)
    $rtExpireIn   = (int)    ($data['refresh_expires_in'] ?? $data['refresh_token_valid_time'] ?? $data['refresh_token_expires_in'] ?? 2592000);
    $countryCode  = strtolower((string) ($data['country'] ?? 'vn'));
    $accountName  = (string) ($data['account'] ?? '');

    // account_id is inside country_user_info[].seller_id (not a top-level field)
    $countryUserInfo = $data['country_user_info'] ?? [];
    $userInfo        = is_array($countryUserInfo) && !empty($countryUserInfo) ? $countryUserInfo[0] : [];
    $accountId       = (string) ($userInfo['seller_id'] ?? $userInfo['user_id'] ?? $data['account_id'] ?? '');

    // Fall back: use email as unique identifier if seller_id missing
    if ($accountId === '' && $accountName !== '') {
        $accountId = $accountName;
    }

    if ($accessToken === '' || $accountId === '') {
        log_activity('error', 'lazada', 'Token thiếu access_token hoặc account_id', ['data' => $data]);
        header('Location: index.php?lazada_error=' . urlencode('Không lấy được token. Kiểm tra log để biết chi tiết.'));
        exit;
    }

    $pdo->prepare("
        INSERT INTO lazada_connections
            (account_id, account_name, country, access_token, refresh_token,
             access_token_expire_at, refresh_token_expire_at, is_active)
        VALUES (?, ?, ?, ?, ?,
                DATE_ADD(NOW(), INTERVAL ? SECOND),
                DATE_ADD(NOW(), INTERVAL ? SECOND),
                1)
        ON DUPLICATE KEY UPDATE
            account_name            = VALUES(account_name),
            country                 = VALUES(country),
            access_token            = VALUES(access_token),
            refresh_token           = VALUES(refresh_token),
            access_token_expire_at  = VALUES(access_token_expire_at),
            refresh_token_expire_at = VALUES(refresh_token_expire_at),
            is_active               = 1,
            authorized_at           = NOW()
    ")->execute([$accountId, $accountName, $countryCode, $accessToken, $refreshToken, $atExpireIn, $rtExpireIn]);

    log_activity('info', 'lazada', "OAuth thành công: tài khoản {$accountName} ({$countryCode}) đã kết nối.");
    header('Location: index.php?lazada_connected=1#connect');
    exit;

} catch (\Throwable $e) {
    log_activity('error', 'lazada', 'OAuth callback thất bại: ' . $e->getMessage());
    header('Location: index.php?lazada_error=' . urlencode($e->getMessage()));
    exit;
}
