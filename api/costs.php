<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();

const COST_RATES_SETTING_KEY = 'cost_fee_rates';

/**
 * Biểu phí mặc định cho sàn CHƯA có phí thật trong file export.
 * Đây chỉ là số khởi tạo để trang có gì đó hiển thị — mức phí thật phụ thuộc
 * ngành hàng, hợp đồng và chương trình đang tham gia, nên phải chỉnh lại trong
 * Cài đặt. Sàn nào có phí thật trong dữ liệu thì bảng này bị bỏ qua.
 */
function cost_default_rates(): array
{
    return [
        'shopee'     => ['commission' => 0.0, 'payment' => 0.0],
        'lazada'     => ['commission' => 5.0, 'payment' => 2.0],
        'tiktokshop' => ['commission' => 5.0, 'payment' => 5.0],
    ];
}

function cost_load_rates(PDO $pdo): array
{
    $stored = json_decode(get_app_setting($pdo, COST_RATES_SETTING_KEY, '{}'), true);
    $rates  = cost_default_rates();

    if (!is_array($stored)) {
        return $rates;
    }

    foreach ($rates as $platform => $default) {
        $row = $stored[$platform] ?? null;
        if (!is_array($row)) {
            continue;
        }
        foreach (['commission', 'payment'] as $field) {
            if (isset($row[$field]) && is_numeric($row[$field])) {
                // Kẹp 0..100 để một số nhập nhầm không thổi bay báo cáo.
                $rates[$platform][$field] = max(0.0, min(100.0, (float) $row[$field]));
            }
        }
    }

    return $rates;
}

/**
 * Toàn bộ phép tính chi phí sàn cho kỳ đang chọn. Tách riêng khỏi phần
 * auth/route để chạy được từ script kiểm tra mà không cần session.
 */
function build_cost_analysis(PDO $pdo): array
{
    $params = [];
    $where  = sql_filters($params);
    $where .= " AND normalized_status IN ('completed','delivered')";

    // Phí sàn được ghi ở cấp ĐƠN và lặp lại trên mọi dòng SKU (đã kiểm: không
    // đơn nào có phí khác nhau giữa các dòng). Vì vậy phải MAX theo từng đơn
    // rồi mới cộng — SUM thẳng theo dòng sẽ nhân phí lên theo số dòng của đơn.
    $perOrder = "
        SELECT platform,
               order_id,
               MIN(order_created_at) AS created_at,
               COALESCE(SUM(subtotal_after_discount), 0) AS revenue,
               COALESCE(MAX(platform_fee_fixed), 0)   AS fee_fixed,
               COALESCE(MAX(platform_fee_service), 0) AS fee_service,
               COALESCE(MAX(platform_fee_payment), 0) AS fee_payment,
               COALESCE(MAX(shipping_fee), 0)         AS shipping_fee
        FROM orders {$where}
        GROUP BY platform, order_id
    ";

    $byPlatformStmt = $pdo->prepare("
        SELECT platform,
               COUNT(*) AS orders,
               COALESCE(SUM(revenue), 0)      AS revenue,
               COALESCE(SUM(fee_fixed), 0)    AS fee_fixed,
               COALESCE(SUM(fee_service), 0)  AS fee_service,
               COALESCE(SUM(fee_payment), 0)  AS fee_payment,
               COALESCE(SUM(shipping_fee), 0) AS shipping_fee
        FROM ({$perOrder}) o
        GROUP BY platform
    ");
    $byPlatformStmt->execute($params);

    $rates = cost_load_rates($pdo);
    $platforms = [];
    $totals = ['orders' => 0, 'revenue' => 0.0, 'fee_fixed' => 0.0, 'fee_service' => 0.0,
               'fee_payment' => 0.0, 'fee_total' => 0.0, 'shipping_fee' => 0.0, 'net_revenue' => 0.0];
    $anyEstimated = false;

    foreach ($byPlatformStmt->fetchAll() as $row) {
        $platform = (string) $row['platform'];
        $revenue  = (float) $row['revenue'];
        $actual   = (float) $row['fee_fixed'] + (float) $row['fee_service'] + (float) $row['fee_payment'];

        // Có phí thật thì dùng phí thật; không thì mới ước tính theo biểu phí.
        $isActual = $actual > 0;
        if ($isActual) {
            $feeFixed   = (float) $row['fee_fixed'];
            $feeService = (float) $row['fee_service'];
            $feePayment = (float) $row['fee_payment'];
        } else {
            $rate = $rates[$platform] ?? ['commission' => 0.0, 'payment' => 0.0];
            $feeFixed   = 0.0;
            $feeService = $revenue * $rate['commission'] / 100;
            $feePayment = $revenue * $rate['payment'] / 100;
            $anyEstimated = $anyEstimated || $revenue > 0;
        }
        $feeTotal = $feeFixed + $feeService + $feePayment;

        $platforms[$platform] = [
            'platform'     => $platform,
            'source'       => $isActual ? 'actual' : 'estimated',
            'orders'       => (int) $row['orders'],
            'revenue'      => round($revenue, 0),
            'fee_fixed'    => round($feeFixed, 0),
            'fee_service'  => round($feeService, 0),
            'fee_payment'  => round($feePayment, 0),
            'fee_total'    => round($feeTotal, 0),
            'fee_pct'      => $revenue > 0 ? round($feeTotal / $revenue * 100, 2) : 0.0,
            'fee_per_order'=> ((int) $row['orders']) > 0 ? round($feeTotal / (int) $row['orders'], 0) : 0.0,
            'net_revenue'  => round($revenue - $feeTotal, 0),
            'shipping_fee' => round((float) $row['shipping_fee'], 0),
        ];

        $totals['orders']       += (int) $row['orders'];
        $totals['revenue']      += $revenue;
        $totals['fee_fixed']    += $feeFixed;
        $totals['fee_service']  += $feeService;
        $totals['fee_payment']  += $feePayment;
        $totals['fee_total']    += $feeTotal;
        $totals['shipping_fee'] += (float) $row['shipping_fee'];
    }

    $totals['net_revenue']   = $totals['revenue'] - $totals['fee_total'];
    $totals['fee_pct']       = $totals['revenue'] > 0 ? round($totals['fee_total'] / $totals['revenue'] * 100, 2) : 0.0;
    $totals['fee_per_order'] = $totals['orders'] > 0 ? round($totals['fee_total'] / $totals['orders'], 0) : 0.0;
    foreach (['revenue','fee_fixed','fee_service','fee_payment','fee_total','shipping_fee','net_revenue'] as $k) {
        $totals[$k] = round($totals[$k], 0);
    }

    // Xu hướng theo tháng — cùng cách gộp theo đơn.
    $trendStmt = $pdo->prepare("
        SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
               platform,
               COALESCE(SUM(revenue), 0) AS revenue,
               COALESCE(SUM(fee_fixed + fee_service + fee_payment), 0) AS fee_actual
        FROM ({$perOrder}) o
        GROUP BY month, platform
        ORDER BY month ASC
    ");
    $trendStmt->execute($params);

    $trendMap = [];
    foreach ($trendStmt->fetchAll() as $row) {
        $month   = (string) $row['month'];
        $revenue = (float) $row['revenue'];
        $fee     = (float) $row['fee_actual'];
        if ($fee <= 0) {
            $rate = $rates[(string) $row['platform']] ?? ['commission' => 0.0, 'payment' => 0.0];
            $fee  = $revenue * ($rate['commission'] + $rate['payment']) / 100;
        }
        $trendMap[$month] ??= ['month' => $month, 'revenue' => 0.0, 'fee_total' => 0.0];
        $trendMap[$month]['revenue']   += $revenue;
        $trendMap[$month]['fee_total'] += $fee;
    }
    ksort($trendMap);
    $trend = array_values(array_map(static fn(array $m): array => [
        'month'       => $m['month'],
        'revenue'     => round($m['revenue'], 0),
        'fee_total'   => round($m['fee_total'], 0),
        'net_revenue' => round($m['revenue'] - $m['fee_total'], 0),
        'fee_pct'     => $m['revenue'] > 0 ? round($m['fee_total'] / $m['revenue'] * 100, 2) : 0.0,
    ], $trendMap));

    return [
        'summary'       => $totals,
        'platforms'     => $platforms,
        'trend'         => $trend,
        'rates'         => $rates,
        'has_estimated' => $anyEstimated,
    ];
}

try {
    $pdo = db($config);

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        require_admin();
        require_csrf();

        $payload = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($payload)) {
            json_error('Dữ liệu không hợp lệ.', 422);
        }

        $rates = cost_load_rates($pdo);
        foreach ($rates as $platform => $current) {
            $row = $payload['rates'][$platform] ?? null;
            if (!is_array($row)) {
                continue;
            }
            foreach (['commission', 'payment'] as $field) {
                if (isset($row[$field]) && is_numeric($row[$field])) {
                    $rates[$platform][$field] = max(0.0, min(100.0, (float) $row[$field]));
                }
            }
        }

        set_app_setting($pdo, COST_RATES_SETTING_KEY, json_encode($rates, JSON_UNESCAPED_UNICODE) ?: '{}');
        log_activity('info', 'cost_rates_update', 'Cập nhật biểu phí sàn', ['rates' => $rates]);
        json_response(['success' => true, 'rates' => $rates]);
    }

    require_method('GET');

    json_response([
        'success'      => true,
        'generated_at' => date('Y-m-d H:i:s'),
    ] + build_cost_analysis($pdo));
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tính chi phí sàn.');
}
