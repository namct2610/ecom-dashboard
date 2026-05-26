<?php

declare(strict_types=1);

// Sinh window.DASHBOARD_DATA cho Beta UI từ database production.
// Truy vấn tháng hiện tại (Y-m).

require dirname(__DIR__) . '/includes/bootstrap.php';

if (current_user() === null) {
    header('Content-Type: application/javascript; charset=utf-8');
    echo "window.DASHBOARD_DATA = {};\n";
    exit;
}

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');

// Output a default empty shape immediately so the React UI never hangs
// even if a query fails — we'll overwrite it on success.
$emptyPlat = ['orders' => 0, 'completed' => 0, 'cancelled' => 0, 'revenue' => 0];
$defaultData = [
    'period' => date('Y-m'),
    'summary' => [
        'total_orders' => 0, 'completed_orders' => 0, 'cancelled_orders' => 0,
        'shipping_orders' => 0, 'cancel_rate' => 0, 'total_revenue' => 0,
        'avg_order_value' => 0, 'total_page_views' => 0, 'total_visitors' => 0,
        'shopee' => $emptyPlat, 'lazada' => $emptyPlat, 'tiktok' => $emptyPlat,
    ],
    'revenue_series' => [], 'top_products_qty' => [], 'top_products_rev' => [],
    'city_distribution' => [], 'heatmap' => [], 'traffic' => [], 'recent_orders' => [],
];
echo "window.DASHBOARD_DATA = " . json_encode($defaultData, JSON_UNESCAPED_UNICODE) . ";\n";

try {
    $pdo = db($config);
} catch (\Throwable $e) {
    echo "console.warn('Beta data init failed:', " . json_encode($e->getMessage()) . ");\n";
    exit;
}

try {
$period   = date('Y-m');
$start    = $period . '-01';
$end      = date('Y-m-t', strtotime($start));
$lineRev  = "COALESCE(subtotal_after_discount, 0)";

// ── Summary per platform ─────────────────────────────────────────────
$platformAgg = [];
foreach (['shopee', 'lazada', 'tiktokshop'] as $plat) {
    $stmt = $pdo->prepare("
        SELECT
            COUNT(DISTINCT order_id) AS orders,
            COUNT(DISTINCT CASE WHEN normalized_status IN ('completed','delivered') THEN order_id END) AS completed,
            COUNT(DISTINCT CASE WHEN normalized_status = 'cancelled' THEN order_id END) AS cancelled,
            COALESCE(SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN order_total ELSE 0 END), 0) AS revenue
        FROM orders
        WHERE platform = :p AND DATE(order_created_at) BETWEEN :s AND :e
    ");
    $stmt->execute([':p' => $plat, ':s' => $start, ':e' => $end]);
    $row = $stmt->fetch();
    $platformAgg[$plat === 'tiktokshop' ? 'tiktok' : $plat] = [
        'orders'    => (int) $row['orders'],
        'completed' => (int) $row['completed'],
        'cancelled' => (int) $row['cancelled'],
        'revenue'   => (float) $row['revenue'],
    ];
}

$totalOrders     = $platformAgg['shopee']['orders'] + $platformAgg['lazada']['orders'] + $platformAgg['tiktok']['orders'];
$totalCompleted  = $platformAgg['shopee']['completed'] + $platformAgg['lazada']['completed'] + $platformAgg['tiktok']['completed'];
$totalCancelled  = $platformAgg['shopee']['cancelled'] + $platformAgg['lazada']['cancelled'] + $platformAgg['tiktok']['cancelled'];
$totalRevenue    = $platformAgg['shopee']['revenue'] + $platformAgg['lazada']['revenue'] + $platformAgg['tiktok']['revenue'];

// Shipping (in-progress) count
$stmt = $pdo->prepare("SELECT COUNT(DISTINCT order_id) FROM orders WHERE DATE(order_created_at) BETWEEN :s AND :e AND normalized_status NOT IN ('completed','delivered','cancelled')");
$stmt->execute([':s' => $start, ':e' => $end]);
$shippingOrders = (int) $stmt->fetchColumn();

$avgOrderValue = $totalCompleted > 0 ? round($totalRevenue / $totalCompleted) : 0;
$cancelRate    = $totalOrders > 0 ? round($totalCancelled / $totalOrders * 100, 1) : 0;

// Traffic totals
$stmt = $pdo->prepare("
    SELECT COALESCE(SUM(page_views),0) AS views, COALESCE(SUM(visits),0) AS visits
    FROM traffic_daily
    WHERE traffic_date BETWEEN :s AND :e AND device_type='all'
");
$stmt->execute([':s' => $start, ':e' => $end]);
$traf = $stmt->fetch();

$summary = [
    'total_orders'      => $totalOrders,
    'completed_orders'  => $totalCompleted,
    'cancelled_orders'  => $totalCancelled,
    'shipping_orders'   => $shippingOrders,
    'cancel_rate'       => $cancelRate,
    'total_revenue'     => $totalRevenue,
    'avg_order_value'   => $avgOrderValue,
    'total_page_views'  => (int) ($traf['views'] ?? 0),
    'total_visitors'    => (int) ($traf['visits'] ?? 0),
    'shopee'            => $platformAgg['shopee'],
    'lazada'            => $platformAgg['lazada'],
    'tiktok'            => $platformAgg['tiktok'],
];

// ── Revenue daily series ─────────────────────────────────────────────
$stmt = $pdo->prepare("
    SELECT DATE(order_created_at) AS d, platform,
           COALESCE(SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN order_total ELSE 0 END),0) AS revenue,
           COUNT(DISTINCT order_id) AS orders
    FROM orders
    WHERE DATE(order_created_at) BETWEEN :s AND :e
    GROUP BY DATE(order_created_at), platform
");
$stmt->execute([':s' => $start, ':e' => $end]);
$byDay = [];
foreach ($stmt->fetchAll() as $r) {
    $d = $r['d'];
    if (!isset($byDay[$d])) {
        $byDay[$d] = [
            'date' => $d,
            'shopee' => 0.0, 'lazada' => 0.0, 'tiktok' => 0.0, 'total' => 0.0,
            'orders_shopee' => 0, 'orders_lazada' => 0, 'orders_tiktok' => 0, 'orders_total' => 0,
        ];
    }
    $plat = $r['platform'] === 'tiktokshop' ? 'tiktok' : $r['platform'];
    if (!isset($byDay[$d][$plat])) continue;
    $byDay[$d][$plat] = (float) $r['revenue'];
    $byDay[$d]['orders_' . $plat] = (int) $r['orders'];
    $byDay[$d]['total'] += (float) $r['revenue'];
    $byDay[$d]['orders_total'] += (int) $r['orders'];
}
// Fill missing days
$revenueSeries = [];
$cursor = strtotime($start);
$endTs  = strtotime($end);
while ($cursor <= $endTs) {
    $d = date('Y-m-d', $cursor);
    $revenueSeries[] = $byDay[$d] ?? [
        'date' => $d,
        'shopee' => 0, 'lazada' => 0, 'tiktok' => 0, 'total' => 0,
        'orders_shopee' => 0, 'orders_lazada' => 0, 'orders_tiktok' => 0, 'orders_total' => 0,
    ];
    $cursor = strtotime('+1 day', $cursor);
}

// ── Top products ─────────────────────────────────────────────────────
$prodSql = function (string $orderBy) use ($start, $end, $lineRev) {
    return "
        SELECT sku, MAX(product_name) AS name,
               SUM(quantity) AS qty,
               SUM({$lineRev}) AS revenue,
               MAX(platform) AS platform
        FROM orders
        WHERE DATE(order_created_at) BETWEEN :s AND :e
          AND normalized_status IN ('completed','delivered')
        GROUP BY sku
        ORDER BY {$orderBy} DESC
        LIMIT 10
    ";
};
$stmt = $pdo->prepare($prodSql('SUM(quantity)'));
$stmt->execute([':s' => $start, ':e' => $end]);
$topQty = array_map(static fn($r) => [
    'sku' => (string) $r['sku'],
    'name' => preg_replace('/\[.*?\]\s*/u', '', (string) $r['name']),
    'qty' => (int) $r['qty'],
    'revenue' => (float) $r['revenue'],
    'platform' => (string) $r['platform'],
], $stmt->fetchAll());

$stmt = $pdo->prepare($prodSql('SUM(' . $lineRev . ')'));
$stmt->execute([':s' => $start, ':e' => $end]);
$topRev = array_map(static fn($r) => [
    'sku' => (string) $r['sku'],
    'name' => preg_replace('/\[.*?\]\s*/u', '', (string) $r['name']),
    'qty' => (int) $r['qty'],
    'revenue' => (float) $r['revenue'],
    'platform' => (string) $r['platform'],
], $stmt->fetchAll());

// ── City distribution ────────────────────────────────────────────────
$stmt = $pdo->prepare("
    SELECT shipping_city AS city, COUNT(DISTINCT order_id) AS orders
    FROM orders
    WHERE DATE(order_created_at) BETWEEN :s AND :e
      AND normalized_status IN ('completed','delivered')
      AND shipping_city IS NOT NULL AND shipping_city != ''
    GROUP BY shipping_city
    ORDER BY orders DESC
    LIMIT 12
");
$stmt->execute([':s' => $start, ':e' => $end]);
$cities = array_map(static fn($r) => ['city' => (string) $r['city'], 'orders' => (int) $r['orders']], $stmt->fetchAll());

// ── Heatmap weekday × hour ───────────────────────────────────────────
$stmt = $pdo->prepare("
    SELECT
        DAYOFWEEK(order_created_at) AS dow,
        HOUR(order_created_at) AS h,
        COUNT(DISTINCT order_id) AS orders
    FROM orders
    WHERE DATE(order_created_at) BETWEEN :s AND :e
    GROUP BY dow, h
");
$stmt->execute([':s' => $start, ':e' => $end]);
$heatMap = [];
for ($w = 0; $w < 7; $w++) {
    for ($h = 0; $h < 24; $h++) {
        $heatMap["{$w}-{$h}"] = ['weekday' => $w, 'hour' => $h, 'orders' => 0];
    }
}
foreach ($stmt->fetchAll() as $r) {
    // MySQL DAYOFWEEK: 1=Sunday … 7=Saturday → convert to 0=Mon..6=Sun
    $dow = ((int) $r['dow'] + 5) % 7;
    $key = "{$dow}-" . (int) $r['h'];
    if (isset($heatMap[$key])) {
        $heatMap[$key]['orders'] = (int) $r['orders'];
    }
}
$heatmap = array_values($heatMap);

// ── Traffic daily by platform ────────────────────────────────────────
$stmt = $pdo->prepare("
    SELECT platform, traffic_date AS date,
           COALESCE(SUM(page_views),0) AS page_views,
           COALESCE(SUM(visits),0) AS visitors
    FROM traffic_daily
    WHERE traffic_date BETWEEN :s AND :e AND device_type='all'
    GROUP BY platform, traffic_date
    ORDER BY traffic_date ASC
");
$stmt->execute([':s' => $start, ':e' => $end]);
$trafficRows = array_map(static fn($r) => [
    'platform' => $r['platform'] === 'tiktokshop' ? 'tiktok' : (string) $r['platform'],
    'date' => (string) $r['date'],
    'page_views' => (int) $r['page_views'],
    'visitors' => (int) $r['visitors'],
], $stmt->fetchAll());

// ── Recent orders ─────────────────────────────────────────────────────
$stmt = $pdo->prepare("
    SELECT platform, order_id, MAX(order_created_at) AS order_date, MAX(normalized_status) AS status,
           MAX(product_name) AS product_name,
           SUM(order_total) AS order_amount,
           MAX(shipping_city) AS city
    FROM orders
    WHERE DATE(order_created_at) BETWEEN :s AND :e
    GROUP BY platform, order_id
    ORDER BY MAX(order_created_at) DESC
    LIMIT 50
");
$stmt->execute([':s' => $start, ':e' => $end]);
$recent = array_map(static fn($r) => [
    'platform'     => $r['platform'] === 'tiktokshop' ? 'tiktok' : (string) $r['platform'],
    'order_id'     => (string) $r['order_id'],
    'order_date'   => (string) $r['order_date'],
    'status'       => (string) $r['status'],
    'product_name' => preg_replace('/\[.*?\]\s*/u', '', (string) $r['product_name']),
    'order_amount' => (float) $r['order_amount'],
    'city'         => (string) ($r['city'] ?? ''),
], $stmt->fetchAll());

$data = [
    'period'          => $period,
    'summary'         => $summary,
    'revenue_series'  => $revenueSeries,
    'top_products_qty'=> $topQty,
    'top_products_rev'=> $topRev,
    'city_distribution' => $cities,
    'heatmap'         => $heatmap,
    'traffic'         => $trafficRows,
    'recent_orders'   => $recent,
];

echo "window.DASHBOARD_DATA = " . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . ";\n";
} catch (\Throwable $e) {
    // Default shape already emitted at top — log the error to the JS console
    // so the UI still renders (with empty data) instead of getting stuck on loading.
    echo "console.warn('Beta data query failed:', " . json_encode($e->getMessage()) . ");\n";
}
