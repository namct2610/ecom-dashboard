<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo    = db($config);
    $params = [];
    $where  = sql_filters($params, 'order_created_at', true);
    $lineRevenueExpr = "COALESCE(subtotal_after_discount, 0)";

    // Per-platform stats
    $platStmt = $pdo->prepare("
        SELECT platform,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS total_orders,
               SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN 1 ELSE 0 END) AS completed,
               SUM(CASE WHEN normalized_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
               COALESCE(SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN order_total ELSE 0 END),0) AS revenue,
               COALESCE(AVG(CASE WHEN normalized_status IN ('completed','delivered') THEN order_total END),0) AS aov,
               COUNT(DISTINCT sku) AS skus
        FROM orders {$where}
        GROUP BY platform
    ");
    $platStmt->execute($params);

    $platforms = array_fill_keys(['shopee','lazada','tiktokshop'], [
        'total_orders'=>0,'completed'=>0,'cancelled'=>0,'revenue'=>0.0,'aov'=>0.0,'skus'=>0,'cancel_rate'=>0.0,'completion_rate'=>0.0,'market_share'=>0.0
    ]);
    $totalRevAll = 0.0;
    $rows = $platStmt->fetchAll();
    foreach ($rows as $row) {
        $p = $row['platform'];
        $total = (int)$row['total_orders'];
        $rev   = (float)$row['revenue'];
        $totalRevAll += $rev;
        $platforms[$p] = [
            'total_orders'    => $total,
            'completed'       => (int)$row['completed'],
            'cancelled'       => (int)$row['cancelled'],
            'revenue'         => $rev,
            'aov'             => round((float)$row['aov'], 0),
            'skus'            => (int)$row['skus'],
            'cancel_rate'     => $total > 0 ? round((int)$row['cancelled'] / $total * 100, 1) : 0,
            'completion_rate' => $total > 0 ? round((int)$row['completed'] / $total * 100, 1) : 0,
            'market_share'    => 0.0,
        ];
    }
    // Calc market share
    foreach ($platforms as $p => &$v) {
        $v['market_share'] = $totalRevAll > 0 ? round($v['revenue'] / $totalRevAll * 100, 1) : 0;
    }

    // Top products per platform
    $topProducts = [];
    foreach (['shopee','lazada','tiktokshop'] as $p) {
        $stmt = $pdo->prepare("
            SELECT sku, product_name, SUM(quantity) AS qty, SUM({$lineRevenueExpr}) AS revenue
            FROM orders {$where} AND platform = '{$p}'
            AND normalized_status IN ('completed','delivered')
            GROUP BY sku, product_name
            ORDER BY revenue DESC
            LIMIT 5
        ");
        $stmt->execute($params);
        $topProducts[$p] = array_map(fn($r) => [
            'sku'          => $r['sku'],
            'product_name' => preg_replace('/\[.*?\]\s*/u', '', $r['product_name']),
            'qty'          => (int)$r['qty'],
            'revenue'      => (float)$r['revenue'],
        ], $stmt->fetchAll());
    }

    json_response([
        'success'      => true,
        'platforms'    => $platforms,
        'top_products' => $topProducts,
        'total_revenue'=> $totalRevAll,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu so sánh.');
}
