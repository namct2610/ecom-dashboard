<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo    = db($config);
    $params = [];
    $where  = sql_filters($params);
    $gran   = resolve_granularity();

    // Summary
    $summary = $pdo->prepare("
        SELECT
            COALESCE(SUM(order_total), 0)                                         AS total_revenue,
            COALESCE(SUM(platform_fee_fixed+platform_fee_service+platform_fee_payment), 0) AS total_fees,
            COUNT(DISTINCT CONCAT(platform,':',order_id))                         AS total_orders,
            COALESCE(SUM(quantity), 0)                                            AS total_items
        FROM orders {$where}
        AND normalized_status IN ('completed','delivered')
    ");
    $summary->execute($params);
    $s = $summary->fetch();
    $s['avg_order_value'] = (float)$s['total_orders'] > 0
        ? round((float)$s['total_revenue'] / (float)$s['total_orders'], 0)
        : 0;

    // Time series
    $tsSql = "
        SELECT {$gran['label']} AS bucket, platform,
               COALESCE(SUM(order_total), 0) AS revenue,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS orders
        FROM orders {$where}
        AND normalized_status IN ('completed','delivered')
        GROUP BY {$gran['bucket']}, platform
        ORDER BY MIN(order_created_at) ASC
    ";
    $series = [];
    $tsStmt = $pdo->prepare($tsSql);
    $tsStmt->execute($params);
    foreach ($tsStmt->fetchAll() as $row) {
        $b = $row['bucket'];
        if (!isset($series[$b])) {
            $series[$b] = ['date' => $b, 'shopee' => 0, 'lazada' => 0, 'tiktokshop' => 0, 'total' => 0, 'orders' => 0];
        }
        $series[$b][$row['platform']] = (float)$row['revenue'];
        $series[$b]['total']          += (float)$row['revenue'];
        $series[$b]['orders']         += (int)$row['orders'];
    }

    // Platform breakdown
    $bkStmt = $pdo->prepare("
        SELECT platform, COALESCE(SUM(order_total),0) AS revenue,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS orders
        FROM orders {$where}
        AND normalized_status IN ('completed','delivered')
        GROUP BY platform
    ");
    $bkStmt->execute($params);
    $totalRev = (float)$s['total_revenue'];
    $breakdown = array_fill_keys(['shopee','lazada','tiktokshop'], ['revenue'=>0,'orders'=>0,'percentage'=>0]);
    foreach ($bkStmt->fetchAll() as $row) {
        $rev = (float)$row['revenue'];
        $breakdown[$row['platform']] = [
            'revenue'    => $rev,
            'orders'     => (int)$row['orders'],
            'percentage' => $totalRev > 0 ? round($rev / $totalRev * 100, 1) : 0,
        ];
    }

    json_response([
        'success'            => true,
        'granularity'        => $gran['name'],
        'summary'            => [
            'total_revenue'    => (float)$s['total_revenue'],
            'total_fees'       => (float)$s['total_fees'],
            'total_orders'     => (int)$s['total_orders'],
            'total_items'      => (int)$s['total_items'],
            'avg_order_value'  => (float)$s['avg_order_value'],
        ],
        'timeseries'         => array_values($series),
        'platform_breakdown' => $breakdown,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu doanh thu.');
}
