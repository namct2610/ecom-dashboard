<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo       = db($config);
    $paramsAll = [];
    $whereAll  = sql_filters($paramsAll);   // no status filter — for "all incl. cancelled"

    $params = $paramsAll;
    $where  = $whereAll . " AND normalized_status IN ('completed','delivered')";
    $lineRevenueExpr = "COALESCE(subtotal_after_discount, 0)";

    $limit = min(20, max(5, (int)($_GET['limit'] ?? 10)));

    // Top by quantity
    $qtyStmt = $pdo->prepare("
        SELECT sku, product_name, platform,
               SUM(quantity) AS total_qty,
               SUM({$lineRevenueExpr}) AS total_revenue,
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
               SUM({$lineRevenueExpr}) AS total_revenue,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS order_count
        FROM orders {$where}
        GROUP BY sku, product_name, platform
        ORDER BY total_revenue DESC
        LIMIT {$limit}
    ");
    $revStmt->execute($params);

    // Total unique SKUs (completed/delivered only)
    $skuCountStmt = $pdo->prepare("SELECT COUNT(DISTINCT sku) AS cnt FROM orders {$where}");
    $skuCountStmt->execute($params);
    $totalSkus = (int)$skuCountStmt->fetchColumn();

    // Total qty sold — all orders incl. cancelled
    $qtyAllStmt = $pdo->prepare("SELECT COALESCE(SUM(quantity),0) FROM orders {$whereAll}");
    $qtyAllStmt->execute($paramsAll);
    $totalQtyAll = (int)$qtyAllStmt->fetchColumn();

    // Total qty delivered — completed/delivered only
    $qtyDelStmt = $pdo->prepare("SELECT COALESCE(SUM(quantity),0) FROM orders {$where}");
    $qtyDelStmt->execute($params);
    $totalQtyDelivered = (int)$qtyDelStmt->fetchColumn();

    // Avg qty per order — total_qty_delivered / distinct orders (completed/delivered)
    $avgStmt = $pdo->prepare("
        SELECT COALESCE(SUM(quantity),0) AS qty,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS orders
        FROM orders {$where}
    ");
    $avgStmt->execute($params);
    $avgRow = $avgStmt->fetch();
    $avgQtyPerOrder = $avgRow['orders'] > 0
        ? round((float)$avgRow['qty'] / (int)$avgRow['orders'], 2)
        : 0.0;

    // All products for table
    $allStmt = $pdo->prepare("
        SELECT sku, product_name, platform,
               SUM(quantity) AS total_qty,
               SUM({$lineRevenueExpr}) AS total_revenue,
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
        'success'            => true,
        'total_skus'         => $totalSkus,
        'total_qty_all'      => $totalQtyAll,
        'total_qty_delivered'=> $totalQtyDelivered,
        'avg_qty_per_order'  => $avgQtyPerOrder,
        'top_qty'            => $fmt($qtyStmt->fetchAll()),
        'top_revenue'        => $fmt($revStmt->fetchAll()),
        'all'                => $fmt($allStmt->fetchAll()),
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu sản phẩm.');
}
