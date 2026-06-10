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
    // monthDetail covers the last 12 months so longer period selections
    // (6m / Năm nay / Năm trước) still have product/city/heat data.
    $detailMonths = [];
    for ($i = 11; $i >= 0; $i--) {
        $detailMonths[] = $fm->modify("-{$i} month")->format('Y-m');
    }

    // ───────── monthly aggregate ─────────
    // Build per-platform totals per month, then merge into one row per ym.
    $monthlyStmt = $pdo->query("
        SELECT DATE_FORMAT(order_created_at,'%Y-%m') AS ym,
               platform,
               COUNT(DISTINCT CONCAT(platform,':',order_id)) AS orders,
               SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN 1 ELSE 0 END) AS done_lines,
               SUM(CASE WHEN normalized_status = 'cancelled' THEN 1 ELSE 0 END) AS canc_lines,
               SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN order_total ELSE 0 END) AS revenue
        FROM orders
        GROUP BY ym, platform
        ORDER BY ym ASC
    ");

    // Done/canc should be DISTINCT order counts, not line counts; redo with two subqueries.
    $monthlyAgg = [];
    foreach ($monthlyStmt->fetchAll() as $r) {
        $ym  = $r['ym'];
        $key = $platMap[$r['platform']] ?? null;
        if (!$key) continue;
        $monthlyAgg[$ym] ??= [
            'ym' => $ym, 'orders' => 0, 'completed' => 0, 'cancelled' => 0, 'revenue' => 0,
            'plat' => [
                'shopee' => ['rev'=>0,'ord'=>0,'done'=>0,'canc'=>0],
                'lazada' => ['rev'=>0,'ord'=>0,'done'=>0,'canc'=>0],
                'tiktok' => ['rev'=>0,'ord'=>0,'done'=>0,'canc'=>0],
            ],
        ];
        $monthlyAgg[$ym]['plat'][$key]['ord'] = (int)$r['orders'];
        $monthlyAgg[$ym]['plat'][$key]['rev'] = (float)$r['revenue'];
        $monthlyAgg[$ym]['orders']  += (int)$r['orders'];
        $monthlyAgg[$ym]['revenue'] += (float)$r['revenue'];
    }
    // distinct-order-by-status counts
    $stStmt = $pdo->query("
        SELECT DATE_FORMAT(order_created_at,'%Y-%m') AS ym, platform,
               COUNT(DISTINCT CASE WHEN normalized_status IN ('completed','delivered') THEN order_id END) AS done_orders,
               COUNT(DISTINCT CASE WHEN normalized_status = 'cancelled' THEN order_id END) AS canc_orders
        FROM orders
        GROUP BY ym, platform
    ");
    foreach ($stStmt->fetchAll() as $r) {
        $ym  = $r['ym'];
        $key = $platMap[$r['platform']] ?? null;
        if (!$key || !isset($monthlyAgg[$ym])) continue;
        $monthlyAgg[$ym]['plat'][$key]['done'] = (int)$r['done_orders'];
        $monthlyAgg[$ym]['plat'][$key]['canc'] = (int)$r['canc_orders'];
        $monthlyAgg[$ym]['completed'] += (int)$r['done_orders'];
        $monthlyAgg[$ym]['cancelled'] += (int)$r['canc_orders'];
    }
    ksort($monthlyAgg);
    $monthly = array_values($monthlyAgg);

    // ───────── daily aggregate (recent ~18 months for chart range) ─────────
    $dailyFrom = (new DateTimeImmutable($rangeEnd . '-01'))->modify('-17 months')->format('Y-m-d');
    $dailyOrdStmt = $pdo->prepare("
        SELECT DATE(order_created_at) AS d, platform,
               COUNT(DISTINCT order_id) AS ord,
               COUNT(DISTINCT CASE WHEN normalized_status IN ('completed','delivered') THEN order_id END) AS done,
               COUNT(DISTINCT CASE WHEN normalized_status = 'cancelled' THEN order_id END) AS canc,
               SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN order_total ELSE 0 END) AS rev
        FROM orders
        WHERE order_created_at >= :from
        GROUP BY d, platform
        ORDER BY d ASC
    ");
    $dailyOrdStmt->execute([':from' => $dailyFrom]);
    $dailyAgg = [];
    foreach ($dailyOrdStmt->fetchAll() as $r) {
        $d = $r['d'];
        $short = $platShort[$r['platform']] ?? null;
        if (!$short) continue;
        $dailyAgg[$d] ??= ['date' => $d, 's' => [0,0,0,0], 'l' => [0,0,0,0], 't' => [0,0,0,0]];
        $dailyAgg[$d][$short] = [(float)$r['rev'], (int)$r['ord'], (int)$r['done'], (int)$r['canc']];
    }
    ksort($dailyAgg);
    $daily = array_values($dailyAgg);

    // ───────── monthDetail (last 12 months — covers 3m/6m/ytd periods) ─────────
    $monthDetail = [];
    foreach ($detailMonths as $ym) {
        $monthStart = $ym . '-01';
        $monthEnd   = (new DateTimeImmutable($monthStart))->modify('first day of next month')->format('Y-m-d');
        $bind = [':s' => $monthStart, ':e' => $monthEnd];

        // Top products by qty / revenue.
        // NOTE: query is split into 2 statements (instead of one with a correlated
        // subquery) because PDO native prepares (ATTR_EMULATE_PREPARES=false in
        // includes/db.php) do NOT permit the same named placeholder to appear
        // twice — and a correlated per-row subquery would also be very slow.
        $prodStmt = $pdo->prepare("
            SELECT UPPER(TRIM(sku)) AS sku,
                   COALESCE(MAX(NULLIF(product_name,'')),'') AS name,
                   SUM(quantity) AS qty,
                   SUM(subtotal_after_discount) AS revenue
            FROM orders
            WHERE order_created_at >= :s AND order_created_at < :e
              AND normalized_status IN ('completed','delivered')
              AND sku IS NOT NULL AND TRIM(sku) <> ''
            GROUP BY UPPER(TRIM(sku))
        ");
        $prodStmt->execute($bind);
        $prods = $prodStmt->fetchAll();

        // Dominant platform per SKU (top platform by units within the same window).
        $platStmt = $pdo->prepare("
            SELECT UPPER(TRIM(sku)) AS sku, platform, SUM(quantity) AS q
            FROM orders
            WHERE order_created_at >= :s AND order_created_at < :e
              AND normalized_status IN ('completed','delivered')
              AND sku IS NOT NULL AND TRIM(sku) <> ''
            GROUP BY UPPER(TRIM(sku)), platform
        ");
        $platStmt->execute($bind);
        $domPlat = [];
        foreach ($platStmt->fetchAll() as $r) {
            $sku = $r['sku'];
            if (!isset($domPlat[$sku]) || (int)$r['q'] > $domPlat[$sku][1]) {
                $domPlat[$sku] = [$r['platform'], (int)$r['q']];
            }
        }
        foreach ($prods as &$p) {
            $p['plat'] = $domPlat[$p['sku']][0] ?? '';
        }
        unset($p);

        $topRev = $prods;
        usort($topRev, fn($a,$b) => (float)$b['revenue'] <=> (float)$a['revenue']);
        $topRev = array_slice($topRev, 0, 10);
        $topQty = $prods;
        usort($topQty, fn($a,$b) => (int)$b['qty'] <=> (int)$a['qty']);
        $topQty = array_slice($topQty, 0, 10);

        $shape = function (array $list) use ($platMap) {
            return array_map(function ($p) use ($platMap) {
                return [
                    'sku' => $p['sku'],
                    'name' => $p['name'],
                    'qty' => (int)$p['qty'],
                    'revenue' => (float)$p['revenue'],
                    'platform' => $platMap[$p['plat'] ?? ''] ?? 'shopee',
                ];
            }, $list);
        };

        // cities
        $cityStmt = $pdo->prepare("
            SELECT COALESCE(NULLIF(TRIM(shipping_city),''),'(Không rõ)') AS city,
                   COUNT(DISTINCT order_id) AS orders,
                   SUM(CASE WHEN normalized_status IN ('completed','delivered') THEN order_total ELSE 0 END) AS revenue
            FROM orders
            WHERE order_created_at >= :s AND order_created_at < :e
            GROUP BY city
            ORDER BY orders DESC
            LIMIT 30
        ");
        $cityStmt->execute($bind);
        $cities = array_map(fn($c) => [
            'city' => $c['city'],
            'orders' => (int)$c['orders'],
            'revenue' => (float)$c['revenue'],
        ], $cityStmt->fetchAll());

        // heatmap: hour 0-23 × weekday 0-6 (Monday=0 to match prototype).
        // Frontend store expects FLAT list of {weekday, hour, orders} — see
        // assets/store.js heatMatrix(): DASH.monthDetail[ym].heat.forEach(h => ...).
        $heatStmt = $pdo->prepare("
            SELECT HOUR(order_created_at) AS h,
                   ((DAYOFWEEK(order_created_at) + 5) % 7) AS dow,
                   COUNT(DISTINCT order_id) AS orders
            FROM orders
            WHERE order_created_at >= :s AND order_created_at < :e
              AND normalized_status IN ('completed','delivered')
            GROUP BY h, dow
        ");
        $heatStmt->execute($bind);
        $heat = [];
        foreach ($heatStmt->fetchAll() as $r) {
            $heat[] = [
                'weekday' => (int)$r['dow'],
                'hour'    => (int)$r['h'],
                'orders'  => (int)$r['orders'],
            ];
        }

        // status totals
        $statStmt = $pdo->prepare("
            SELECT normalized_status AS s, COUNT(DISTINCT order_id) AS c
            FROM orders
            WHERE order_created_at >= :s AND order_created_at < :e
            GROUP BY normalized_status
        ");
        $statStmt->execute($bind);
        $status = ['completed'=>0,'delivered'=>0,'cancelled'=>0,'pending'=>0];
        foreach ($statStmt->fetchAll() as $r) {
            $status[$r['s']] = (int)$r['c'];
        }

        $monthDetail[$ym] = [
            'topRev' => $shape($topRev),
            'topQty' => $shape($topQty),
            'city' => $cities,
            'heat' => $heat,
            'status' => $status,
        ];
    }

    // ───────── recent orders ─────────
    $roStmt = $pdo->query("
        SELECT platform, order_id, order_created_at, normalized_status,
               COALESCE(NULLIF(TRIM(shipping_city),''),'') AS city,
               order_total,
               quantity,
               product_name
        FROM orders
        ORDER BY order_created_at DESC
        LIMIT 60
    ");
    $recent = array_map(function ($o) use ($platMap) {
        return [
            'platform'  => $platMap[$o['platform']] ?? $o['platform'],
            'order_id'  => $o['order_id'],
            'created'   => $o['order_created_at'],
            'status'    => $o['normalized_status'],
            'city'      => $o['city'],
            'amount'    => (float)$o['order_total'],
            'items'     => (int)$o['quantity'],
            'product'   => $o['product_name'] ?? '',
        ];
    }, $roStmt->fetchAll());

    // ───────── traffic daily ─────────
    $tdStmt = $pdo->prepare("
        SELECT traffic_date AS d, platform,
               SUM(page_views) AS pv, SUM(visits) AS visits,
               SUM(new_followers) AS nf, AVG(bounce_rate) AS bounce,
               SUM(new_visitors) AS nv, SUM(returning_visitors) AS rv
        FROM traffic_daily
        WHERE traffic_date >= :from
        GROUP BY d, platform
        ORDER BY d ASC
    ");
    $tdStmt->execute([':from' => $dailyFrom]);
    $tdAgg = [];
    foreach ($tdStmt->fetchAll() as $r) {
        $key = $platMap[$r['platform']] ?? null;
        if (!$key) continue;
        $d = $r['d'];
        $tdAgg[$d] ??= [
            'date' => $d,
            'shopee' => ['pv'=>0,'visits'=>0,'nf'=>0,'bounce'=>0,'nv'=>0,'rv'=>0],
            'lazada' => ['pv'=>0,'visits'=>0,'nf'=>0,'bounce'=>0,'nv'=>0,'rv'=>0],
            'tiktok' => ['pv'=>0,'visits'=>0,'nf'=>0,'bounce'=>0,'nv'=>0,'rv'=>0],
        ];
        $tdAgg[$d][$key] = [
            'pv'     => (int)$r['pv'],
            'visits' => (int)$r['visits'],
            'nf'     => (int)$r['nf'],
            'bounce' => round((float)$r['bounce'], 2),
            'nv'     => (int)$r['nv'],
            'rv'     => (int)$r['rv'],
        ];
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
        'monthDetail'    => $monthDetail,
        'recentOrders'   => $recent,
        'trafficDaily'   => $trafficDaily,
        'trafficMonthly' => $trafficMonthly,
    ]);

} catch (Throwable $e) {
    json_error('v2-data: ' . $e->getMessage(), 500);
}
