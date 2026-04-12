<?php

/**
 * Shopee Open Platform OAuth callback handler.
 * Shopee redirects here after the seller authorizes the app.
 * URL: /shopee-oauth.php?code={auth_code}&shop_id={shop_id}&state={state}
 */

declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
require_once __DIR__ . '/includes/ShopeeClient.php';

use Dashboard\ShopeeClient;

start_session();

// ── Auth guard ────────────────────────────────────────────────────────────────
if (empty($_SESSION['logged_in'])) {
    header('Location: index.php?error=not_logged_in');
    exit;
}

$code      = trim($_GET['code']   ?? '');
$shopId    = (int) ($_GET['shop_id'] ?? 0);
$state     = trim($_GET['state']  ?? '');
$errParam  = trim($_GET['error']  ?? '');

if ($errParam) {
    header('Location: index.php?shopee_error=' . urlencode($errParam));
    exit;
}

// Verify state (CSRF)
$expectedState = $_SESSION['shopee_oauth_state'] ?? '';
unset($_SESSION['shopee_oauth_state']);

if ($state === '' || $state !== $expectedState) {
    header('Location: index.php?shopee_error=invalid_state');
    exit;
}

if ($code === '' || $shopId === 0) {
    header('Location: index.php?shopee_error=missing_code_or_shop_id');
    exit;
}

// ── Exchange code for token ───────────────────────────────────────────────────
try {
    $pdo = db($config);

    $partnerId  = (int) ($pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='shopee_partner_id'")->fetchColumn() ?: 0);
    $partnerKey = (string) ($pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='shopee_partner_key'")->fetchColumn() ?: '');

    if ($partnerId === 0 || $partnerKey === '') {
        header('Location: index.php?shopee_error=missing_credentials');
        exit;
    }

    $client   = new ShopeeClient($partnerId, $partnerKey);
    $tokenRes = $client->getAccessToken($code, $shopId);

    // Check error field
    if (!empty($tokenRes['error'])) {
        $msg = urlencode($tokenRes['message'] ?? $tokenRes['error']);
        header("Location: index.php?shopee_error=$msg");
        exit;
    }

    $accessToken  = (string) ($tokenRes['access_token']  ?? '');
    $refreshToken = (string) ($tokenRes['refresh_token'] ?? '');
    $atExpireIn   = (int)    ($tokenRes['expire_in']             ?? 14400);
    $rtExpireIn   = (int)    ($tokenRes['refresh_token_expire_in'] ?? 2592000);
    $retShopId    = (int)    ($tokenRes['shop_id'] ?? $shopId);

    if ($accessToken === '') {
        log_activity('error', 'shopee', 'Token thiếu access_token', ['res' => $tokenRes]);
        header('Location: index.php?shopee_error=' . urlencode('Không lấy được access_token'));
        exit;
    }

    // Fetch shop name via GetShopInfo
    $shopName = '';
    try {
        $shopInfo = $client->getShopInfo($accessToken, $retShopId);
        $shopName = (string) ($shopInfo['response']['shop_name'] ?? $shopInfo['response']['name'] ?? '');
    } catch (\Throwable $ignored) {}

    $pdo->prepare("
        INSERT INTO shopee_connections
            (shop_id, shop_name, access_token, refresh_token,
             access_token_expire_at, refresh_token_expire_at, is_active)
        VALUES (?, ?, ?, ?,
                DATE_ADD(NOW(), INTERVAL ? SECOND),
                DATE_ADD(NOW(), INTERVAL ? SECOND),
                1)
        ON DUPLICATE KEY UPDATE
            shop_name               = VALUES(shop_name),
            access_token            = VALUES(access_token),
            refresh_token           = VALUES(refresh_token),
            access_token_expire_at  = VALUES(access_token_expire_at),
            refresh_token_expire_at = VALUES(refresh_token_expire_at),
            is_active               = 1,
            authorized_at           = NOW()
    ")->execute([$retShopId, $shopName, $accessToken, $refreshToken, $atExpireIn, $rtExpireIn]);

    log_activity('info', 'shopee', "OAuth thành công: shop_id={$retShopId} ({$shopName})");
    header('Location: index.php?shopee_connected=1#connect');
    exit;

} catch (\Throwable $e) {
    log_activity('error', 'shopee', 'OAuth callback thất bại: ' . $e->getMessage());
    header('Location: index.php?shopee_error=' . urlencode($e->getMessage()));
    exit;
}
