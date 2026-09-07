<?php

declare(strict_types=1);

/**
 * Read-only data export for BI tools (Power BI, Excel, Metabase…).
 *
 * This endpoint is deliberately NOT part of the session-authenticated app API.
 * A BI tool refreshes on a schedule with no browser, so it cannot carry the
 * PHPSESSID cookie or the CSRF token the app endpoints require. It authenticates
 * with a long-lived API key instead, and only ever reads.
 *
 * Auth: send the key as `Authorization: Bearer <key>` or `?key=<key>`.
 *       Keys live in config.local.php (gitignored), never in the repo:
 *
 *           'export' => ['api_keys' => ['dán-chuỗi-ngẫu-nhiên-dài-ở-đây']],
 *
 *       With no key configured the endpoint stays closed (503) so it can never
 *       be left open by accident.
 *
 * Shape: flat JSON rows, one dataset per request, so a BI tool maps it straight
 *        to a table. Paginated with limit/offset; follow `next_offset` until it
 *        is null. See docs.html (mục "API cho Power BI") for the M query.
 *
 *   GET api/export.php?dataset=datasets                 → danh mục dataset + cột
 *   GET api/export.php?dataset=orders&from=&to=&limit=&offset=
 *   GET api/export.php?dataset=settlements&limit=&offset=
 *   GET api/export.php?dataset=traffic&from=&to=&limit=&offset=
 */

require dirname(__DIR__) . '/includes/bootstrap.php';

require_method('GET');

const EXPORT_MAX_LIMIT     = 100000;
const EXPORT_DEFAULT_LIMIT = 50000;

/**
 * Every dataset is one flat SELECT. `date` names the column that `from`/`to`
 * filter on (null = not date-filterable). `order` keeps pagination stable — an
 * offset scan is only correct over a fixed sort. Columns are listed so the
 * discovery dataset can describe the schema without a second source of truth.
 */
function export_datasets(): array
{
    return [
        'orders' => [
            'label' => 'Đơn hàng (chi tiết từng dòng sản phẩm)',
            'date'  => 'order_created_at',
            'order' => 'id',
            'sql'   => "
                SELECT id, platform, order_id, sku, product_name, variation,
                       quantity, unit_price,
                       subtotal_before_discount, platform_discount, seller_voucher,
                       seller_discount, subtotal_after_discount, order_total,
                       shipping_fee, normalized_status, original_status,
                       buyer_username, buyer_name,
                       shipping_city, shipping_district, warehouse, payment_method,
                       order_created_at, order_paid_at, order_completed_at, upload_id
                FROM orders
            ",
            'cols' => [
                'id' => 'int', 'platform' => 'string', 'order_id' => 'string',
                'sku' => 'string', 'product_name' => 'string', 'variation' => 'string',
                'quantity' => 'int', 'unit_price' => 'decimal',
                'subtotal_before_discount' => 'decimal', 'platform_discount' => 'decimal',
                'seller_voucher' => 'decimal', 'seller_discount' => 'decimal',
                'subtotal_after_discount' => 'decimal', 'order_total' => 'decimal',
                'shipping_fee' => 'decimal', 'normalized_status' => 'string',
                'original_status' => 'string', 'buyer_username' => 'string',
                'buyer_name' => 'string', 'shipping_city' => 'string',
                'shipping_district' => 'string', 'warehouse' => 'string',
                'payment_method' => 'string', 'order_created_at' => 'datetime',
                'order_paid_at' => 'datetime', 'order_completed_at' => 'datetime',
                'upload_id' => 'int',
            ],
            'note' => 'Mỗi dòng là một dòng sản phẩm trong đơn. Một đơn nhiều sản phẩm sẽ có nhiều dòng cùng order_id. '
                    . 'Doanh thu = tổng subtotal_after_discount của các dòng có normalized_status là completed hoặc delivered.',
        ],
        'settlements' => [
            'label' => 'Đối soát chi phí sàn (từ báo cáo tài chính)',
            'date'  => null,
            'order' => 'platform, order_id',
            'sql'   => "
                SELECT platform, order_id,
                       fee_platform, fee_marketing, fee_promotion, fee_total,
                       details, upload_id, updated_at
                FROM order_settlements
            ",
            'cols' => [
                'platform' => 'string', 'order_id' => 'string',
                'fee_platform' => 'decimal', 'fee_marketing' => 'decimal',
                'fee_promotion' => 'decimal', 'fee_total' => 'decimal',
                'details' => 'json', 'upload_id' => 'int', 'updated_at' => 'datetime',
            ],
            'note' => 'Một dòng một đơn. Nối với orders qua (platform, order_id). '
                    . 'fee_total là chi phí thật sàn thu, đã tách 3 nhóm: platform (phí bắt buộc), '
                    . 'marketing (quảng cáo/affiliate/gói Xtra), promotion (mã giảm giá shop tự chịu).',
        ],
        'traffic' => [
            'label' => 'Lưu lượng truy cập theo ngày',
            'date'  => 'traffic_date',
            'order' => 'traffic_date, platform, device_type',
            'sql'   => "
                SELECT platform, traffic_date, device_type,
                       page_views, avg_page_views, avg_session_duration, bounce_rate,
                       visits, new_visitors, returning_visitors, new_followers, upload_id
                FROM traffic_daily
            ",
            'cols' => [
                'platform' => 'string', 'traffic_date' => 'date', 'device_type' => 'string',
                'page_views' => 'int', 'avg_page_views' => 'decimal',
                'avg_session_duration' => 'int', 'bounce_rate' => 'decimal',
                'visits' => 'int', 'new_visitors' => 'int', 'returning_visitors' => 'int',
                'new_followers' => 'int', 'upload_id' => 'int',
            ],
            'note' => 'Một dòng một (ngày × sàn × loại thiết bị). Tỷ lệ chuyển đổi = số đơn / visits, '
                    . 'ghép với dataset orders theo ngày.',
        ],
    ];
}

/** Timing-safe check of the presented key against the configured allowlist. */
function export_authorize(array $config): void
{
    $keys = $config['export']['api_keys'] ?? [];
    if (!is_array($keys) || $keys === []) {
        json_error('Xuất dữ liệu chưa được bật. Thêm export.api_keys vào config.local.php.', 503);
    }

    $header = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    $presented = '';
    if (stripos($header, 'Bearer ') === 0) {
        $presented = trim(substr($header, 7));
    } elseif (isset($_GET['key'])) {
        $presented = (string) $_GET['key'];
    }

    if ($presented === '') {
        json_error('Thiếu API key. Gửi qua header Authorization: Bearer <key> hoặc ?key=<key>.', 401);
    }

    foreach ($keys as $valid) {
        if (is_string($valid) && $valid !== '' && hash_equals($valid, $presented)) {
            return;
        }
    }
    json_error('API key không hợp lệ.', 403);
}

/** YYYY-MM-DD or null; anything malformed is treated as absent, not an error. */
function export_date_param(string $name): ?string
{
    $v = trim((string) ($_GET[$name] ?? ''));
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : null;
}

try {
    export_authorize($config);

    $datasets = export_datasets();
    $key = (string) ($_GET['dataset'] ?? '');

    // Discovery: let a BI author see every dataset and column without guessing.
    if ($key === 'datasets' || $key === '') {
        json_response([
            'success'  => true,
            'datasets' => array_map(static fn(string $name, array $d): array => [
                'name'          => $name,
                'label'         => $d['label'],
                'date_filter'   => $d['date'],
                'columns'       => $d['cols'],
                'note'          => $d['note'],
            ], array_keys($datasets), array_values($datasets)),
            'auth'  => 'Authorization: Bearer <key>  |  ?key=<key>',
            'usage' => 'api/export.php?dataset=orders&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50000&offset=0',
        ]);
    }

    if (!isset($datasets[$key])) {
        json_error('Dataset không tồn tại: ' . $key . '. Gọi ?dataset=datasets để xem danh mục.', 404);
    }
    $def = $datasets[$key];

    $limit  = (int) ($_GET['limit'] ?? EXPORT_DEFAULT_LIMIT);
    $limit  = max(1, min(EXPORT_MAX_LIMIT, $limit));
    $offset = max(0, (int) ($_GET['offset'] ?? 0));

    $where  = [];
    $params = [];
    if ($def['date'] !== null) {
        $from = export_date_param('from');
        $to   = export_date_param('to');
        if ($from !== null) { $where[] = "{$def['date']} >= :from"; $params[':from'] = $from . ' 00:00:00'; }
        if ($to !== null) {
            // Inclusive of the whole `to` day: compare against the next midnight.
            $toExcl = (new DateTimeImmutable($to))->modify('+1 day')->format('Y-m-d');
            $where[] = "{$def['date']} < :to_excl"; $params[':to_excl'] = $toExcl . ' 00:00:00';
        }
    }

    $pdo = db($config);
    $sql = trim($def['sql']);
    if ($where !== []) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= " ORDER BY {$def['order']} LIMIT " . ($limit + 1) . " OFFSET {$offset}";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Fetch one extra row to know whether another page exists without a COUNT(*).
    $hasMore = count($rows) > $limit;
    if ($hasMore) {
        array_pop($rows);
    }

    // Numeric/date columns come back as strings from PDO; cast them so Power BI
    // types the column correctly instead of importing everything as text.
    $cols = $def['cols'];
    foreach ($rows as &$row) {
        foreach ($row as $col => $val) {
            if ($val === null) { continue; }
            $type = $cols[$col] ?? 'string';
            if ($type === 'int') {
                $row[$col] = (int) $val;
            } elseif ($type === 'decimal') {
                $row[$col] = (float) $val;
            } elseif ($type === 'json' && is_string($val)) {
                $decoded = json_decode($val, true);
                $row[$col] = $decoded === null ? $val : $decoded;
            }
        }
    }
    unset($row);

    json_response([
        'success'     => true,
        'dataset'     => $key,
        'count'       => count($rows),
        'limit'       => $limit,
        'offset'      => $offset,
        'next_offset' => $hasMore ? $offset + $limit : null,
        'rows'        => $rows,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Xuất dữ liệu thất bại.');
}
