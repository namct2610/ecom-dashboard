<?php

/**
 * TikTok Shop OAuth callback handler.
 * TikTok redirects here after the seller authorizes the app.
 * URL: /tiktok-oauth.php?code={auth_code}&state={state}
 */

declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
require_once __DIR__ . '/includes/TiktokShopClient.php';

use Dashboard\TiktokShopClient;

start_session();

// ── Validate session ──────────────────────────────────────────────────────────
if (empty($_SESSION['logged_in'])) {
    header('Location: index.php?error=not_logged_in');
    exit;
}

$code  = trim($_GET['code']  ?? '');
$state = trim($_GET['state'] ?? '');
$errParam = trim($_GET['error'] ?? '');

if ($errParam) {
    header('Location: index.php?tiktok_error=' . urlencode($errParam));
    exit;
}

// Verify state to prevent CSRF
$expectedState = $_SESSION['tiktok_oauth_state'] ?? '';
unset($_SESSION['tiktok_oauth_state']);

if ($state === '' || $state !== $expectedState) {
    header('Location: index.php?tiktok_error=invalid_state');
    exit;
}

if ($code === '') {
    header('Location: index.php?tiktok_error=missing_code');
    exit;
}

// ── Exchange code for token ───────────────────────────────────────────────────
try {
    $pdo = db($config);

    $appKey    = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='tiktok_app_key'")->fetchColumn() ?: '';
    $appSecret = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='tiktok_app_secret'")->fetchColumn() ?: '';

    if ($appKey === '' || $appSecret === '') {
        header('Location: index.php?tiktok_error=missing_credentials');
        exit;
    }

    $client   = new TiktokShopClient($appKey, $appSecret);
    $tokenRes = $client->getAccessToken($code);

    if (($tokenRes['code'] ?? -1) !== 0) {
        $msg = urlencode($tokenRes['message'] ?? 'token_error');
        header("Location: index.php?tiktok_error=$msg");
        exit;
    }

    $data         = $tokenRes['data'] ?? [];
    $accessToken  = $data['access_token']   ?? '';
    $refreshToken = $data['refresh_token']  ?? '';
    $atExpireIn   = (int) ($data['access_token_expire_in']  ?? 14400);
    $rtExpireIn   = (int) ($data['refresh_token_expire_in'] ?? 2592000);

    // Get authorized shops
    $shopsRes   = $client->getAuthorizedShops($accessToken);
    $shopList   = $shopsRes['data']['shops'] ?? $shopsRes['data']['shop_list'] ?? [];

    if (empty($shopList)) {
        // If API doesn't return shops array, try single shop from token response
        $shopList = [];
        if (!empty($data['seller_name']) || !empty($data['open_id'])) {
            $shopList[] = [
                'shop_id'     => $data['open_id'] ?? uniqid('shop_'),
                'shop_name'   => $data['seller_name'] ?? 'TikTok Shop',
                'shop_cipher' => $data['cipher'] ?? '',
                'region'      => $data['region'] ?? '',
            ];
        }
    }

    $saved = 0;
    foreach ($shopList as $shop) {
        $shopId     = (string) ($shop['shop_id']     ?? $shop['id']     ?? '');
        $shopName   = (string) ($shop['shop_name']   ?? $shop['name']   ?? 'TikTok Shop');
        $shopCipher = (string) ($shop['shop_cipher'] ?? $shop['cipher'] ?? '');
        $region     = (string) ($shop['region']      ?? '');

        if ($shopId === '') continue;

        $pdo->prepare("
            INSERT INTO tiktok_connections
                (shop_id, shop_name, shop_cipher, region, access_token, refresh_token,
                 access_token_expire_at, refresh_token_expire_at, is_active)
            VALUES (?, ?, ?, ?, ?, ?,
                    DATE_ADD(NOW(), INTERVAL ? SECOND),
                    DATE_ADD(NOW(), INTERVAL ? SECOND),
                    1)
            ON DUPLICATE KEY UPDATE
                shop_name               = VALUES(shop_name),
                shop_cipher             = VALUES(shop_cipher),
                region                  = VALUES(region),
                access_token            = VALUES(access_token),
                refresh_token           = VALUES(refresh_token),
                access_token_expire_at  = VALUES(access_token_expire_at),
                refresh_token_expire_at = VALUES(refresh_token_expire_at),
                is_active               = 1,
                authorized_at           = NOW()
        ")->execute([$shopId, $shopName, $shopCipher, $region, $accessToken, $refreshToken, $atExpireIn, $rtExpireIn]);

        $saved++;
    }

    log_activity('info', 'tiktok', "OAuth thành công: $saved shop(s) đã kết nối.");
    header('Location: index.php?tiktok_connected=' . $saved . '#connect');
    exit;

} catch (\Throwable $e) {
    log_activity('error', 'tiktok', 'OAuth callback thất bại: ' . $e->getMessage());
    header('Location: index.php?tiktok_error=' . urlencode($e->getMessage()));
    exit;
}
