<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';
require_once dirname(__DIR__) . '/includes/SkuExpander.php';

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
    $viewMode = ($_GET['view_mode'] ?? 'combo') === 'sku' ? 'sku' : 'combo';
    $expander = $viewMode === 'sku' ? new SkuExpander($pdo) : null;

    // Helper: aggregate all SKU rows from orders for the current filter
    $aggregateAllStmt = $pdo->prepare("
        SELECT sku, product_name, platform,
               SUM(quantity) AS total_qty,
               SUM({$lineRevenueExpr}) AS total_revenue,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS order_count
        FROM orders {$where}
        GROUP BY sku, product_name, platform
    ");
    $aggregateAllStmt->execute($params);
    $allRowsRaw = $aggregateAllStmt->fetchAll();

    // Normalize numeric types
    $normalize = static fn($r) => [
        'sku'           => (string) $r['sku'],
        'product_name'  => preg_replace('/\[.*?\]\s*/u', '', (string) $r['product_name']),
        'platform'      => (string) $r['platform'],
        'total_qty'     => (int) $r['total_qty'],
        'total_revenue' => (float) $r['total_revenue'],
        'order_count'   => (int) $r['order_count'],
    ];
    $allRows = array_map($normalize, $allRowsRaw);

    if ($expander) {
        $allRows = $expander->expandAndAggregate($allRows);
    }

    // Sort by revenue desc once, derive top lists
    usort($allRows, static fn($a, $b) => $b['total_revenue'] <=> $a['total_revenue']);
    $topRevenue = array_slice($allRows, 0, $limit);

    $byQty = $allRows;
    usort($byQty, static fn($a, $b) => $b['total_qty'] <=> $a['total_qty']);
    $topQty = array_slice($byQty, 0, $limit);

    // All for table (cap 50 by revenue)
    $allForTable = array_slice($allRows, 0, 50);

    // Totals
    $totalSkus = count(array_unique(array_map(static fn($r) => strtoupper(trim($r['sku'])), $allRows)));
    $totalQtyDelivered = (int) array_sum(array_map(static fn($r) => (int) $r['total_qty'], $allRows));

    // Total qty sold — all orders incl. cancelled (with expansion if SKU mode)
    $qtyAllStmt = $pdo->prepare("
        SELECT sku, platform, SUM(quantity) AS total_qty, 0 AS total_revenue, 0 AS order_count, '' AS product_name
        FROM orders {$whereAll}
        GROUP BY sku, platform
    ");
    $qtyAllStmt->execute($paramsAll);
    $rowsAllStatus = array_map($normalize, $qtyAllStmt->fetchAll());
    if ($expander) {
        $rowsAllStatus = $expander->expandAndAggregate($rowsAllStatus);
    }
    $totalQtyAll = (int) array_sum(array_map(static fn($r) => (int) $r['total_qty'], $rowsAllStatus));

    // Avg qty per order — total_qty_delivered / distinct orders (orders count unchanged by expansion)
    $orderCountStmt = $pdo->prepare("SELECT COUNT(DISTINCT CONCAT(platform,':',order_id)) FROM orders {$where}");
    $orderCountStmt->execute($params);
    $distinctOrders = (int) $orderCountStmt->fetchColumn();
    $avgQtyPerOrder = $distinctOrders > 0 ? round($totalQtyDelivered / $distinctOrders, 2) : 0.0;

    // Brand breakdown — group by prefix from the (possibly expanded) rows
    $byBrand = [];
    foreach ($allRows as $r) {
        $skuTrim = trim($r['sku']);
        if ($skuTrim === '' || strlen($skuTrim) < 3) { continue; }
        $prefix = strtoupper(substr($skuTrim, 0, 3));
        if (!isset($byBrand[$prefix])) {
            $byBrand[$prefix] = [
                'prefix'        => $prefix,
                'sku_set'       => [],
                'order_count'   => 0,
                'total_qty'     => 0,
                'total_revenue' => 0.0,
            ];
        }
        $byBrand[$prefix]['sku_set'][strtoupper($skuTrim)] = true;
        $byBrand[$prefix]['order_count']   += (int) $r['order_count'];
        $byBrand[$prefix]['total_qty']     += (int) $r['total_qty'];
        $byBrand[$prefix]['total_revenue'] += (float) $r['total_revenue'];
    }
    $brandTotalQty = 0; $brandTotalRevenue = 0.0;
    foreach ($byBrand as $b) { $brandTotalQty += $b['total_qty']; $brandTotalRevenue += $b['total_revenue']; }
    $brandBreakdown = [];
    foreach ($byBrand as $prefix => $b) {
        $brandBreakdown[] = [
            'prefix'        => $prefix,
            'brand_name'    => $brandMap[$prefix] ?? $prefix,
            'is_configured' => isset($brandMap[$prefix]),
            'sku_count'     => count($b['sku_set']),
            'order_count'   => $b['order_count'],
            'total_qty'     => $b['total_qty'],
            'total_revenue' => $b['total_revenue'],
            'qty_share'     => $brandTotalQty > 0 ? round($b['total_qty'] / $brandTotalQty * 100, 2) : 0.0,
            'revenue_share' => $brandTotalRevenue > 0 ? round($b['total_revenue'] / $brandTotalRevenue * 100, 2) : 0.0,
        ];
    }
    usort($brandBreakdown, static fn($a, $b) => $b['total_revenue'] <=> $a['total_revenue']);

    json_response([
        'success'            => true,
        'view_mode'          => $viewMode,
        'total_skus'         => $totalSkus,
        'total_qty_all'      => $totalQtyAll,
        'total_qty_delivered'=> $totalQtyDelivered,
        'avg_qty_per_order'  => $avgQtyPerOrder,
        'top_qty'            => $topQty,
        'top_revenue'        => $topRevenue,
        'brand_breakdown'    => $brandBreakdown,
        'brand_totals'       => [
            'total_qty'     => (int) $brandTotalQty,
            'total_revenue' => (float) $brandTotalRevenue,
        ],
        'all'                => $allForTable,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu sản phẩm.');
}
