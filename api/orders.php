<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo    = db($config);
    $params = [];
    $where  = sql_filters($params, 'order_created_at', true);
    $gran  = resolve_granularity();

    // Status summary
    $statStmt = $pdo->prepare("
        SELECT normalized_status, COUNT(DISTINCT CONCAT(platform,':',order_id)) AS cnt
        FROM orders {$where}
        GROUP BY normalized_status
    ");
    $statStmt->execute($params);
    $statusMap = array_column($statStmt->fetchAll(), 'cnt', 'normalized_status');

    $total     = array_sum($statusMap);
    $completed = ($statusMap['completed'] ?? 0) + ($statusMap['delivered'] ?? 0);
    $cancelled = $statusMap['cancelled'] ?? 0;
    $pending   = $statusMap['pending'] ?? 0;

    // By platform
    $platStmt = $pdo->prepare("
        SELECT platform, normalized_status, COUNT(DISTINCT CONCAT(platform,':',order_id)) AS cnt
        FROM orders {$where}
        GROUP BY platform, normalized_status
    ");
    $platStmt->execute($params);
    $byPlatform = array_fill_keys(['shopee','lazada','tiktokshop'], ['total'=>0,'completed'=>0,'cancelled'=>0,'pending'=>0]);
    foreach ($platStmt->fetchAll() as $row) {
        $p = $row['platform'];
        $byPlatform[$p]['total'] += (int)$row['cnt'];
        if (in_array($row['normalized_status'], ['completed','delivered'], true)) {
            $byPlatform[$p]['completed'] += (int)$row['cnt'];
        } elseif ($row['normalized_status'] === 'cancelled') {
            $byPlatform[$p]['cancelled'] += (int)$row['cnt'];
        } else {
            $byPlatform[$p]['pending'] += (int)$row['cnt'];
        }
    }

    // Time series
    $tsSql = "
        SELECT {$gran['label']} AS bucket,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS total,
               SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN 1 ELSE 0 END) AS completed,
               SUM(CASE WHEN normalized_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
               SUM(CASE WHEN platform='shopee' THEN 1 ELSE 0 END) AS shopee,
               SUM(CASE WHEN platform='lazada' THEN 1 ELSE 0 END) AS lazada,
               SUM(CASE WHEN platform='tiktokshop' THEN 1 ELSE 0 END) AS tiktokshop
        FROM orders {$where}
        GROUP BY {$gran['bucket']}
        ORDER BY MIN(order_created_at) ASC
    ";
    $tsStmt = $pdo->prepare($tsSql);
    $tsStmt->execute($params);
    $timeseries = $tsStmt->fetchAll();

    // Recent orders (100 so frontend can paginate)
    $recentStmt = $pdo->prepare("
        SELECT order_id, platform, normalized_status, product_name, order_total,
               shipping_city, order_created_at
        FROM orders {$where}
        ORDER BY order_created_at DESC
        LIMIT 100
    ");
    $recentStmt->execute($params);
    $recent = $recentStmt->fetchAll();

    // Hourly heatmap (for orders page quick view)
    $hourStmt = $pdo->prepare("
        SELECT HOUR(order_created_at) AS hr, COUNT(*) AS cnt
        FROM orders {$where}
        GROUP BY hr ORDER BY hr
    ");
    $hourStmt->execute($params);
    $hourly = array_fill(0, 24, 0);
    foreach ($hourStmt->fetchAll() as $row) $hourly[(int)$row['hr']] = (int)$row['cnt'];

    json_response([
        'success'     => true,
        'granularity' => $gran['name'],
        'summary'     => [
            'total'       => (int)$total,
            'completed'   => (int)$completed,
            'cancelled'   => (int)$cancelled,
            'pending'     => (int)$pending,
            'cancel_rate' => $total > 0 ? round($cancelled / $total * 100, 1) : 0,
        ],
        'by_platform' => $byPlatform,
        'timeseries'  => array_map(fn($r) => [
            'date'       => $r['bucket'],
            'total'      => (int)$r['total'],
            'completed'  => (int)$r['completed'],
            'cancelled'  => (int)$r['cancelled'],
            'shopee'     => (int)$r['shopee'],
            'lazada'     => (int)$r['lazada'],
            'tiktokshop' => (int)$r['tiktokshop'],
        ], $timeseries),
        'recent'      => $recent,
        'hourly'      => $hourly,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu đơn hàng.');
}
