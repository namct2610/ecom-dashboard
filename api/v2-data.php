<?php

declare(strict_types=1);

/**
 * Main dashboard data endpoint.
 * Returns the full dataset shape consumed by the v2 frontend at root
 * (matches the window.DASH schema in assets/store.js).
 */

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo = db($config);

    // Platform key normalization: DB uses 'tiktokshop', UI uses 'tiktok'
    $platMap = ['shopee' => 'shopee', 'lazada' => 'lazada', 'tiktokshop' => 'tiktok'];
    $platShort = ['shopee' => 's', 'lazada' => 'l', 'tiktokshop' => 't'];

    // ───────── range / focus months ─────────
    $rangeRow = $pdo->query("SELECT DATE_FORMAT(MIN(order_created_at),'%Y-%m') AS s, DATE_FORMAT(MAX(order_created_at),'%Y-%m') AS e FROM orders")->fetch();
    $rangeStart = $rangeRow['s'] ?? date('Y-m');
    $rangeEnd   = $rangeRow['e'] ?? date('Y-m');

    // Latest month is the latest *complete* month (current month considered complete
    // only if today is its last day — otherwise step back one).
    $latestCal = new DateTimeImmutable($rangeEnd . '-01');
    $today     = new DateTimeImmutable('today');
    $endOfLatest = $latestCal->modify('last day of this month');
    $latestMonth = ($today >= $endOfLatest) ? $latestCal->format('Y-m') : $latestCal->modify('-1 month')->format('Y-m');

    // 3 focus months = latest complete month + 2 preceding (used for default UI period)
    $focusMonths = [];
    $fm = new DateTimeImmutable($latestMonth . '-01');
    for ($i = 2; $i >= 0; $i--) {
        $focusMonths[] = $fm->modify("-{$i} month")->format('Y-m');
    }

    // ───────── daily aggregate, and monthly from it ─────────
    // One scan of orders. Monthly totals are sums of the daily rows: an order
    // has one order_created_at, so its distinct counts never span two days.
    // Doanh thu cộng theo `subtotal_after_discount` (cấp dòng SKU), KHÔNG dùng
    // `order_total`: order_total là tổng của cả đơn và được lặp lại trên mọi
    // dòng SKU, nên SUM theo dòng sẽ nhân doanh thu lên theo số dòng của đơn.
    $dailyStmt = $pdo->query("
        SELECT DATE(order_created_at) AS d, platform,
               COUNT(DISTINCT order_id) AS ord,
               COUNT(DISTINCT CASE WHEN normalized_status IN ('completed','delivered') THEN order_id END) AS done,
               COUNT(DISTINCT CASE WHEN normalized_status = 'cancelled' THEN order_id END) AS canc,
               SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN subtotal_after_discount ELSE 0 END) AS rev
        FROM orders
        GROUP BY d, platform
    ");
    $dailyAgg = [];
    $monthlyAgg = [];
    $blank = static fn(): array => ['rev' => 0.0, 'ord' => 0, 'done' => 0, 'canc' => 0];
    foreach ($dailyStmt->fetchAll() as $r) {
        $short = $platShort[$r['platform']] ?? null;
        if (!$short) continue;
        $key = $platMap[$r['platform']];
        $d   = (string) $r['d'];
        $ym  = substr($d, 0, 7);
        [$rev, $ord, $done, $canc] = [(float) $r['rev'], (int) $r['ord'], (int) $r['done'], (int) $r['canc']];

        $dailyAgg[$d] ??= ['date' => $d, 's' => [0, 0, 0, 0], 'l' => [0, 0, 0, 0], 't' => [0, 0, 0, 0]];
        $dailyAgg[$d][$short] = [$rev, $ord, $done, $canc];

        $monthlyAgg[$ym] ??= ['ym' => $ym, 'orders' => 0, 'completed' => 0, 'cancelled' => 0, 'revenue' => 0.0,
            'plat' => ['shopee' => $blank(), 'lazada' => $blank(), 'tiktok' => $blank()]];
        $m = &$monthlyAgg[$ym];
        $m['plat'][$key]['rev'] += $rev;  $m['revenue']   += $rev;
        $m['plat'][$key]['ord'] += $ord;  $m['orders']    += $ord;
        $m['plat'][$key]['done'] += $done; $m['completed'] += $done;
        $m['plat'][$key]['canc'] += $canc; $m['cancelled'] += $canc;
        unset($m);
    }
    ksort($dailyAgg);
    ksort($monthlyAgg);
    $daily = array_values($dailyAgg);
    $monthly = array_values(array_map(static function (array $m): array {
        $m['revenue'] = round($m['revenue'], 2);
        foreach ($m['plat'] as $k => $p) { $m['plat'][$k]['rev'] = round($p['rev'], 2); }
        return $m;
    }, $monthlyAgg));

    // Products, cities, heatmap and recent orders are NOT sent here any more:
    // every page fetches them for the selected period from v2-range-detail.php,
    // so building twelve months of them on every load only slowed the start.

    // ───────── traffic daily (from the first month with orders) ─────────
    $dailyFrom = ($monthly[0]['ym'] ?? date('Y-m')) . '-01';
    $tdStmt = $pdo->prepare("
        SELECT traffic_date AS d, platform,
               SUM(page_views) AS pv, SUM(visits) AS visits,
               SUM(new_followers) AS nf, SUM(new_visitors) AS nv
        FROM traffic_daily
        WHERE traffic_date >= :from
        GROUP BY d, platform
        ORDER BY d ASC
    ");
    $tdStmt->execute([':from' => $dailyFrom]);
    // Same compact shape as `daily`: one [pv, visits, nf, nv] array per platform.
    $tdAgg = [];
    foreach ($tdStmt->fetchAll() as $r) {
        $short = $platShort[$r['platform']] ?? null;
        if (!$short) continue;
        $d = $r['d'];
        $tdAgg[$d] ??= ['date' => $d, 's' => [0, 0, 0, 0], 'l' => [0, 0, 0, 0], 't' => [0, 0, 0, 0]];
        $tdAgg[$d][$short] = [(int) $r['pv'], (int) $r['visits'], (int) $r['nf'], (int) $r['nv']];
    }
    ksort($tdAgg);
    $trafficDaily = array_values($tdAgg);

    // ───────── traffic monthly ─────────
    $tmStmt = $pdo->query("
        SELECT DATE_FORMAT(traffic_date,'%Y-%m') AS ym, platform,
               SUM(page_views) AS pv, SUM(visits) AS visits, SUM(new_followers) AS nf
        FROM traffic_daily
        GROUP BY ym, platform
        ORDER BY ym ASC
    ");
    $tmAgg = [];
    foreach ($tmStmt->fetchAll() as $r) {
        $key = $platMap[$r['platform']] ?? null;
        if (!$key) continue;
        $ym = $r['ym'];
        $tmAgg[$ym] ??= [
            'ym' => $ym,
            'shopee' => ['pv'=>0,'visits'=>0,'nf'=>0],
            'lazada' => ['pv'=>0,'visits'=>0,'nf'=>0],
            'tiktok' => ['pv'=>0,'visits'=>0,'nf'=>0],
        ];
        $tmAgg[$ym][$key] = [
            'pv' => (int)$r['pv'], 'visits' => (int)$r['visits'], 'nf' => (int)$r['nf'],
        ];
    }
    ksort($tmAgg);
    $trafficMonthly = array_values($tmAgg);

    json_response([
        'generatedAt'    => date('Y-m-d'),
        'range'          => ['start' => $rangeStart, 'end' => $rangeEnd],
        'focusMonths'    => $focusMonths,
        'latestMonth'    => $latestMonth,
        'monthly'        => $monthly,
        'daily'          => $daily,
        'trafficDaily'   => $trafficDaily,
        'trafficMonthly' => $trafficMonthly,
    ]);

} catch (Throwable $e) {
    json_error('v2-data: ' . $e->getMessage(), 500);
}
