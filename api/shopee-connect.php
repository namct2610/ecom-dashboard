<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';
require dirname(__DIR__) . '/includes/ShopeeClient.php';

use Dashboard\ShopeeClient;

require_auth();

$method = $_SERVER['REQUEST_METHOD'];

try {
    $pdo = db($config);

    // ── GET ───────────────────────────────────────────────────────────────────
    if ($method === 'GET') {
        $action = $_GET['action'] ?? 'status';

        if ($action === 'status') {
            $partnerId = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='shopee_partner_id'")->fetchColumn() ?: '';
            $hasKey    = (bool) $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='shopee_partner_key'")->fetchColumn();

            $shops = $pdo->query("
                SELECT id, shop_id, shop_name, is_active,
                       access_token_expire_at, refresh_token_expire_at,
                       authorized_at, last_synced_at, sync_from_date
                FROM shopee_connections ORDER BY authorized_at DESC
            ")->fetchAll();

            json_response([
                'success'    => true,
                'partner_id' => $partnerId,
                'has_key'    => $hasKey,
                'shops'      => $shops,
            ]);
        }

        json_error('Unknown action.', 400);
    }

    // ── POST ──────────────────────────────────────────────────────────────────
    require_method('POST');
    require_csrf();

    $body   = (array) json_decode(file_get_contents('php://input') ?: '{}', true);
    $action = $body['action'] ?? '';

    // ── Save credentials ──────────────────────────────────────────────────────
    if ($action === 'save_credentials') {
        $partnerId  = (int) ($body['partner_id']  ?? 0);
        $partnerKey = trim($body['partner_key'] ?? '');

        if ($partnerId === 0) json_error('Partner ID không hợp lệ.');

        $upsert = $pdo->prepare("
            INSERT INTO app_settings (setting_key, setting_value)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        ");
        $upsert->execute(['shopee_partner_id',  (string) $partnerId]);
        if ($partnerKey !== '') {
            $upsert->execute(['shopee_partner_key', $partnerKey]);
        }

        log_activity('info', 'shopee', 'Đã lưu Shopee Partner ID/Key.');
        json_response(['success' => true]);
    }

    // ── Get auth URL ──────────────────────────────────────────────────────────
    if ($action === 'get_auth_url') {
        $partnerId  = (int) ($pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='shopee_partner_id'")->fetchColumn() ?: 0);
        $partnerKey = (string) ($pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='shopee_partner_key'")->fetchColumn() ?: '');

        if ($partnerId === 0 || $partnerKey === '') {
            json_error('Chưa lưu Partner ID và Partner Key.');
        }

        $state = bin2hex(random_bytes(16));

        $scheme      = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host        = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $basePath    = dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/shopee-connect.php'));
        $redirectUri = $scheme . '://' . $host . rtrim($basePath, '/') . '/shopee-oauth.php';

        start_session();
        $_SESSION['shopee_oauth_state'] = $state;

        $client  = new ShopeeClient($partnerId, $partnerKey);
        $authUrl = $client->getAuthUrl($redirectUri, $state);

        log_activity('info', 'shopee', 'Auth URL generated', ['redirect_uri' => $redirectUri]);
        json_response(['success' => true, 'auth_url' => $authUrl, 'redirect_uri' => $redirectUri]);
    }

    // ── Disconnect ────────────────────────────────────────────────────────────
    if ($action === 'disconnect') {
        $shopId = (int) ($body['shop_id'] ?? 0);
        if ($shopId === 0) json_error('Thiếu shop_id.', 400);
        $pdo->prepare("DELETE FROM shopee_connections WHERE shop_id = ?")->execute([$shopId]);
        log_activity('info', 'shopee', "Đã ngắt kết nối shop_id: $shopId");
        json_response(['success' => true]);
    }

    // ── Toggle active ─────────────────────────────────────────────────────────
    if ($action === 'toggle_active') {
        $shopId = (int) ($body['shop_id']   ?? 0);
        $active = (int) ($body['is_active'] ?? 1);
        $pdo->prepare("UPDATE shopee_connections SET is_active=? WHERE shop_id=?")->execute([$active, $shopId]);
        json_response(['success' => true]);
    }

    // ── Set sync from date ────────────────────────────────────────────────────
    if ($action === 'set_sync_from') {
        $shopId   = (int)    ($body['shop_id']       ?? 0);
        $fromDate = trim($body['sync_from_date'] ?? '');
        if ($shopId && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromDate)) {
            $pdo->prepare("UPDATE shopee_connections SET sync_from_date=? WHERE shop_id=?")
                ->execute([$fromDate, $shopId]);
        }
        json_response(['success' => true]);
    }

    // ── Sync orders ───────────────────────────────────────────────────────────
    if ($action === 'sync') {
        $shopId = (int) ($body['shop_id'] ?? 0);

        $where  = $shopId ? 'WHERE shop_id = ? AND is_active = 1' : 'WHERE is_active = 1';
        $params = $shopId ? [$shopId] : [];
        $stmt   = $pdo->prepare("SELECT * FROM shopee_connections $where");
        $stmt->execute($params);
        $shops  = $stmt->fetchAll();

        if (empty($shops)) json_error('Không có shop nào được kết nối và kích hoạt.');

        $partnerId  = (int) ($pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='shopee_partner_id'")->fetchColumn() ?: 0);
        $partnerKey = (string) ($pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='shopee_partner_key'")->fetchColumn() ?: '');

        if ($partnerId === 0 || $partnerKey === '') json_error('Chưa cấu hình Partner ID / Partner Key.');

        $client  = new ShopeeClient($partnerId, $partnerKey);
        $results = [];
        foreach ($shops as $shop) {
            $results[] = syncShopeeShop($pdo, $client, $shop);
        }

        json_response(['success' => true, 'results' => $results]);
    }

    json_error('Unknown action.', 400);

} catch (\Throwable $e) {
    json_exception($e, 'Lỗi kết nối Shopee.');
}

// ── Sync helper ───────────────────────────────────────────────────────────────

function syncShopeeShop(PDO $pdo, ShopeeClient $client, array $shop): array
{
    $shopId   = (int)    $shop['shop_id'];
    $shopName = (string) ($shop['shop_name'] ?? $shopId);

    // Refresh token if expiring within 10 min
    $accessToken = (string) $shop['access_token'];
    $expireAt    = $shop['access_token_expire_at'] ? strtotime($shop['access_token_expire_at']) : 0;

    if ($expireAt && $expireAt < time() + 600) {
        $refreshToken = (string) ($shop['refresh_token'] ?? '');
        if ($refreshToken === '') {
            return ['shop' => $shopName, 'success' => false, 'error' => 'Token hết hạn, cần cấp quyền lại.'];
        }
        try {
            $res = $client->refreshAccessToken($refreshToken, $shopId);
            if (!empty($res['error'])) {
                return ['shop' => $shopName, 'success' => false, 'error' => 'Làm mới token thất bại: ' . ($res['message'] ?? $res['error'])];
            }
            $accessToken = (string) ($res['access_token'] ?? '');
            $pdo->prepare("
                UPDATE shopee_connections SET
                    access_token            = ?,
                    refresh_token           = ?,
                    access_token_expire_at  = DATE_ADD(NOW(), INTERVAL ? SECOND),
                    refresh_token_expire_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
                WHERE shop_id = ?
            ")->execute([
                $accessToken,
                $res['refresh_token'] ?? $refreshToken,
                (int) ($res['expire_in'] ?? 14400),
                (int) ($res['refresh_token_expire_in'] ?? 2592000),
                $shopId,
            ]);
        } catch (\Throwable $e) {
            return ['shop' => $shopName, 'success' => false, 'error' => $e->getMessage()];
        }
    }

    // Time range
    $fromDate  = $shop['sync_from_date'] ?: date('Y-m-d', strtotime('-30 days'));
    $lastSync  = $shop['last_synced_at'];
    $timeFrom  = $lastSync ? (strtotime($lastSync) - 300) : strtotime($fromDate . ' 00:00:00');
    $timeTo    = time();

    $imported = 0;
    $errors   = 0;
    $cursor   = '';

    do {
        try {
            $res = $client->getOrderList($accessToken, $shopId, [
                'time_range_field' => 'create_time',
                'time_from'        => $timeFrom,
                'time_to'          => $timeTo,
                'page_size'        => 100,
                'cursor'           => $cursor,
            ]);
        } catch (\Throwable $e) {
            return ['shop' => $shopName, 'success' => false, 'error' => $e->getMessage()];
        }

        if (!empty($res['error'])) {
            return ['shop' => $shopName, 'success' => false, 'error' => $res['message'] ?? $res['error']];
        }

        $orderList = $res['response']['order_list'] ?? [];
        if (empty($orderList)) break;

        // Fetch full detail in batches of 50
        $sns    = array_column($orderList, 'order_sn');
        $chunks = array_chunk($sns, 50);

        foreach ($chunks as $chunk) {
            try {
                $detailRes = $client->getOrderDetail($accessToken, $shopId, $chunk);
            } catch (\Throwable $e) {
                $errors += count($chunk);
                continue;
            }

            if (!empty($detailRes['error'])) {
                $errors += count($chunk);
                continue;
            }

            foreach ($detailRes['response']['order_list'] ?? [] as $order) {
                foreach ($order['item_list'] ?? [] as $item) {
                    try {
                        insertShopeeOrder($pdo, $order, $item);
                        $imported++;
                    } catch (\Throwable $e) {
                        $errors++;
                    }
                }
            }
        }

        $more   = $res['response']['more']        ?? false;
        $cursor = $res['response']['next_cursor']  ?? '';

    } while ($more && $cursor !== '');

    $pdo->prepare("UPDATE shopee_connections SET last_synced_at = NOW() WHERE shop_id = ?")
        ->execute([$shopId]);

    log_activity('info', 'shopee', "Đồng bộ [{$shopName}]: +{$imported} mục, {$errors} lỗi");
    return ['shop' => $shopName, 'success' => true, 'imported' => $imported, 'errors' => $errors];
}

function insertShopeeOrder(PDO $pdo, array $order, array $item): void
{
    $orderSn = (string) ($order['order_sn'] ?? '');
    $status  = (string) ($order['order_status'] ?? '');

    $addr     = $order['recipient_address'] ?? [];
    $buyerName = (string) ($addr['name'] ?? '');
    $addrLine  = (string) ($addr['full_address'] ?? '');
    $city      = normalize_city($addr['city'] ?? $addr['state'] ?? null);
    $district  = (string) ($addr['district'] ?? '');

    $sku       = (string) ($item['variation_sku'] ?? $item['item_sku'] ?? 'unknown');
    $prodName  = (string) ($item['item_name']     ?? '');
    $variation = (string) ($item['variation_name'] ?? '');
    $qty       = (int)    ($item['model_quantity_purchased'] ?? 1);
    $unitPrice = (float)  ($item['model_discounted_price']   ?? $item['model_original_price'] ?? 0);
    $origPrice = (float)  ($item['model_original_price']     ?? $unitPrice);

    $sellerDisc   = abs((float) ($item['seller_discount']  ?? $order['seller_discount']  ?? 0));
    $shopeeDisc   = abs((float) ($item['shopee_discount']  ?? $order['shopee_discount']  ?? 0));
    $shippingFee  = (float) ($order['actual_shipping_fee'] ?? $order['estimated_shipping_fee'] ?? 0);
    $orderTotal   = (float) ($order['total_amount'] ?? 0);
    $payMethod    = (string) ($order['payment_method'] ?? '');

    $createdAt  = date('Y-m-d H:i:s', (int) ($order['create_time'] ?? time()));
    $updatedAt  = isset($order['update_time']) ? date('Y-m-d H:i:s', (int) $order['update_time']) : null;

    $normalizedStatus = normalizeShopeeStatus($status);
    $completedAt = $normalizedStatus === 'completed' ? $updatedAt : null;

    upsert_order($pdo, [
        'platform'                 => 'shopee',
        'order_id'                 => $orderSn,
        'buyer_name'               => $buyerName  ?: null,
        'buyer_username'           => (string) ($order['buyer_username'] ?? '') ?: null,
        'shipping_address'         => $addrLine   ?: null,
        'shipping_district'        => $district   ?: null,
        'shipping_city'            => $city,
        'payment_method'           => $payMethod  ?: null,
        'sku'                      => $sku,
        'product_name'             => $prodName,
        'variation'                => $variation  ?: null,
        'quantity'                 => $qty,
        'unit_price'               => $unitPrice,
        'subtotal_before_discount' => $origPrice * $qty,
        'platform_discount'        => $shopeeDisc,
        'seller_discount'          => $sellerDisc,
        'subtotal_after_discount'  => $unitPrice  * $qty,
        'order_total'              => $orderTotal,
        'shipping_fee'             => $shippingFee,
        'platform_fee_fixed'       => 0,
        'platform_fee_service'     => 0,
        'platform_fee_payment'     => 0,
        'normalized_status'        => $normalizedStatus,
        'original_status'          => $status,
        'order_created_at'         => $createdAt,
        'order_paid_at'            => null,
        'order_completed_at'       => $completedAt,
        'upload_id'                => null,
    ]);
}

function normalizeShopeeStatus(string $s): string
{
    $s = strtoupper(trim($s));
    if ($s === 'COMPLETED')                          return 'completed';
    if (in_array($s, ['SHIPPED', 'TO_CONFIRM_RECEIVE'], true)) return 'delivered';
    if (in_array($s, ['CANCELLED', 'TO_RETURN'], true))        return 'cancelled';
    return 'pending'; // UNPAID, READY_TO_SHIP, PROCESSED, IN_CANCEL, etc.
}
