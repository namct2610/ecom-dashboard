<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';
require_once dirname(__DIR__) . '/includes/SkuExpander.php';

require_auth();
require_method('GET');

try {
    $pdo = db($config);
    $brandMap = sku_brand_rule_map(load_sku_brand_rules($pdo));

    $params = [];
    $where = sql_filters($params, 'order_created_at', true);

    $statusStmt = $pdo->prepare("
        SELECT normalized_status,
               COUNT(DISTINCT CONCAT(platform, ':', order_id)) AS cnt
        FROM orders {$where}
        GROUP BY normalized_status
    ");
    $statusStmt->execute($params);
    $statusRaw = array_column($statusStmt->fetchAll(), 'cnt', 'normalized_status');
    $status = [
        'completed' => (int) (($statusRaw['completed'] ?? 0) + ($statusRaw['delivered'] ?? 0)),
        'delivered' => (int) ($statusRaw['delivered'] ?? 0),
        'cancelled' => (int) ($statusRaw['cancelled'] ?? 0),
        'pending' => (int) ($statusRaw['pending'] ?? 0),
    ];

    $detailWhere = $where . " AND normalized_status IN ('completed','delivered')";

    $prodStmt = $pdo->prepare("
        SELECT UPPER(TRIM(sku)) AS sku,
               COALESCE(MAX(NULLIF(product_name,'')),'') AS name,
               platform,
               SUM(quantity) AS qty,
               SUM(subtotal_after_discount) AS revenue,
               COUNT(DISTINCT CONCAT(platform, ':', order_id)) AS order_count
        FROM orders {$detailWhere}
        AND sku IS NOT NULL AND TRIM(sku) <> ''
        GROUP BY UPPER(TRIM(sku)), platform
    ");
    $prodStmt->execute($params);
    $products = array_map(static fn(array $row): array => [
        'sku' => (string) $row['sku'],
        'name' => (string) ($row['name'] ?? ''),
        'platform' => (string) $row['platform'],
        'qty' => (int) $row['qty'],
        'revenue' => (float) $row['revenue'],
        'order_count' => (int) $row['order_count'],
    ], $prodStmt->fetchAll());

    $expander = new SkuExpander($pdo);
    $expandedProducts = $expander->expandAndAggregate(array_map(static fn(array $row): array => [
        'sku' => $row['sku'],
        'product_name' => $row['name'],
        'platform' => $row['platform'],
        'total_qty' => $row['qty'],
        'total_revenue' => $row['revenue'],
        'order_count' => $row['order_count'],
    ], $products));

    $normalizePlatform = static fn(string $platform): string => $platform === 'tiktokshop' ? 'tiktok' : $platform;
    $normalizeProduct = static fn(array $row): array => [
        'sku' => (string) ($row['sku'] ?? ''),
        'name' => preg_replace('/\[.*?\]\s*/u', '', (string) ($row['product_name'] ?? '')),
        'platform' => $normalizePlatform((string) ($row['platform'] ?? '')),
        'qty' => (int) ($row['total_qty'] ?? 0),
        'revenue' => (float) ($row['total_revenue'] ?? 0),
    ];
    $expandedProducts = array_map($normalizeProduct, $expandedProducts);
    usort($expandedProducts, static fn(array $a, array $b): int => $b['revenue'] <=> $a['revenue']);
    $topRev = array_slice($expandedProducts, 0, 15);
    $topQty = $expandedProducts;
    usort($topQty, static fn(array $a, array $b): int => $b['qty'] <=> $a['qty']);
    $topQty = array_slice($topQty, 0, 15);

    $cityStmt = $pdo->prepare("
        SELECT COALESCE(NULLIF(TRIM(shipping_city),''),'(Không rõ)') AS city,
               COUNT(DISTINCT CONCAT(platform, ':', order_id)) AS orders,
               SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN order_total ELSE 0 END) AS revenue
        FROM orders {$where}
          AND platform != 'lazada'
        GROUP BY city
        ORDER BY orders DESC, revenue DESC
        LIMIT 30
    ");
    $cityStmt->execute($params);
    $cities = array_map(static fn(array $row): array => [
        'city' => (string) $row['city'],
        'orders' => (int) $row['orders'],
        'revenue' => (float) $row['revenue'],
    ], $cityStmt->fetchAll());

    $heatStmt = $pdo->prepare("
        SELECT ((DAYOFWEEK(order_created_at) + 5) % 7) AS weekday,
               HOUR(order_created_at) AS hour,
               COUNT(DISTINCT CONCAT(platform, ':', order_id)) AS orders
        FROM orders {$detailWhere}
        GROUP BY weekday, hour
        ORDER BY weekday, hour
    ");
    $heatStmt->execute($params);
    $heat = array_map(static fn(array $row): array => [
        'weekday' => (int) $row['weekday'],
        'hour' => (int) $row['hour'],
        'orders' => (int) $row['orders'],
    ], $heatStmt->fetchAll());

    $recentStmt = $pdo->prepare("
        SELECT order_id,
               platform,
               normalized_status,
               COALESCE(MAX(product_name), '') AS product,
               COALESCE(MAX(order_total), 0) AS amount,
               COALESCE(MAX(shipping_city), '') AS city,
               MIN(order_created_at) AS created,
               COUNT(*) AS items
        FROM orders {$where}
        GROUP BY platform, order_id, normalized_status
        ORDER BY MIN(order_created_at) DESC
        LIMIT 40
    ");
    $recentStmt->execute($params);
    $recent = array_map(static fn(array $row): array => [
        'order_id' => (string) $row['order_id'],
        'platform' => $normalizePlatform((string) $row['platform']),
        'status' => (string) $row['normalized_status'],
        'product' => preg_replace('/\[.*?\]\s*/u', '', (string) ($row['product'] ?? '')),
        'amount' => (float) $row['amount'],
        'city' => (string) ($row['city'] ?? ''),
        'created' => (string) ($row['created'] ?? ''),
        'items' => (int) $row['items'],
    ], $recentStmt->fetchAll());

    json_response([
        'success' => true,
        'status' => $status,
        'topRev' => $topRev,
        'topQty' => $topQty,
        'city' => $cities,
        'heat' => $heat,
        'recentOrders' => $recent,
        'brand_map' => $brandMap,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu chi tiết theo khoảng thời gian.');
}
