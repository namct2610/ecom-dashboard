<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo    = db($config);
    $params = [];
    $where  = sql_filters_traffic($params);
    $gran   = resolve_granularity_traffic();

    // Summary
    $sumStmt = $pdo->prepare("
        SELECT COALESCE(SUM(page_views),0) AS total_views,
               COALESCE(SUM(visits),0) AS total_visits,
               COALESCE(SUM(new_visitors),0) AS total_new_visitors,
               COALESCE(AVG(bounce_rate),0) AS avg_bounce_rate
        FROM traffic_daily {$where}
    ");
    $sumStmt->execute($params);
    $summary = $sumStmt->fetch();

    // Time series
    $tsSql = "
        SELECT {$gran['label']} AS bucket, platform,
               SUM(page_views) AS views, SUM(visits) AS visits
        FROM traffic_daily {$where}
        GROUP BY {$gran['bucket']}, platform
        ORDER BY MIN(traffic_date) ASC
    ";
    $tsStmt = $pdo->prepare($tsSql);
    $tsStmt->execute($params);
    $series = [];
    foreach ($tsStmt->fetchAll() as $row) {
        $b = $row['bucket'];
        if (!isset($series[$b])) {
            $series[$b] = ['date' => $b, 'shopee' => 0, 'lazada' => 0, 'tiktokshop' => 0,
                           'shopee_v' => 0, 'lazada_v' => 0, 'tiktokshop_v' => 0,
                           'total_views' => 0, 'total_visits' => 0];
        }
        $series[$b][$row['platform']]             = (int)$row['views'];
        $series[$b][$row['platform'] . '_v']      = (int)$row['visits'];
        $series[$b]['total_views']  += (int)$row['views'];
        $series[$b]['total_visits'] += (int)$row['visits'];
    }

    // Platform breakdown
    $platStmt = $pdo->prepare("
        SELECT platform,
               SUM(page_views) AS views, SUM(visits) AS visits,
               SUM(new_visitors) AS new_visitors,
               AVG(bounce_rate) AS bounce_rate
        FROM traffic_daily {$where}
        GROUP BY platform
    ");
    $platStmt->execute($params);
    $byPlatform = array_fill_keys(['shopee','lazada','tiktokshop'], ['views'=>0,'visits'=>0,'new_visitors'=>0,'bounce_rate'=>0]);
    foreach ($platStmt->fetchAll() as $row) {
        $byPlatform[$row['platform']] = [
            'views'        => (int)$row['views'],
            'visits'       => (int)$row['visits'],
            'new_visitors' => (int)$row['new_visitors'],
            'bounce_rate'  => round((float)$row['bounce_rate'], 1),
        ];
    }

    // Orders by date for correlation chart
    $orderParams = [];
    $orderWhere  = sql_filters($orderParams);
    $orderWhere .= " AND normalized_status IN ('completed','delivered')";
    $ordGran = resolve_granularity();
    $ordStmt = $pdo->prepare("
        SELECT {$ordGran['label']} AS bucket, COUNT(DISTINCT CONCAT(platform,':',order_id)) AS orders
        FROM orders {$orderWhere}
        GROUP BY {$ordGran['bucket']}
        ORDER BY MIN(order_created_at) ASC
    ");
    $ordStmt->execute($orderParams);
    $ordersByDate = array_column($ordStmt->fetchAll(), 'orders', 'bucket');

    json_response([
        'success'     => true,
        'granularity' => $gran['name'],
        'summary'     => [
            'total_views'      => (int)$summary['total_views'],
            'total_visits'     => (int)$summary['total_visits'],
            'total_new_visitors'=> (int)$summary['total_new_visitors'],
            'avg_bounce_rate'  => round((float)$summary['avg_bounce_rate'], 1),
        ],
        'timeseries'   => array_values($series),
        'by_platform'  => $byPlatform,
        'orders_by_date'=> $ordersByDate,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu traffic.');
}
