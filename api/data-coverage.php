<?php

declare(strict_types=1);

/**
 * Per-month data completeness grid for the upload page.
 *
 * Coverage is derived from the domain tables, not from upload_history: a month
 * imported before the raw-row store existed (3.4.60) has no import_rows, and
 * upload_history never recorded which period a file covered. The data itself is
 * the only signal that works for every month.
 *
 * State per cell:
 *   full    — every expected day (or every order) is accounted for
 *   partial — some data present, but the month is not covered end to end
 *   none    — nothing imported for that month
 *
 * "Expected days" stops at today for the month in progress, so the current month
 * is not permanently yellow just because it has not finished yet.
 */

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

/** Days that should have data for a given month, capped at today. */
function coverage_expected_days(string $ym, string $today): int
{
    $days = (int) (new DateTimeImmutable($ym . '-01'))->format('t');
    if (substr($today, 0, 7) !== $ym) return $days;
    return min($days, (int) substr($today, 8, 2));
}

function coverage_state(int $have, int $expected): string
{
    if ($have <= 0) return 'none';
    return $have >= $expected ? 'full' : 'partial';
}

try {
    $pdo = db($config);
    $today = date('Y-m-d');
    $curYm = substr($today, 0, 7);

    // Days with orders, per month.
    $orderDays = [];
    foreach ($pdo->query("
        SELECT DATE_FORMAT(order_created_at, '%Y-%m') AS ym,
               COUNT(DISTINCT DATE(order_created_at)) AS days
        FROM orders GROUP BY ym
    ")->fetchAll() as $r) {
        $orderDays[(string) $r['ym']] = (int) $r['days'];
    }

    // Days with traffic, per month.
    $trafficDays = [];
    foreach ($pdo->query("
        SELECT DATE_FORMAT(traffic_date, '%Y-%m') AS ym,
               COUNT(DISTINCT traffic_date) AS days
        FROM traffic_daily GROUP BY ym
    ")->fetchAll() as $r) {
        $trafficDays[(string) $r['ym']] = (int) $r['days'];
    }

    // Settlement is per order, not per day: how many finished orders in the
    // month carry a settlement row.
    $settle = [];
    foreach ($pdo->query("
        SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS ym,
               COUNT(*) AS orders,
               SUM(CASE WHEN s.order_id IS NOT NULL THEN 1 ELSE 0 END) AS settled
        FROM (
            SELECT platform, order_id, MIN(order_created_at) AS created_at
            FROM orders
            WHERE normalized_status IN ('completed','delivered')
            GROUP BY platform, order_id
        ) o
        LEFT JOIN order_settlements s
               ON s.platform = o.platform AND s.order_id = o.order_id
        GROUP BY ym
    ")->fetchAll() as $r) {
        $settle[(string) $r['ym']] = ['orders' => (int) $r['orders'], 'settled' => (int) $r['settled']];
    }

    $months = array_unique(array_merge(array_keys($orderDays), array_keys($trafficDays), array_keys($settle)));
    sort($months);

    // Fill the gaps so a month with nothing at all still shows as a grey row.
    $rows = [];
    if ($months) {
        $cursor = $months[0];
        $last   = max($months[count($months) - 1], $curYm);
        while ($cursor <= $last) {
            $expected = coverage_expected_days($cursor, $today);

            $oDays = $orderDays[$cursor] ?? 0;
            $tDays = $trafficDays[$cursor] ?? 0;
            $st    = $settle[$cursor] ?? ['orders' => 0, 'settled' => 0];

            $rows[] = [
                'ym'    => $cursor,
                'cells' => [
                    'orders' => [
                        'state'  => coverage_state($oDays, $expected),
                        'have'   => $oDays, 'expected' => $expected, 'unit' => 'days',
                    ],
                    'traffic' => [
                        'state'  => coverage_state($tDays, $expected),
                        'have'   => $tDays, 'expected' => $expected, 'unit' => 'days',
                    ],
                    'finance' => [
                        'state'  => coverage_state($st['settled'], $st['orders']),
                        'have'   => $st['settled'], 'expected' => $st['orders'], 'unit' => 'orders',
                    ],
                    // No importer exists for advertising reports yet, so this is
                    // reported as unsupported rather than as a missing upload.
                    'ads' => ['state' => 'unsupported', 'have' => 0, 'expected' => 0, 'unit' => 'na'],
                ],
            ];
            $cursor = (new DateTimeImmutable($cursor . '-01'))->modify('+1 month')->format('Y-m');
        }
    }

    $rows = array_reverse($rows); // newest first

    json_response([
        'success'   => true,
        'months'    => $rows,
        'types'     => ['traffic', 'orders', 'finance', 'ads'],
        'today'     => $today,
        'ads_ready' => false,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không đọc được tình trạng dữ liệu.');
}
