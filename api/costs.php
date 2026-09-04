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
    // Gom orders trước rồi mới LEFT JOIN sao kê, để $where không bị nhập nhằng
    // tên cột giữa hai bảng.
    $perOrder = "
        SELECT po.platform,
               po.order_id,
               po.created_at,
               po.revenue,
               po.fee_from_orders,
               COALESCE(s.fee_platform, 0)  AS s_platform,
               COALESCE(s.fee_marketing, 0) AS s_marketing,
               COALESCE(s.fee_promotion, 0) AS s_promotion,
               COALESCE(s.fee_total, 0)     AS s_total
        FROM (
            SELECT platform,
                   order_id,
                   MIN(order_created_at) AS created_at,
                   COALESCE(SUM(subtotal_after_discount), 0) AS revenue,
                   COALESCE(MAX(platform_fee_fixed), 0)
                     + COALESCE(MAX(platform_fee_service), 0)
                     + COALESCE(MAX(platform_fee_payment), 0) AS fee_from_orders
            FROM orders {$where}
            GROUP BY platform, order_id
        ) po
        LEFT JOIN order_settlements s
               ON s.platform = po.platform AND s.order_id = po.order_id
    ";

    $byPlatformStmt = $pdo->prepare("
        SELECT platform,
               COUNT(*) AS orders,
               COALESCE(SUM(revenue), 0)         AS revenue,
               COALESCE(SUM(fee_from_orders), 0) AS fee_from_orders,
               COALESCE(SUM(s_platform), 0)      AS s_platform,
               COALESCE(SUM(s_marketing), 0)     AS s_marketing,
               COALESCE(SUM(s_promotion), 0)     AS s_promotion,
               SUM(CASE WHEN s_total > 0 THEN 1 ELSE 0 END) AS settled_orders
        FROM ({$perOrder}) o
        GROUP BY platform
    ");
    $byPlatformStmt->execute($params);

    $rates = cost_load_rates($pdo);
    $platforms = [];
    $totals = ['orders' => 0, 'revenue' => 0.0, 'fee_platform' => 0.0, 'fee_marketing' => 0.0,
               'fee_promotion' => 0.0, 'fee_total' => 0.0, 'net_revenue' => 0.0, 'settled_orders' => 0];
    $anyEstimated = false;

    foreach ($byPlatformStmt->fetchAll() as $row) {
        $platform = (string) $row['platform'];
        $revenue  = (float) $row['revenue'];
        $settled  = (float) $row['s_platform'] + (float) $row['s_marketing'] + (float) $row['s_promotion'];

        // Thứ tự ưu tiên: sao kê (đủ nhất) > phí trong file đơn hàng > ước tính.
        if ($settled > 0) {
            $source        = 'settlement';
            $feePlatform   = (float) $row['s_platform'];
            $feeMarketing  = (float) $row['s_marketing'];
            $feePromotion  = (float) $row['s_promotion'];
        } elseif ((float) $row['fee_from_orders'] > 0) {
            $source        = 'order_file';
            $feePlatform   = (float) $row['fee_from_orders'];
            $feeMarketing  = 0.0;
            $feePromotion  = 0.0;
        } else {
            $source        = 'estimated';
            $rate          = $rates[$platform] ?? ['commission' => 0.0, 'payment' => 0.0];
            $feePlatform   = $revenue * ($rate['commission'] + $rate['payment']) / 100;
            $feeMarketing  = 0.0;
            $feePromotion  = 0.0;
            $anyEstimated  = $anyEstimated || $revenue > 0;
        }
        $feeTotal = $feePlatform + $feeMarketing + $feePromotion;

        $platforms[$platform] = [
            'platform'       => $platform,
            'source'         => $source,
            'orders'         => (int) $row['orders'],
            'settled_orders' => (int) $row['settled_orders'],
            'revenue'        => round($revenue, 0),
            'fee_platform'   => round($feePlatform, 0),
            'fee_marketing'  => round($feeMarketing, 0),
            'fee_promotion'  => round($feePromotion, 0),
            'fee_total'      => round($feeTotal, 0),
            'fee_pct'        => $revenue > 0 ? round($feeTotal / $revenue * 100, 2) : 0.0,
            'fee_per_order'  => ((int) $row['orders']) > 0 ? round($feeTotal / (int) $row['orders'], 0) : 0.0,
            'net_revenue'    => round($revenue - $feeTotal, 0),
        ];

        $totals['orders']         += (int) $row['orders'];
        $totals['settled_orders'] += (int) $row['settled_orders'];
        $totals['revenue']        += $revenue;
        $totals['fee_platform']   += $feePlatform;
        $totals['fee_marketing']  += $feeMarketing;
        $totals['fee_promotion']  += $feePromotion;
        $totals['fee_total']      += $feeTotal;
    }

    $totals['net_revenue']   = $totals['revenue'] - $totals['fee_total'];
    $totals['fee_pct']       = $totals['revenue'] > 0 ? round($totals['fee_total'] / $totals['revenue'] * 100, 2) : 0.0;
    $totals['fee_per_order'] = $totals['orders'] > 0 ? round($totals['fee_total'] / $totals['orders'], 0) : 0.0;
    foreach (['revenue','fee_platform','fee_marketing','fee_promotion','fee_total','net_revenue'] as $k) {
        $totals[$k] = round($totals[$k], 0);
    }

    // Xu hướng theo tháng — cùng cách gộp theo đơn.
    $trendStmt = $pdo->prepare("
        SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
               platform,
               COALESCE(SUM(revenue), 0) AS revenue,
               COALESCE(SUM(GREATEST(s_total, fee_from_orders)), 0) AS fee_actual
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

    // Bóc tách từng khoản phí. order_settlements.details giữ nguyên
    // {tên khoản gốc trên sao kê: số tiền} cho mỗi đơn, nên gộp lại theo tên là
    // biết chính xác tiền đi đâu — chi tiết hơn hẳn ba nhóm lớn ở trên, và
    // không cần nhập lại dữ liệu.
    $detailStmt = $pdo->prepare("
        SELECT s.details
        FROM (SELECT DISTINCT platform, order_id FROM orders {$where}) po
        JOIN order_settlements s
          ON s.platform = po.platform AND s.order_id = po.order_id
        WHERE s.details IS NOT NULL
    ");
    $detailStmt->execute($params);

    $items = [];
    foreach ($detailStmt->fetchAll(PDO::FETCH_COLUMN) as $json) {
        $decoded = json_decode((string) $json, true);
        if (!is_array($decoded)) continue;
        foreach ($decoded as $name => $amount) {
            $amount = (float) $amount;
            if ($amount == 0.0) continue;
            $name = (string) $name;
            if (!isset($items[$name])) {
                $items[$name] = [
                    'name'   => $name,
                    'group'  => \Dashboard\Parsers\SettlementParser::classify($name) ?? 'platform',
                    'amount' => 0.0,
                    'orders' => 0,
                ];
            }
            $items[$name]['amount'] += $amount;
            $items[$name]['orders']++;
        }
    }
    usort($items, static fn(array $a, array $b): int => $b['amount'] <=> $a['amount']);
    $itemsTotal = array_sum(array_column($items, 'amount'));
    $feeItems = array_map(static function (array $i) use ($itemsTotal): array {
        return [
            'name'   => $i['name'],
            'group'  => $i['group'],
            'orders' => $i['orders'],
            'amount' => round($i['amount'], 0),
            'share'  => $itemsTotal > 0 ? round($i['amount'] / $itemsTotal * 100, 1) : 0.0,
        ];
    }, $items);

    return [
        'summary'         => $totals,
        'platforms'       => $platforms,
        'trend'           => $trend,
        'rates'           => $rates,
        'has_estimated'   => $anyEstimated,
        'fee_items'       => $feeItems,
        'fee_items_total' => round($itemsTotal, 0),
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
