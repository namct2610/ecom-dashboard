<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';
require dirname(__DIR__) . '/includes/TiktokShopClient.php';

use Dashboard\TiktokShopClient;

require_admin();

$method = $_SERVER['REQUEST_METHOD'];

try {
    $pdo = db($config);

    // ── GET requests ──────────────────────────────────────────────────────────
    if ($method === 'GET') {
        $action = $_GET['action'] ?? 'status';

        if ($action === 'status') {
            // Return saved credentials (masked) + list of connected shops
            $appKey = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='tiktok_app_key'")->fetchColumn() ?: '';
            $hasSecret = (bool) $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='tiktok_app_secret'")->fetchColumn();

            $shops = $pdo->query("
                SELECT id, shop_id, shop_name, region, is_active,
                       access_token_expire_at, refresh_token_expire_at,
                       authorized_at, last_synced_at, sync_from_date
                FROM tiktok_connections ORDER BY authorized_at DESC
            ")->fetchAll();

            json_response([
                'success'    => true,
                'app_key'    => $appKey,
                'has_secret' => $hasSecret,
                'shops'      => $shops,
            ]);
        }

        json_error('Unknown action.', 400);
    }

    // ── POST requests ─────────────────────────────────────────────────────────
    require_method('POST');
    require_csrf();

    $body   = (array) json_decode(file_get_contents('php://input') ?: '{}', true);
    $action = $body['action'] ?? '';

    // ── Save credentials ──────────────────────────────────────────────────────
    if ($action === 'save_credentials') {
        $appKey    = trim($body['app_key']    ?? '');
        $appSecret = trim($body['app_secret'] ?? '');

        if ($appKey === '') {
            json_error('App Key không được để trống.');
        }

        $upsert = $pdo->prepare("
            INSERT INTO app_settings (setting_key, setting_value)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        ");
        $upsert->execute(['tiktok_app_key', $appKey]);
        if ($appSecret !== '') {
            $upsert->execute(['tiktok_app_secret', $appSecret]);
        }

        log_activity('info', 'tiktok', 'Đã lưu thông tin App Key TikTok Shop.');
        json_response(['success' => true]);
    }

    // ── Get auth URL ──────────────────────────────────────────────────────────
    if ($action === 'get_auth_url') {
        $appKey    = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='tiktok_app_key'")->fetchColumn() ?: '';
        $appSecret = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='tiktok_app_secret'")->fetchColumn() ?: '';

        if ($appKey === '' || $appSecret === '') {
            json_error('Chưa lưu App Key và App Secret. Vui lòng lưu trước.');
        }

        $client = new TiktokShopClient($appKey, $appSecret);
        $state  = bin2hex(random_bytes(16));

        // Store state in session for verification
        start_session();
        $_SESSION['tiktok_oauth_state'] = $state;

        // Build redirect URI pointing to our OAuth callback
        $scheme      = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host        = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $basePath    = dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/tiktok-connect.php'));
        $redirectUri = $scheme . '://' . $host . rtrim($basePath, '/') . '/tiktok-oauth.php';

        $authUrl = $client->getAuthUrl($state, $redirectUri);

        json_response(['success' => true, 'auth_url' => $authUrl]);
    }

    // ── Disconnect a shop ─────────────────────────────────────────────────────
    if ($action === 'disconnect') {
        $shopId = trim($body['shop_id'] ?? '');
        if ($shopId === '') {
            json_error('Thiếu shop_id.', 400);
        }
        $pdo->prepare("DELETE FROM tiktok_connections WHERE shop_id = ?")->execute([$shopId]);
        log_activity('info', 'tiktok', "Đã ngắt kết nối shop TikTok: $shopId");
        json_response(['success' => true]);
    }

    // ── Toggle active ─────────────────────────────────────────────────────────
    if ($action === 'toggle_active') {
        $shopId = trim($body['shop_id'] ?? '');
        $active = (int) ($body['is_active'] ?? 1);
        $pdo->prepare("UPDATE tiktok_connections SET is_active=? WHERE shop_id=?")->execute([$active, $shopId]);
        json_response(['success' => true]);
    }

    // ── Set sync from date ────────────────────────────────────────────────────
    if ($action === 'set_sync_from') {
        $shopId   = trim($body['shop_id']        ?? '');
        $fromDate = trim($body['sync_from_date'] ?? '');
        if ($shopId && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromDate)) {
            $pdo->prepare("UPDATE tiktok_connections SET sync_from_date=? WHERE shop_id=?")
                ->execute([$fromDate, $shopId]);
        }
        json_response(['success' => true]);
    }

    // ── Sync orders ───────────────────────────────────────────────────────────
    if ($action === 'sync') {
        $shopId = trim($body['shop_id'] ?? '');

        $where  = $shopId ? 'WHERE shop_id = ? AND is_active = 1' : 'WHERE is_active = 1';
        $params = $shopId ? [$shopId] : [];
        $stmt   = $pdo->prepare("SELECT * FROM tiktok_connections $where");
        $stmt->execute($params);
        $shops  = $stmt->fetchAll();

        if (empty($shops)) {
            json_error('Không có shop nào được kết nối và kích hoạt.');
        }

        $appKey    = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='tiktok_app_key'")->fetchColumn() ?: '';
        $appSecret = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='tiktok_app_secret'")->fetchColumn() ?: '';

        if ($appKey === '' || $appSecret === '') {
            json_error('Chưa cấu hình App Key / App Secret.');
        }

        $client  = new TiktokShopClient($appKey, $appSecret);
        $results = [];

        foreach ($shops as $shop) {
            $results[] = syncShop($pdo, $client, $shop);
        }

        json_response(['success' => true, 'results' => $results]);
    }

    json_error('Unknown action.', 400);

} catch (\Throwable $e) {
    json_exception($e, 'Lỗi kết nối TikTok Shop.');
}

// ── Sync helper ───────────────────────────────────────────────────────────────

function syncShop(PDO $pdo, TiktokShopClient $client, array $shop): array
{
    $shopId     = $shop['shop_id'];
    $shopName   = $shop['shop_name'] ?? $shopId;
    $shopCipher = $shop['shop_cipher'] ?? '';

    // Refresh token if expired (or will expire within 10 min)
    $accessToken = $shop['access_token'];
    $expireAt    = $shop['access_token_expire_at'] ? strtotime($shop['access_token_expire_at']) : 0;

    if ($expireAt && $expireAt < time() + 600) {
        $refreshToken = $shop['refresh_token'] ?? '';
        if ($refreshToken === '') {
            return ['shop' => $shopName, 'success' => false, 'error' => 'Token hết hạn, cần cấp quyền lại.'];
        }
        try {
            $tokenRes = $client->refreshAccessToken($refreshToken);
            if (($tokenRes['code'] ?? -1) !== 0) {
                return ['shop' => $shopName, 'success' => false, 'error' => 'Làm mới token thất bại: ' . ($tokenRes['message'] ?? '')];
            }
            $d = $tokenRes['data'] ?? [];
            $accessToken = $d['access_token'] ?? '';
            $pdo->prepare("
                UPDATE tiktok_connections SET
                    access_token = ?,
                    refresh_token = ?,
                    access_token_expire_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
                    refresh_token_expire_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
                WHERE shop_id = ?
            ")->execute([
                $accessToken,
                $d['refresh_token'] ?? $refreshToken,
                (int)($d['access_token_expire_in'] ?? 14400),
                (int)($d['refresh_token_expire_in'] ?? 2592000),
                $shopId,
            ]);
        } catch (\Throwable $e) {
            return ['shop' => $shopName, 'success' => false, 'error' => $e->getMessage()];
        }
    }

    // Determine sync time range
    $fromDate  = $shop['sync_from_date'] ?: date('Y-m-d', strtotime('-30 days'));
    $lastSync  = $shop['last_synced_at'];
    $timeFrom  = $lastSync ? (strtotime($lastSync) - 300) : strtotime($fromDate); // 5min overlap
    $timeTo    = time();

    $imported = 0;
    $errors   = 0;
    $pageToken = '';

    do {
        try {
            $res = $client->searchOrders($accessToken, $shopCipher, $timeFrom, $timeTo, 50, $pageToken);
        } catch (\Throwable $e) {
            return ['shop' => $shopName, 'success' => false, 'error' => $e->getMessage()];
        }

        if (($res['code'] ?? -1) !== 0) {
            $msg = $res['message'] ?? 'API error ' . ($res['code'] ?? '');
            return ['shop' => $shopName, 'success' => false, 'error' => $msg];
        }

        $data     = $res['data'] ?? [];
        $orders   = $data['order_list'] ?? [];
        $pageToken = $data['next_page_token'] ?? '';

        if (empty($orders)) break;

        // Fetch details in batches of 50
        $orderIds = array_column($orders, 'id');
        try {
            $detailRes = $client->getOrderDetails($accessToken, $shopCipher, $orderIds);
        } catch (\Throwable $e) {
            $errors += count($orderIds);
            continue;
        }

        $detailOrders = $detailRes['data']['order_list'] ?? [];

        foreach ($detailOrders as $o) {
            try {
                $imported += insertTiktokOrder($pdo, $o);
            } catch (\Throwable $e) {
                $errors++;
            }
        }

    } while ($pageToken !== '');

    // Update last_synced_at
    $pdo->prepare("UPDATE tiktok_connections SET last_synced_at = NOW() WHERE shop_id = ?")
        ->execute([$shopId]);

    log_activity('info', 'tiktok', "Đồng bộ TikTok Shop [{$shopName}]: +{$imported} đơn, {$errors} lỗi");

    return ['shop' => $shopName, 'success' => true, 'imported' => $imported, 'errors' => $errors];
}

function insertTiktokOrder(PDO $pdo, array $o): int
{
    $orderId   = (string) ($o['id'] ?? '');
    $status    = strtoupper((string) ($o['status'] ?? ''));
    $createTs  = (int) ($o['create_time'] ?? 0);
    $paidTs    = (int) ($o['paid_time'] ?? 0);

    $normalizedStatus = match (true) {
        in_array($status, ['COMPLETED'], true)                          => 'completed',
        in_array($status, ['DELIVERED'], true)                          => 'delivered',
        in_array($status, ['CANCELLED'], true)                          => 'cancelled',
        default                                                         => 'pending',
    };

    $recipient = $o['recipient_address'] ?? [];
    $payment   = $o['payment'] ?? [];
    $buyerUid  = (string) ($o['buyer_uid'] ?? '');

    $shippingAddress  = trim(implode(', ', array_filter([
        $recipient['address_detail'] ?? '',
        $recipient['district_name']  ?? '',
        $recipient['city']           ?? '',
    ])));
    $shippingDistrict = (string) ($recipient['district_name'] ?? '');
    $shippingCity     = (string) ($recipient['city']           ?? '');
    $buyerName        = (string) ($recipient['name']           ?? '');

    $orderTotal   = (float) ($payment['total_amount']   ?? 0);
    $shippingFee  = (float) ($payment['shipping_fee']   ?? 0);

    $lineItems = $o['line_items'] ?? [];
    if (empty($lineItems)) {
        $lineItems = [[]]; // ensure at least one row
    }

    $inserted = 0;
    foreach ($lineItems as $item) {
        $sku          = (string) ($item['seller_sku']    ?? $item['sku_id'] ?? 'unknown');
        $productName  = (string) ($item['product_name']  ?? '');
        $variation    = (string) ($item['sku_name']       ?? '');
        $quantity     = (int)   ($item['quantity']        ?? 1);
        $unitPrice    = (float) ($item['sale_price']      ?? $item['original_price'] ?? 0);
        $subtotalBefore = (float) ($item['original_price'] ?? $unitPrice * $quantity);
        $platDiscount = (float) ($item['platform_discount'] ?? 0);
        $sellDiscount = (float) ($item['seller_discount']   ?? 0);
        $subtotalAfter = (float) ($item['sku_total_amount']  ?? ($subtotalBefore - $platDiscount - $sellDiscount));

        try {
            upsert_order($pdo, [
                'platform'                 => 'tiktokshop',
                'order_id'                 => $orderId,
                'buyer_name'               => $buyerName ?: null,
                'buyer_username'           => $buyerUid  ?: null,
                'shipping_address'         => $shippingAddress  ?: null,
                'shipping_district'        => $shippingDistrict ?: null,
                'shipping_city'            => $shippingCity     ?: null,
                'payment_method'           => $payment['payment_method'] ?? null,
                'sku'                      => $sku,
                'product_name'             => $productName,
                'variation'                => $variation ?: null,
                'quantity'                 => $quantity,
                'unit_price'               => $unitPrice,
                'subtotal_before_discount' => $subtotalBefore,
                'platform_discount'        => $platDiscount,
                'seller_discount'          => $sellDiscount,
                'subtotal_after_discount'  => $subtotalAfter,
                'order_total'              => $orderTotal,
                'shipping_fee'             => $shippingFee,
                'platform_fee_fixed'       => 0,
                'platform_fee_service'     => 0,
                'platform_fee_payment'     => 0,
                'normalized_status'        => $normalizedStatus,
                'original_status'          => $status,
                'order_created_at'         => $createTs ? date('Y-m-d H:i:s', $createTs) : date('Y-m-d H:i:s'),
                'order_paid_at'            => $paidTs   ? date('Y-m-d H:i:s', $paidTs)   : null,
                'order_completed_at'       => null,
                'upload_id'                => null,
            ]);
            $inserted++;
        } catch (\Throwable $e) {
            // skip duplicate / bad rows
        }
    }
    return $inserted;
}
