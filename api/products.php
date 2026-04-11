<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo    = db($config);
    $params = [];
    $where  = sql_filters($params);

    // Append completed/delivered filter
    $where .= " AND normalized_status IN ('completed','delivered')";

    $limit = min(20, max(5, (int)($_GET['limit'] ?? 10)));

    // Top by quantity
    $qtyStmt = $pdo->prepare("
        SELECT sku, product_name, platform,
               SUM(quantity) AS total_qty,
               SUM(order_total) AS total_revenue,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS order_count
        FROM orders {$where}
        GROUP BY sku, product_name, platform
        ORDER BY total_qty DESC
        LIMIT {$limit}
    ");
    $qtyStmt->execute($params);

    // Top by revenue
    $revStmt = $pdo->prepare("
        SELECT sku, product_name, platform,
               SUM(quantity) AS total_qty,
               SUM(order_total) AS total_revenue,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS order_count
        FROM orders {$where}
        GROUP BY sku, product_name, platform
        ORDER BY total_revenue DESC
        LIMIT {$limit}
    ");
    $revStmt->execute($params);

    // Total unique SKUs
    $skuCountStmt = $pdo->prepare("SELECT COUNT(DISTINCT sku) AS cnt FROM orders {$where}");
    $skuCountStmt->execute($params);
    $totalSkus = (int)$skuCountStmt->fetchColumn();

    // All products for table
    $allStmt = $pdo->prepare("
        SELECT sku, product_name, platform,
               SUM(quantity) AS total_qty,
               SUM(order_total) AS total_revenue,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS order_count
        FROM orders {$where}
        GROUP BY sku, product_name, platform
        ORDER BY total_revenue DESC
        LIMIT 50
    ");
    $allStmt->execute($params);

    $fmt = fn($rows) => array_map(fn($r) => [
        'sku'           => $r['sku'],
        'product_name'  => preg_replace('/\[.*?\]\s*/u', '', $r['product_name']),
        'platform'      => $r['platform'],
        'total_qty'     => (int)$r['total_qty'],
        'total_revenue' => (float)$r['total_revenue'],
        'order_count'   => (int)$r['order_count'],
    ], $rows);

    json_response([
        'success'     => true,
        'total_skus'  => $totalSkus,
        'top_qty'     => $fmt($qtyStmt->fetchAll()),
        'top_revenue' => $fmt($revStmt->fetchAll()),
        'all'         => $fmt($allStmt->fetchAll()),
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu sản phẩm.');
}
