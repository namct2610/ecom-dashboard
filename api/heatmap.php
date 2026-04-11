<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo    = db($config);
    $params = [];

    $conditions = ['1=1'];
    $mode     = $_GET['mode']     ?? 'month';
    $period   = $_GET['period']   ?? '';
    $platform = $_GET['platform'] ?? 'all';

    if ($period !== '') {
        if ($mode === 'year' && preg_match('/^\d{4}$/', $period)) {
            $conditions[] = 'YEAR(order_created_at) = :year';
            $params[':year'] = (int)$period;
        } elseif ($mode === 'month' && preg_match('/^\d{4}-\d{2}$/', $period)) {
            $conditions[] = "DATE_FORMAT(order_created_at, '%Y-%m') = :month";
            $params[':month'] = $period;
        }
    }
    if ($platform !== 'all' && in_array($platform, ['shopee','lazada','tiktokshop'], true)) {
        $conditions[] = 'platform = :platform';
        $params[':platform'] = $platform;
    }
    $where = 'WHERE ' . implode(' AND ', $conditions);

    // Orders heatmap (weekday × hour)
    $hmStmt = $pdo->prepare("
        SELECT WEEKDAY(order_created_at) AS weekday,
               HOUR(order_created_at) AS hour,
               COUNT(*) AS orders,
               COALESCE(SUM(order_total), 0) AS revenue
        FROM orders {$where}
        GROUP BY weekday, hour
        ORDER BY weekday, hour
    ");
    $hmStmt->execute($params);

    $heatmapData = array_fill(0, 7, array_fill(0, 24, ['orders' => 0, 'revenue' => 0.0]));
    $maxOrders  = 0;
    $maxRevenue = 0.0;

    foreach ($hmStmt->fetchAll() as $row) {
        $wd = (int)$row['weekday'];
        $h  = (int)$row['hour'];
        $o  = (int)$row['orders'];
        $r  = (float)$row['revenue'];
        $heatmapData[$wd][$h] = ['orders' => $o, 'revenue' => $r];
        if ($o > $maxOrders)  $maxOrders  = $o;
        if ($r > $maxRevenue) $maxRevenue = $r;
    }

    // Flatten for frontend
    $flat = [];
    for ($wd = 0; $wd < 7; $wd++) {
        for ($h = 0; $h < 24; $h++) {
            $flat[] = [
                'weekday' => $wd,
                'hour'    => $h,
                'orders'  => $heatmapData[$wd][$h]['orders'],
                'revenue' => $heatmapData[$wd][$h]['revenue'],
            ];
        }
    }

    // Revenue by city — Lazada excluded (hides address data)
    $cityStmt = $pdo->prepare("
        SELECT shipping_city AS city,
               COALESCE(SUM(order_total),0) AS revenue,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS orders
        FROM orders {$where}
        AND shipping_city IS NOT NULL AND shipping_city != ''
        AND normalized_status IN ('completed','delivered')
        AND platform != 'lazada'
        GROUP BY shipping_city
        ORDER BY revenue DESC
        LIMIT 15
    ");
    $cityStmt->execute($params);

    json_response([
        'success'     => true,
        'heatmap'     => $flat,
        'max_orders'  => $maxOrders,
        'max_revenue' => $maxRevenue,
        'revenue_by_city' => $cityStmt->fetchAll(),
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu heatmap.');
}
