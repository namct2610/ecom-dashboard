<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo = db($config);

    if (($_GET['action'] ?? '') === 'detail') {
        json_response(build_customer_detail($pdo));
    }

    json_response(build_customers_overview($pdo));
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu khách hàng.');
}

function build_customers_overview(PDO $pdo): array
{
    $params = [];
    $where  = sql_filters($params);
    $where .= " AND normalized_status IN ('completed','delivered')";
    $whereInner = preg_replace('/^\s*WHERE\s+/i', '', $where);

    $summaryStmt = $pdo->prepare("
        SELECT
            COUNT(*) AS total_orders,
            COALESCE(AVG(order_revenue), 0) AS avg_order_value,
            COUNT(DISTINCT buyer_username) AS unique_buyers
        FROM (
            SELECT platform,
                   order_id,
                   buyer_username,
                   COALESCE(MAX(order_total), 0) AS order_revenue
            FROM orders {$where}
            GROUP BY platform, order_id, buyer_username
        ) order_summary
    ");
    $summaryStmt->execute($params);
    $summary = $summaryStmt->fetch() ?: [];

    $buyerStmt = $pdo->prepare("
        SELECT buyer_username,
               COUNT(*) AS order_count,
               COALESCE(SUM(item_qty), 0) AS item_qty,
               COALESCE(SUM(order_revenue), 0) AS revenue
        FROM (
            SELECT buyer_username,
                   platform,
                   order_id,
                   COALESCE(SUM(quantity), 0) AS item_qty,
                   COALESCE(MAX(order_total), 0) AS order_revenue
            FROM orders {$where}
            AND buyer_username IS NOT NULL AND buyer_username != ''
            GROUP BY buyer_username, platform, order_id
        ) buyer_orders
        GROUP BY buyer_username
        ORDER BY revenue DESC, order_count DESC, item_qty DESC, buyer_username ASC
        LIMIT 20
    ");
    $buyerStmt->execute($params);
    $buyerStats = array_map(static fn(array $row): array => [
        'buyer_username' => (string) $row['buyer_username'],
        'order_count'    => (int) $row['order_count'],
        'item_qty'       => (int) $row['item_qty'],
        'revenue'        => (float) $row['revenue'],
    ], $buyerStmt->fetchAll());

    $cityStmt = $pdo->prepare("
        SELECT shipping_city AS city,
               COUNT(*) AS orders,
               COALESCE(SUM(order_revenue), 0) AS revenue
        FROM (
            SELECT platform,
                   order_id,
                   shipping_city,
                   COALESCE(MAX(order_total), 0) AS order_revenue
            FROM orders {$where}
            AND shipping_city IS NOT NULL AND shipping_city != '' AND platform != 'lazada'
            GROUP BY platform, order_id, shipping_city
        ) city_orders
        GROUP BY shipping_city
        ORDER BY orders DESC, revenue DESC
        LIMIT 30
    ");
    $cityStmt->execute($params);
    $cities = $cityStmt->fetchAll();

    $totalOrders = (int) ($summary['total_orders'] ?? 0);
    $cityList = array_map(static fn(array $c): array => [
        'city'       => (string) $c['city'],
        'orders'     => (int) $c['orders'],
        'revenue'    => (float) $c['revenue'],
        'percentage' => $totalOrders > 0 ? round(((int) $c['orders']) / $totalOrders * 100, 1) : 0,
    ], $cities);

    $hcmWhere = $where . " AND platform != 'lazada' AND shipping_district IS NOT NULL AND shipping_district != ''
        AND (shipping_city LIKE '%Hồ Chí Minh%' OR shipping_city LIKE '%HCM%' OR shipping_city = 'TP. Hồ Chí Minh')";
    $hcmStmt = $pdo->prepare("
        SELECT shipping_district AS district,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS orders
        FROM orders {$hcmWhere}
        GROUP BY shipping_district
        ORDER BY orders DESC
        LIMIT 20
    ");
    $hcmStmt->execute($params);

    $hanoiWhere = $where . " AND platform != 'lazada' AND shipping_district IS NOT NULL AND shipping_district != ''
        AND (shipping_city LIKE '%Hà Nội%' OR shipping_city = 'Hà Nội')";
    $hanoiStmt = $pdo->prepare("
        SELECT shipping_district AS district,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS orders
        FROM orders {$hanoiWhere}
        GROUP BY shipping_district
        ORDER BY orders DESC
        LIMIT 20
    ");
    $hanoiStmt->execute($params);

    $payStmt = $pdo->prepare("
        SELECT payment_method, COUNT(*) AS cnt
        FROM (
            SELECT platform, order_id, MAX(payment_method) AS payment_method
            FROM orders {$where}
            AND payment_method IS NOT NULL AND payment_method != ''
            GROUP BY platform, order_id
        ) payment_orders
        GROUP BY payment_method
        ORDER BY cnt DESC
        LIMIT 8
    ");
    $payStmt->execute($params);

    $segStmt = $pdo->prepare("
        SELECT
            SUM(CASE WHEN ever_cnt = 1 THEN 1 ELSE 0 END) AS new_buyers,
            SUM(CASE WHEN ever_cnt >= 2 THEN 1 ELSE 0 END) AS returning_buyers
        FROM (
            SELECT pb.buyer_username,
                   COUNT(DISTINCT CONCAT(a.platform,':',a.order_id)) AS ever_cnt
            FROM (
                SELECT DISTINCT buyer_username
                FROM orders
                WHERE {$whereInner}
                  AND buyer_username IS NOT NULL AND buyer_username != ''
            ) pb
            JOIN orders a ON a.buyer_username = pb.buyer_username
              AND a.normalized_status IN ('completed','delivered')
            GROUP BY pb.buyer_username
        ) t
    ");
    $segStmt->execute($params);
    $seg = $segStmt->fetch() ?: [];

    $potStmt = $pdo->prepare("
        SELECT COUNT(DISTINCT o.buyer_username) AS potential_buyers
        FROM orders o
        WHERE o.normalized_status IN ('completed','delivered')
          AND o.buyer_username IS NOT NULL AND o.buyer_username != ''
          AND NOT EXISTS (
              SELECT 1 FROM orders p
              WHERE {$whereInner}
                AND p.buyer_username = o.buyer_username
                AND p.buyer_username IS NOT NULL
          )
    ");
    $potStmt->execute($params);
    $pot = $potStmt->fetch() ?: [];

    $trafficParams = [];
    $trafficWhere  = sql_filters_traffic($trafficParams);
    $visitStmt = $pdo->prepare("
        SELECT COALESCE(SUM(visits), 0) AS total_visits
        FROM traffic_daily {$trafficWhere}
    ");
    $visitStmt->execute($trafficParams);
    $visitsRow   = $visitStmt->fetch() ?: [];
    $totalVisits = (int) ($visitsRow['total_visits'] ?? 0);
    $convRate    = $totalVisits > 0 ? round($totalOrders / $totalVisits * 100, 2) : 0;

    return [
        'success'           => true,
        'lazada_excluded'   => true,
        'summary'           => [
            'total_orders'    => $totalOrders,
            'avg_order_value' => round((float) ($summary['avg_order_value'] ?? 0), 0),
            'unique_buyers'   => (int) ($summary['unique_buyers'] ?? 0),
            'total_visits'    => $totalVisits,
            'conv_rate'       => $convRate,
        ],
        'customer_segments' => [
            'new_buyers'       => (int) ($seg['new_buyers'] ?? 0),
            'returning_buyers' => (int) ($seg['returning_buyers'] ?? 0),
            'potential_buyers' => (int) ($pot['potential_buyers'] ?? 0),
        ],
        'buyer_stats'       => $buyerStats,
        'city_distribution' => $cityList,
        'hcm_districts'     => $hcmStmt->fetchAll(),
        'hanoi_districts'   => $hanoiStmt->fetchAll(),
        'payment_methods'   => $payStmt->fetchAll(),
    ];
}

function build_customer_detail(PDO $pdo): array
{
    $buyerUsername = trim((string) ($_GET['buyer_username'] ?? ''));
    if ($buyerUsername === '') {
        json_error('Thiếu buyer_username.', 422);
    }

    $params = [];
    $where  = sql_filters($params);
    $where .= " AND normalized_status IN ('completed','delivered')";

    $filteredStmt = $pdo->prepare("
        SELECT COUNT(*) AS order_count,
               COALESCE(SUM(item_qty), 0) AS item_qty,
               COALESCE(SUM(order_revenue), 0) AS revenue
        FROM (
            SELECT platform,
                   order_id,
                   COALESCE(SUM(quantity), 0) AS item_qty,
                   COALESCE(MAX(order_total), 0) AS order_revenue
            FROM orders {$where}
            AND buyer_username = :buyer_username
            GROUP BY platform, order_id
        ) filtered_orders
    ");
    $filteredStmt->execute($params + [':buyer_username' => $buyerUsername]);
    $filtered = $filteredStmt->fetch() ?: [];

    $lifetimeStmt = $pdo->prepare("
        SELECT COUNT(*) AS order_count,
               COALESCE(SUM(item_qty), 0) AS item_qty,
               COALESCE(SUM(order_revenue), 0) AS revenue,
               MIN(order_created_at) AS first_purchase_at,
               MAX(order_created_at) AS last_purchase_at
        FROM (
            SELECT platform,
                   order_id,
                   MIN(order_created_at) AS order_created_at,
                   COALESCE(SUM(quantity), 0) AS item_qty,
                   COALESCE(MAX(order_total), 0) AS order_revenue
            FROM orders
            WHERE buyer_username = ?
              AND normalized_status IN ('completed','delivered')
            GROUP BY platform, order_id
        ) lifetime_orders
    ");
    $lifetimeStmt->execute([$buyerUsername]);
    $lifetime = $lifetimeStmt->fetch() ?: [];

    if ((int) ($lifetime['order_count'] ?? 0) === 0 && (int) ($filtered['order_count'] ?? 0) === 0) {
        json_error('Không tìm thấy khách hàng.', 404);
    }

    $profileStmt = $pdo->prepare("
        SELECT COALESCE(NULLIF(buyer_name, ''), buyer_username) AS buyer_name,
               buyer_username,
               shipping_address,
               shipping_district,
               shipping_city,
               order_created_at
        FROM orders
        WHERE buyer_username = ?
        ORDER BY
            (shipping_address IS NULL OR shipping_address = '') ASC,
            order_created_at DESC,
            id DESC
        LIMIT 1
    ");
    $profileStmt->execute([$buyerUsername]);
    $profile = $profileStmt->fetch() ?: [
        'buyer_name'        => $buyerUsername,
        'buyer_username'    => $buyerUsername,
        'shipping_address'  => null,
        'shipping_district' => null,
        'shipping_city'     => null,
    ];

    $historyStmt = $pdo->prepare("
        SELECT platform,
               order_id,
               MIN(order_created_at) AS order_created_at,
               MAX(order_total) AS order_total,
               MAX(normalized_status) AS normalized_status,
               COALESCE(SUM(quantity), 0) AS item_qty,
               MAX(payment_method) AS payment_method,
               MAX(shipping_address) AS shipping_address,
               MAX(shipping_district) AS shipping_district,
               MAX(shipping_city) AS shipping_city,
               SUBSTRING(GROUP_CONCAT(DISTINCT TRIM(product_name) ORDER BY product_name SEPARATOR ' • '), 1, 500) AS products
        FROM orders
        WHERE buyer_username = ?
        GROUP BY platform, order_id
        ORDER BY order_created_at DESC
        LIMIT 30
    ");
    $historyStmt->execute([$buyerUsername]);
    $orders = array_map(static fn(array $row): array => [
        'platform'          => (string) $row['platform'],
        'order_id'          => (string) $row['order_id'],
        'order_created_at'  => $row['order_created_at'],
        'order_total'       => (float) ($row['order_total'] ?? 0),
        'normalized_status' => (string) ($row['normalized_status'] ?? 'pending'),
        'item_qty'          => (int) ($row['item_qty'] ?? 0),
        'payment_method'    => (string) ($row['payment_method'] ?? ''),
        'shipping_address'  => (string) ($row['shipping_address'] ?? ''),
        'shipping_district' => (string) ($row['shipping_district'] ?? ''),
        'shipping_city'     => (string) ($row['shipping_city'] ?? ''),
        'products'          => (string) ($row['products'] ?? ''),
    ], $historyStmt->fetchAll());

    return [
        'success' => true,
        'profile' => [
            'buyer_username'    => (string) ($profile['buyer_username'] ?? $buyerUsername),
            'buyer_name'        => (string) ($profile['buyer_name'] ?? $buyerUsername),
            'shipping_address'  => (string) ($profile['shipping_address'] ?? ''),
            'shipping_district' => (string) ($profile['shipping_district'] ?? ''),
            'shipping_city'     => (string) ($profile['shipping_city'] ?? ''),
            'first_purchase_at' => $lifetime['first_purchase_at'] ?? null,
            'last_purchase_at'  => $lifetime['last_purchase_at'] ?? null,
        ],
        'summary' => [
            'filtered_order_count' => (int) ($filtered['order_count'] ?? 0),
            'filtered_item_qty'    => (int) ($filtered['item_qty'] ?? 0),
            'filtered_revenue'     => (float) ($filtered['revenue'] ?? 0),
            'lifetime_order_count' => (int) ($lifetime['order_count'] ?? 0),
            'lifetime_item_qty'    => (int) ($lifetime['item_qty'] ?? 0),
            'lifetime_revenue'     => (float) ($lifetime['revenue'] ?? 0),
        ],
        'orders' => $orders,
    ];
}
