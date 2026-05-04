<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

function analytics_request_filters(): array
{
    $productSku = trim((string) ($_GET['product_sku'] ?? ''));
    if (strtolower($productSku) === 'all') {
        $productSku = '';
    }
    $productSku = strtoupper(substr($productSku, 0, 100));

    $brandRaw = trim((string) ($_GET['brand_prefix'] ?? ''));
    if (strtolower($brandRaw) === 'all') {
        $brandRaw = '';
    }
    $brandPrefix = normalize_sku_brand_prefix($brandRaw);
    if ($brandPrefix !== '' && strlen($brandPrefix) !== 3) {
        json_error('Bộ lọc thương hiệu không hợp lệ.', 422);
    }

    return [$productSku, $brandPrefix];
}

function append_analytics_filters(string $where, array &$params, string $productSku, string $brandPrefix): string
{
    if ($productSku !== '') {
        $where .= ' AND UPPER(TRIM(sku)) = :analytics_product_sku';
        $params[':analytics_product_sku'] = $productSku;
    }

    if ($brandPrefix !== '') {
        $where .= ' AND UPPER(LEFT(TRIM(sku), 3)) = :analytics_brand_prefix';
        $params[':analytics_brand_prefix'] = $brandPrefix;
    }

    return $where;
}

function fetch_analytics_filter_options(PDO $pdo, string $baseWhere, array $baseParams, array $brandMap): array
{
    $optionWhere = $baseWhere . "
        AND normalized_status IN ('completed','delivered')
        AND sku IS NOT NULL
        AND TRIM(sku) != ''
    ";

    $productStmt = $pdo->prepare("
        SELECT UPPER(TRIM(sku)) AS sku,
               COALESCE(MAX(NULLIF(product_name, '')), '') AS product_name,
               COALESCE(SUM(quantity), 0) AS total_qty,
               COALESCE(SUM(subtotal_after_discount), 0) AS total_revenue,
               COUNT(DISTINCT CONCAT(platform, ':', order_id)) AS order_count
        FROM orders {$optionWhere}
        GROUP BY UPPER(TRIM(sku))
        ORDER BY total_revenue DESC, total_qty DESC
        LIMIT 250
    ");
    $productStmt->execute($baseParams);

    $brandStmt = $pdo->prepare("
        SELECT UPPER(LEFT(TRIM(sku), 3)) AS prefix,
               COALESCE(SUM(quantity), 0) AS total_qty,
               COALESCE(SUM(subtotal_after_discount), 0) AS total_revenue,
               COUNT(DISTINCT CONCAT(platform, ':', order_id)) AS order_count,
               COUNT(DISTINCT UPPER(TRIM(sku))) AS sku_count
        FROM orders {$optionWhere}
          AND CHAR_LENGTH(TRIM(sku)) >= 3
        GROUP BY UPPER(LEFT(TRIM(sku), 3))
        ORDER BY total_revenue DESC, total_qty DESC
        LIMIT 100
    ");
    $brandStmt->execute($baseParams);

    $products = array_map(static fn(array $row): array => [
        'sku'           => (string) $row['sku'],
        'product_name'  => preg_replace('/\[.*?\]\s*/u', '', (string) ($row['product_name'] ?? '')),
        'total_qty'     => (int) $row['total_qty'],
        'total_revenue' => (float) $row['total_revenue'],
        'order_count'   => (int) $row['order_count'],
    ], $productStmt->fetchAll());

    $brands = array_map(static fn(array $row): array => [
        'prefix'        => (string) $row['prefix'],
        'brand_name'    => $brandMap[(string) $row['prefix']] ?? (string) $row['prefix'],
        'is_configured' => isset($brandMap[(string) $row['prefix']]),
        'sku_count'     => (int) $row['sku_count'],
        'total_qty'     => (int) $row['total_qty'],
        'total_revenue' => (float) $row['total_revenue'],
        'order_count'   => (int) $row['order_count'],
    ], $brandStmt->fetchAll());

    return [$products, $brands];
}

try {
    $pdo = db($config);
    $brandRules = load_sku_brand_rules($pdo);
    $brandMap = sku_brand_rule_map($brandRules);

    $baseParams = [];
    $baseWhere = sql_filters($baseParams);
    [$productSku, $brandPrefix] = analytics_request_filters();
    [$productOptions, $brandOptions] = fetch_analytics_filter_options($pdo, $baseWhere, $baseParams, $brandMap);

    $params = $baseParams;
    $where = append_analytics_filters($baseWhere, $params, $productSku, $brandPrefix);

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
        'filters' => [
            'products' => $productOptions,
            'brands'   => $brandOptions,
            'active'   => [
                'product_sku'  => $productSku,
                'brand_prefix' => $brandPrefix,
                'brand_name'   => $brandPrefix !== '' ? ($brandMap[$brandPrefix] ?? $brandPrefix) : '',
            ],
        ],
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu heatmap.');
}
