<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';
require dirname(__DIR__) . '/includes/LazadaClient.php';

use Dashboard\LazadaClient;

require_auth();

$method = $_SERVER['REQUEST_METHOD'];

try {
    $pdo = db($config);

    // ── GET requests ──────────────────────────────────────────────────────────
    if ($method === 'GET') {
        $action = $_GET['action'] ?? 'status';

        if ($action === 'status') {
            $appKey   = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='lazada_app_key'")->fetchColumn() ?: '';
            $hasSecret = (bool) $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='lazada_app_secret'")->fetchColumn();

            $accounts = $pdo->query("
                SELECT id, account_id, account_name, country, is_active,
                       access_token_expire_at, refresh_token_expire_at,
                       authorized_at, last_synced_at, sync_from_date
                FROM lazada_connections ORDER BY authorized_at DESC
            ")->fetchAll();

            json_response([
                'success'    => true,
                'app_key'    => $appKey,
                'has_secret' => $hasSecret,
                'accounts'   => $accounts,
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
        $upsert->execute(['lazada_app_key', $appKey]);
        if ($appSecret !== '') {
            $upsert->execute(['lazada_app_secret', $appSecret]);
        }

        log_activity('info', 'lazada', 'Đã lưu thông tin App Key Lazada.');
        json_response(['success' => true]);
    }

    // ── Get auth URL ──────────────────────────────────────────────────────────
    if ($action === 'get_auth_url') {
        $appKey    = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='lazada_app_key'")->fetchColumn() ?: '';
        $appSecret = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='lazada_app_secret'")->fetchColumn() ?: '';

        if ($appKey === '' || $appSecret === '') {
            json_error('Chưa lưu App Key và App Secret. Vui lòng lưu trước.');
        }

        $state = bin2hex(random_bytes(16));

        // Build redirect URI pointing to our OAuth callback
        $scheme      = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host        = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $basePath    = dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/lazada-connect.php'));
        $redirectUri = $scheme . '://' . $host . rtrim($basePath, '/') . '/lazada-oauth.php';

        start_session();
        $_SESSION['lazada_oauth_state'] = $state;

        $client  = new LazadaClient($appKey, $appSecret);
        $authUrl = $client->getAuthUrl($redirectUri, $state);

        log_activity('info', 'lazada', 'Auth URL generated', ['redirect_uri' => $redirectUri, 'auth_url' => $authUrl]);

        json_response(['success' => true, 'auth_url' => $authUrl, 'redirect_uri' => $redirectUri]);
    }

    // ── Disconnect an account ─────────────────────────────────────────────────
    if ($action === 'disconnect') {
        $accountId = trim($body['account_id'] ?? '');
        if ($accountId === '') {
            json_error('Thiếu account_id.', 400);
        }
        $pdo->prepare("DELETE FROM lazada_connections WHERE account_id = ?")->execute([$accountId]);
        log_activity('info', 'lazada', "Đã ngắt kết nối tài khoản Lazada: $accountId");
        json_response(['success' => true]);
    }

    // ── Toggle active ─────────────────────────────────────────────────────────
    if ($action === 'toggle_active') {
        $accountId = trim($body['account_id'] ?? '');
        $active    = (int) ($body['is_active'] ?? 1);
        $pdo->prepare("UPDATE lazada_connections SET is_active=? WHERE account_id=?")->execute([$active, $accountId]);
        json_response(['success' => true]);
    }

    // ── Set sync from date ────────────────────────────────────────────────────
    if ($action === 'set_sync_from') {
        $accountId = trim($body['account_id']      ?? '');
        $fromDate  = trim($body['sync_from_date']  ?? '');
        if ($accountId && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromDate)) {
            $pdo->prepare("UPDATE lazada_connections SET sync_from_date=? WHERE account_id=?")
                ->execute([$fromDate, $accountId]);
        }
        json_response(['success' => true]);
    }

    // ── Sync orders ───────────────────────────────────────────────────────────
    if ($action === 'sync') {
        $accountId = trim($body['account_id'] ?? '');
        $reqDateFrom = trim($body['date_from'] ?? '');
        $reqDateTo   = trim($body['date_to']   ?? '');

        $where  = $accountId ? 'WHERE account_id = ? AND is_active = 1' : 'WHERE is_active = 1';
        $params = $accountId ? [$accountId] : [];
        $stmt   = $pdo->prepare("SELECT * FROM lazada_connections $where");
        $stmt->execute($params);
        $accounts = $stmt->fetchAll();

        if (empty($accounts)) {
            json_error('Không có tài khoản nào được kết nối và kích hoạt.');
        }

        $appKey    = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='lazada_app_key'")->fetchColumn() ?: '';
        $appSecret = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key='lazada_app_secret'")->fetchColumn() ?: '';

        if ($appKey === '' || $appSecret === '') {
            json_error('Chưa cấu hình App Key / App Secret.');
        }

        $client  = new LazadaClient($appKey, $appSecret);
        $results = [];

        foreach ($accounts as $account) {
            $results[] = syncLazadaAccount($pdo, $client, $account, $reqDateFrom, $reqDateTo);
        }

        json_response(['success' => true, 'results' => $results]);
    }

    json_error('Unknown action.', 400);

} catch (\Throwable $e) {
    json_exception($e, 'Lỗi kết nối Lazada.');
}

// ── Sync helper ───────────────────────────────────────────────────────────────

function syncLazadaAccount(PDO $pdo, LazadaClient $client, array $account, string $reqDateFrom = '', string $reqDateTo = ''): array
{
    $accountId   = $account['account_id'];
    $accountName = $account['account_name'] ?? $accountId;

    // Refresh token if expired (or will expire within 10 min)
    $accessToken = $account['access_token'];
    $expireAt    = $account['access_token_expire_at'] ? strtotime($account['access_token_expire_at']) : 0;

    if ($expireAt && $expireAt < time() + 600) {
        $refreshToken = $account['refresh_token'] ?? '';
        if ($refreshToken === '') {
            return ['account' => $accountName, 'success' => false, 'error' => 'Token hết hạn, cần cấp quyền lại.'];
        }
        try {
            $tokenRes = $client->refreshAccessToken($refreshToken);
            if (isset($tokenRes['code']) && $tokenRes['code'] !== '0' && $tokenRes['code'] !== 0) {
                return ['account' => $accountName, 'success' => false, 'error' => 'Làm mới token thất bại: ' . ($tokenRes['message'] ?? '')];
            }
            $accessToken = $tokenRes['access_token'] ?? '';
            $pdo->prepare("
                UPDATE lazada_connections SET
                    access_token            = ?,
                    refresh_token           = ?,
                    access_token_expire_at  = DATE_ADD(NOW(), INTERVAL ? SECOND),
                    refresh_token_expire_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
                WHERE account_id = ?
            ")->execute([
                $accessToken,
                $tokenRes['refresh_token'] ?? $refreshToken,
                (int)($tokenRes['expires_in'] ?? 604800),
                (int)($tokenRes['refresh_token_expires_in'] ?? 2592000),
                $accountId,
            ]);
        } catch (\Throwable $e) {
            return ['account' => $accountName, 'success' => false, 'error' => $e->getMessage()];
        }
    }

    // Determine sync time range
    // Priority: explicit date_from/date_to from request > last_synced_at (incremental) > sync_from_date (first sync)
    $tz = new \DateTimeZone('+07:00');

    $fromDate = $account['sync_from_date'] ?: date('Y-m-d', strtotime('-30 days'));
    $lastSync = $account['last_synced_at'];

    if ($reqDateFrom !== '' && preg_match('/^\d{4}-\d{2}-\d{2}/', $reqDateFrom)) {
        // Explicit range from UI — ignore last_synced_at
        $startTs = (new \DateTime($reqDateFrom . ' 00:00:00', $tz))->getTimestamp();
        $endTs   = ($reqDateTo !== '' && preg_match('/^\d{4}-\d{2}-\d{2}/', $reqDateTo))
                 ? (new \DateTime($reqDateTo . ' 23:59:59', $tz))->getTimestamp()
                 : time();
    } elseif ($lastSync) {
        // Incremental: only new orders since last sync (with 5-min overlap)
        $startTs = strtotime($lastSync) - 300;
        $endTs   = time();
    } else {
        // First sync — use sync_from_date
        $startTs = (new \DateTime($fromDate . ' 00:00:00', $tz))->getTimestamp();
        $endTs   = time();
    }

    $imported = 0;
    $errors   = 0;
    $limit    = 100;

    // Lazada API max range is ~30 days — chunk into windows
    $windowSecs  = 30 * 86400;
    $windowStart = $startTs;
    $firstWindow = true;

    while ($windowStart < $endTs) {
        $windowEnd    = min($windowStart + $windowSecs, $endTs);
        $createdAfter  = (new \DateTime('@' . $windowStart))->setTimezone($tz)->format('Y-m-d\TH:i:sP');
        $createdBefore = (new \DateTime('@' . $windowEnd))->setTimezone($tz)->format('Y-m-d\TH:i:sP');

        $offset = 0;
        do {
            try {
                $res = $client->getOrders($accessToken, [
                    'created_after'  => $createdAfter,
                    'created_before' => $createdBefore,
                    'offset'         => $offset,
                    'limit'          => $limit,
                    'sort_by'        => 'created_at',
                    'sort_direction' => 'ASC',
                ]);
            } catch (\Throwable $e) {
                return ['account' => $accountName, 'success' => false, 'error' => $e->getMessage()];
            }

            if (isset($res['code']) && $res['code'] !== '0' && $res['code'] !== 0) {
                $msg = $res['message'] ?? ('API error ' . ($res['code'] ?? ''));
                return ['account' => $accountName, 'success' => false, 'error' => $msg];
            }

            // Log first page of first window for debugging
            if ($firstWindow && $offset === 0) {
                log_activity('debug', 'lazada', "GetOrders [{$accountName}]", [
                    'code'           => $res['code'] ?? null,
                    'data_keys'      => isset($res['data']) ? array_keys((array)$res['data']) : null,
                    'orders_count'   => count($res['data']['orders'] ?? $res['data'] ?? []),
                    'created_after'  => $createdAfter,
                    'created_before' => $createdBefore,
                ]);
                $firstWindow = false;
            }

            $orders = $res['data']['orders'] ?? [];
            if (empty($orders)) break;

            // Collect order IDs (max 50 per items request)
            $orderIds = array_column($orders, 'order_id');
            $chunks   = array_chunk($orderIds, 50);

            $orderMap = [];
            foreach ($orders as $o) {
                $orderMap[(string)$o['order_id']] = $o;
            }

            foreach ($chunks as $chunk) {
                try {
                    $itemsRes = $client->getMultipleOrderItems($accessToken, $chunk);
                } catch (\Throwable $e) {
                    $errors += count($chunk);
                    continue;
                }

                if (isset($itemsRes['code']) && $itemsRes['code'] !== '0' && $itemsRes['code'] !== 0) {
                    $errors += count($chunk);
                    continue;
                }

                foreach ($itemsRes['data'] ?? [] as $orderItemGroup) {
                    $oid        = (string) ($orderItemGroup['order_id'] ?? '');
                    $orderItems = $orderItemGroup['order_items'] ?? [];
                    $header     = $orderMap[$oid] ?? [];
                    foreach ($orderItems as $item) {
                        try {
                            insertLazadaOrder($pdo, $header, $item);
                            $imported++;
                        } catch (\Throwable $e) {
                            $errors++;
                        }
                    }
                }
            }

            $offset += $limit;
        } while (count($orders) === $limit);

        $windowStart = $windowEnd;
    }

    // Update last_synced_at
    $pdo->prepare("UPDATE lazada_connections SET last_synced_at = NOW() WHERE account_id = ?")
        ->execute([$accountId]);

    log_activity('info', 'lazada', "Đồng bộ Lazada [{$accountName}]: +{$imported} mục, {$errors} lỗi");

    return ['account' => $accountName, 'success' => true, 'imported' => $imported, 'errors' => $errors];
}

function insertLazadaOrder(PDO $pdo, array $header, array $item): void
{
    $orderId   = (string) ($header['order_id'] ?? $item['order_id'] ?? '');
    $status    = (string) ($item['status'] ?? '');

    $normalizedStatus = normalizeLazadaStatus($status);

    // Shipping address from order header
    $addr       = $header['address_shipping'] ?? [];
    $buyerFirst = (string) ($header['customer_first_name'] ?? $addr['first_name'] ?? '');
    $buyerLast  = (string) ($header['customer_last_name']  ?? $addr['last_name']  ?? '');
    $buyerName  = trim("$buyerFirst $buyerLast") ?: null;

    $addrLine   = trim(implode(', ', array_filter([
        $addr['address1'] ?? '',
        $addr['address2'] ?? '',
    ])));
    $city = normalize_city(
        $addr['city'] ?? $addr['address4'] ?? null
    );
    $district = (string) ($addr['addressDsitrict'] ?? $addr['address3'] ?? '');

    $payMethod  = (string) ($header['payment_method'] ?? '');

    // Item-level financial data
    $itemPrice  = (float) ($item['item_price']      ?? 0);
    $paidPrice  = (float) ($item['paid_price']       ?? $itemPrice);
    $voucherAmt = abs((float) ($item['voucher_amount'] ?? 0));
    $voucherPlatform = abs((float) ($item['voucher_platform'] ?? 0));
    $voucherSeller   = abs((float) ($item['voucher_seller']   ?? 0));
    $shippingFee     = (float) ($item['shipping_amount']  ?? 0);

    // Seller discount = seller voucher; platform discount = platform voucher
    $sellerDiscount   = $voucherSeller;
    $platformDiscount = $voucherPlatform ?: ($voucherAmt - $voucherSeller);
    if ($platformDiscount < 0) $platformDiscount = 0;

    $sku         = (string) ($item['sku']      ?? $item['shop_sku'] ?? 'unknown');
    $productName = (string) ($item['name']     ?? '');
    $variation   = (string) ($item['variation'] ?? '');

    $createdAt   = (string) ($item['created_at'] ?? $header['created_at'] ?? date('Y-m-d H:i:s'));
    $updatedAt   = (string) ($item['updated_at'] ?? null);

    // Normalize ISO 8601 dates to MySQL DATETIME
    $createdAt = normalizeLazadaDatetime($createdAt);
    $updatedAt = normalizeLazadaDatetime($updatedAt);

    // Determine completed_at when status indicates delivery
    $completedAt = in_array(strtolower($status), ['delivered', 'success', 'confirmed'], true)
        ? $updatedAt
        : null;

    upsert_order($pdo, [
        'platform'                 => 'lazada',
        'order_id'                 => $orderId,
        'buyer_name'               => $buyerName,
        'buyer_username'           => null,
        'shipping_address'         => $addrLine  ?: null,
        'shipping_district'        => $district  ?: null,
        'shipping_city'            => $city,
        'payment_method'           => $payMethod ?: null,
        'sku'                      => $sku,
        'product_name'             => $productName,
        'variation'                => $variation ?: null,
        'quantity'                 => 1,
        'unit_price'               => $itemPrice,
        'subtotal_before_discount' => $itemPrice,
        'platform_discount'        => $platformDiscount,
        'seller_discount'          => $sellerDiscount,
        'subtotal_after_discount'  => $paidPrice,
        'order_total'              => (float) ($header['price'] ?? $paidPrice),
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

function normalizeLazadaStatus(string $s): string
{
    $s = strtolower(trim($s));
    if (in_array($s, ['delivered', 'success', 'confirmed'], true)) return 'completed';
    if (in_array($s, ['shipped', 'ready_to_ship', 'handover_to_logistics', 'package_dispatched'], true)) return 'delivered';
    if (str_contains($s, 'cancel') || str_contains($s, 'return') || str_contains($s, 'failed_delivery')) return 'cancelled';
    return 'pending';
}

function normalizeLazadaDatetime(?string $dt): ?string
{
    if (!$dt) return null;
    try {
        return (new \DateTime($dt))->format('Y-m-d H:i:s');
    } catch (\Throwable $e) {
        return null;
    }
}
