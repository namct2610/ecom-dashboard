<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo    = db($config);
    $params = [];
    $where  = sql_filters($params);
    $where .= " AND normalized_status IN ('completed','delivered')";

    // Summary
    $sumStmt = $pdo->prepare("
        SELECT
            COUNT(DISTINCT CONCAT(platform,':',order_id)) AS total_orders,
            COALESCE(AVG(order_total), 0) AS avg_order_value,
            COUNT(DISTINCT buyer_username) AS unique_buyers
        FROM orders {$where}
    ");
    $sumStmt->execute($params);
    $summary = $sumStmt->fetch();

    // City distribution — Lazada excluded (platform hides address data)
    $cityWhere = $where . " AND shipping_city IS NOT NULL AND shipping_city != '' AND platform != 'lazada'";
    $cityStmt  = $pdo->prepare("
        SELECT shipping_city AS city,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS orders,
               COALESCE(SUM(order_total), 0) AS revenue
        FROM orders {$cityWhere}
        GROUP BY shipping_city
        ORDER BY orders DESC
        LIMIT 30
    ");
    $cityStmt->execute($params);
    $cities = $cityStmt->fetchAll();

    $totalOrders = (int)$summary['total_orders'];
    $cityList = array_map(fn($c) => [
        'city'       => $c['city'],
        'orders'     => (int)$c['orders'],
        'revenue'    => (float)$c['revenue'],
        'percentage' => $totalOrders > 0 ? round((int)$c['orders'] / $totalOrders * 100, 1) : 0,
    ], $cities);

    // HCM district breakdown (excluding Lazada)
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

    // Hanoi district breakdown (excluding Lazada)
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

    // Payment methods
    $payStmt = $pdo->prepare("
        SELECT payment_method, COUNT(*) AS cnt
        FROM orders {$where} AND payment_method IS NOT NULL AND payment_method != ''
        GROUP BY payment_method
        ORDER BY cnt DESC
        LIMIT 8
    ");
    $payStmt->execute($params);

    json_response([
        'success'              => true,
        'lazada_excluded'      => true,
        'summary'              => [
            'total_orders'   => $totalOrders,
            'avg_order_value'=> round((float)$summary['avg_order_value'], 0),
            'unique_buyers'  => (int)$summary['unique_buyers'],
        ],
        'city_distribution'    => $cityList,
        'hcm_districts'        => $hcmStmt->fetchAll(),
        'hanoi_districts'      => $hanoiStmt->fetchAll(),
        'payment_methods'      => $payStmt->fetchAll(),
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu khách hàng.');
}
