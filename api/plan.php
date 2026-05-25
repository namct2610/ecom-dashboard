<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();

const PLAN_TARGETS_SETTING_KEY = 'plan_targets_by_year';

function plan_year_from_request(): int
{
    $year = (int) ($_GET['year'] ?? ($_POST['year'] ?? date('Y')));
    if ($year < 2020 || $year > 2100) {
        json_error('Năm kế hoạch không hợp lệ.', 422);
    }

    return $year;
}

function plan_decode_targets(string $raw): array
{
    if ($raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function plan_normalize_target_value(mixed $value): float
{
    if (is_string($value)) {
        $value = preg_replace('/[^\d.\-]/', '', str_replace(',', '', $value));
    }

    return max(0.0, (float) $value);
}

function plan_month_scope(int $year): array
{
    $nowYear = (int) date('Y');
    $nowMonth = (int) date('n');

    if ($year < $nowYear) {
        $elapsed = 12;
    } elseif ($year > $nowYear) {
        $elapsed = 0;
    } else {
        $elapsed = $nowMonth;
    }

    $remaining = max(0, 12 - $elapsed);

    return [$elapsed, $remaining];
}

function plan_metric_row(string $key, string $label, float $target, float $actual, int $elapsedMonths, int $remainingMonths): array
{
    $targetYtd = $target * ($elapsedMonths / 12);
    $ytg = max(0.0, $target - $actual);
    $avgNeeded = $remainingMonths > 0 ? $ytg / $remainingMonths : 0.0;
    $targetRate = $target > 0 ? ($actual / $target) * 100 : 0.0;
    $ytdRate = $targetYtd > 0 ? ($actual / $targetYtd) * 100 : 0.0;
    $gapYtd = $actual - $targetYtd;

    return [
        'key' => $key,
        'label' => $label,
        'target' => round($target, 2),
        'target_ytd' => round($targetYtd, 2),
        'actual_ytd' => round($actual, 2),
        'gap_ytd' => round($gapYtd, 2),
        'ytg' => round($ytg, 2),
        'avg_needed_month' => round($avgNeeded, 2),
        'target_rate' => round($targetRate, 1),
        'ytd_rate' => round($ytdRate, 1),
        'status' => $target > 0 && $actual >= $targetYtd ? 'on_track' : 'behind',
    ];
}

try {
    $pdo = db($config);

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        require_csrf();
        $body = (array) json_decode(file_get_contents('php://input') ?: '{}', true);
        $year = (int) ($body['year'] ?? date('Y'));
        if ($year < 2020 || $year > 2100) {
            json_error('Năm kế hoạch không hợp lệ.', 422);
        }

        $allTargets = plan_decode_targets(get_app_setting($pdo, PLAN_TARGETS_SETTING_KEY, '{}'));
        $allTargets[(string) $year] = [
            'revenue' => plan_normalize_target_value($body['revenue_target'] ?? 0),
            'visits' => plan_normalize_target_value($body['visits_target'] ?? 0),
        ];

        set_app_setting($pdo, PLAN_TARGETS_SETTING_KEY, json_encode($allTargets, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}');
        log_activity('info', 'plan', "Cập nhật mục tiêu kế hoạch năm {$year}");

        json_response(['success' => true]);
    }

    require_method('GET');

    $year = plan_year_from_request();
    [$elapsedMonths, $remainingMonths] = plan_month_scope($year);
    $startDate = sprintf('%04d-01-01', $year);
    $endDate = $elapsedMonths > 0
        ? date('Y-m-t', strtotime(sprintf('%04d-%02d-01', $year, $elapsedMonths)))
        : sprintf('%04d-01-01', $year);

    $targets = plan_decode_targets(get_app_setting($pdo, PLAN_TARGETS_SETTING_KEY, '{}'));
    $targetForYear = $targets[(string) $year] ?? [];
    $revenueTarget = plan_normalize_target_value($targetForYear['revenue'] ?? 0);
    $visitsTarget = plan_normalize_target_value($targetForYear['visits'] ?? 0);

    $monthly = [];
    for ($month = 1; $month <= 12; $month++) {
        $bucket = sprintf('%04d-%02d', $year, $month);
        $monthly[$bucket] = [
            'month' => $bucket,
            'revenue' => 0.0,
            'visits' => 0,
            'revenue_target' => $revenueTarget / 12,
            'visits_target' => $visitsTarget / 12,
        ];
    }

    if ($elapsedMonths > 0) {
        $revenueStmt = $pdo->prepare("
            SELECT DATE_FORMAT(order_created_at, '%Y-%m') AS month,
                   COALESCE(SUM(order_total), 0) AS revenue
            FROM orders
            WHERE DATE(order_created_at) BETWEEN :start_date AND :end_date
              AND normalized_status IN ('completed', 'delivered')
            GROUP BY DATE_FORMAT(order_created_at, '%Y-%m')
        ");
        $revenueStmt->execute([
            ':start_date' => $startDate,
            ':end_date' => $endDate,
        ]);
        foreach ($revenueStmt->fetchAll() as $row) {
            if (isset($monthly[$row['month']])) {
                $monthly[$row['month']]['revenue'] = (float) $row['revenue'];
            }
        }

        $trafficStmt = $pdo->prepare("
            SELECT DATE_FORMAT(traffic_date, '%Y-%m') AS month,
                   COALESCE(SUM(visits), 0) AS visits
            FROM traffic_daily
            WHERE traffic_date BETWEEN :start_date AND :end_date
              AND device_type = 'all'
            GROUP BY DATE_FORMAT(traffic_date, '%Y-%m')
        ");
        $trafficStmt->execute([
            ':start_date' => $startDate,
            ':end_date' => $endDate,
        ]);
        foreach ($trafficStmt->fetchAll() as $row) {
            if (isset($monthly[$row['month']])) {
                $monthly[$row['month']]['visits'] = (int) $row['visits'];
            }
        }
    }

    $actualRevenue = array_sum(array_column($monthly, 'revenue'));
    $actualVisits = array_sum(array_column($monthly, 'visits'));

    $metrics = [
        plan_metric_row('revenue', 'Doanh số', (float) $revenueTarget, (float) $actualRevenue, $elapsedMonths, $remainingMonths),
        plan_metric_row('visits', 'Lượt truy cập', (float) $visitsTarget, (float) $actualVisits, $elapsedMonths, $remainingMonths),
    ];

    json_response([
        'success' => true,
        'year' => $year,
        'elapsed_months' => $elapsedMonths,
        'remaining_months' => $remainingMonths,
        'targets' => [
            'revenue' => $revenueTarget,
            'visits' => $visitsTarget,
        ],
        'metrics' => $metrics,
        'monthly' => array_values($monthly),
        'generated_at' => date('Y-m-d H:i:s'),
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu kế hoạch.');
}
