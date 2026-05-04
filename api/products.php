<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo       = db($config);
    $brandMap  = sku_brand_rule_map(load_sku_brand_rules($pdo));
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

    // Brand contribution — SKU prefix (first 3 chars) mapped through SKU brand rules
    $brandStmt = $pdo->prepare("
        SELECT UPPER(LEFT(TRIM(sku), 3)) AS prefix,
               COALESCE(SUM(quantity), 0) AS total_qty,
               COALESCE(SUM({$lineRevenueExpr}), 0) AS total_revenue,
               COUNT(DISTINCT CONCAT(platform, ':', order_id)) AS order_count,
               COUNT(DISTINCT UPPER(TRIM(sku))) AS sku_count
        FROM orders {$where}
          AND sku IS NOT NULL
          AND TRIM(sku) != ''
          AND CHAR_LENGTH(TRIM(sku)) >= 3
        GROUP BY UPPER(LEFT(TRIM(sku), 3))
        ORDER BY total_revenue DESC, total_qty DESC
    ");
    $brandStmt->execute($params);
    $brandRows = $brandStmt->fetchAll();
    $brandTotalQty = array_sum(array_map(static fn(array $row): int => (int) $row['total_qty'], $brandRows));
    $brandTotalRevenue = array_sum(array_map(static fn(array $row): float => (float) $row['total_revenue'], $brandRows));

    $brandBreakdown = array_map(static function (array $row) use ($brandMap, $brandTotalQty, $brandTotalRevenue): array {
        $prefix = (string) $row['prefix'];
        $qty = (int) $row['total_qty'];
        $revenue = (float) $row['total_revenue'];

        return [
            'prefix'        => $prefix,
            'brand_name'    => $brandMap[$prefix] ?? $prefix,
            'is_configured' => isset($brandMap[$prefix]),
            'sku_count'     => (int) $row['sku_count'],
            'order_count'   => (int) $row['order_count'],
            'total_qty'     => $qty,
            'total_revenue' => $revenue,
            'qty_share'     => $brandTotalQty > 0 ? round($qty / $brandTotalQty * 100, 2) : 0.0,
            'revenue_share' => $brandTotalRevenue > 0 ? round($revenue / $brandTotalRevenue * 100, 2) : 0.0,
        ];
    }, $brandRows);

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
        'brand_breakdown'    => $brandBreakdown,
        'brand_totals'       => [
            'total_qty'     => (int) $brandTotalQty,
            'total_revenue' => (float) $brandTotalRevenue,
        ],
        'all'                => $fmt($allStmt->fetchAll()),
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu sản phẩm.');
}
