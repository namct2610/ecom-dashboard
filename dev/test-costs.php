<?php

/**
 * Self-check cho trang Chi phí sàn.
 * Chạy: php dev/test-costs.php   (cần DB test, đọc cấu hình như app)
 */

declare(strict_types=1);

$root = dirname(__DIR__);
require $root . '/includes/bootstrap.php';

// Lấy các hàm tính toán từ endpoint thật, bỏ qua phần auth/route.
$src = (string) file_get_contents($root . '/api/costs.php');
foreach (['cost_default_rates', 'cost_load_rates', 'build_cost_analysis'] as $fn) {
    $start = strpos($src, "function {$fn}(");
    if ($start === false) { fwrite(STDERR, "Không tìm thấy {$fn}()\n"); exit(1); }
    $brace = strpos($src, '{', $start); $depth = 0;
    for ($i = $brace; $i < strlen($src); $i++) {
        if ($src[$i] === '{') { $depth++; }
        if ($src[$i] === '}') { $depth--; if ($depth === 0) { break; } }
    }
    eval(substr($src, $start, $i - $start + 1));
}
if (!defined('COST_RATES_SETTING_KEY')) { define('COST_RATES_SETTING_KEY', 'cost_fee_rates'); }

$pdo = db($config);
$fails = 0;
$check = function (string $label, bool $ok) use (&$fails): void {
    printf("%-52s %s\n", $label, $ok ? 'OK' : 'FAIL');
    if (!$ok) { $fails++; }
};

$_GET = ['mode' => 'year', 'period' => '2026', 'platform' => 'all'];
$d = build_cost_analysis($pdo);
$s = $d['summary'];

// --- Phí phải gộp theo ĐƠN, không cộng theo dòng ---
// Kiểm trên đường "phí từ file đơn hàng": chọn kỳ chưa có sao kê.
$_GET = ['date_from' => '2025-01-01', 'date_to' => '2025-12-31', 'platform' => 'all'];
$y2025 = build_cost_analysis($pdo);
$perOrder = (float) $pdo->query("SELECT ROUND(SUM(f)) FROM (
        SELECT MAX(platform_fee_fixed)+MAX(platform_fee_service)+MAX(platform_fee_payment) f
        FROM orders WHERE platform='shopee' AND normalized_status IN ('completed','delivered')
          AND order_created_at >= '2025-01-01' AND order_created_at < '2026-01-01'
        GROUP BY order_id) t")->fetchColumn();
$perLine = (float) $pdo->query("SELECT ROUND(SUM(platform_fee_fixed+platform_fee_service+platform_fee_payment))
    FROM orders WHERE platform='shopee' AND normalized_status IN ('completed','delivered')
      AND order_created_at >= '2025-01-01' AND order_created_at < '2026-01-01'")->fetchColumn();
$sp2025 = $y2025['platforms']['shopee'] ?? null;
$check('Phí từ file đơn hàng: gộp theo đơn', $sp2025 && abs($sp2025['fee_total'] - $perOrder) < 2);
$check('Phí từ file đơn hàng: KHÔNG cộng theo dòng', $sp2025 && $perLine > $sp2025['fee_total'] * 1.2);
$check('Nguồn = file đơn hàng khi chưa có sao kê', ($sp2025['source'] ?? '') === 'order_file');

// --- Ưu tiên sao kê khi có ---
$_GET = ['date_from' => '2026-06-01', 'date_to' => '2026-06-30', 'platform' => 'all'];
$jun = build_cost_analysis($pdo);
$hasSettlement = (int) $pdo->query("SELECT COUNT(*) FROM order_settlements")->fetchColumn() > 0;
if ($hasSettlement) {
    $spJun = $jun['platforms']['shopee'] ?? [];
    $check('Có sao kê thì ưu tiên sao kê', ($spJun['source'] ?? '') === 'settlement');
    $check('Sao kê tách đủ 3 nhóm chi phí',
        isset($spJun['fee_platform'], $spJun['fee_marketing'], $spJun['fee_promotion']));
    $check('Đếm được số đơn đã có sao kê', ($spJun['settled_orders'] ?? 0) > 0);
    $sqlSettled = (float) $pdo->query("SELECT ROUND(SUM(s.fee_total)) FROM order_settlements s
        JOIN (SELECT DISTINCT platform, order_id FROM orders
              WHERE normalized_status IN ('completed','delivered')
                AND order_created_at >= '2026-06-01' AND order_created_at < '2026-07-01') o
          ON o.platform = s.platform AND o.order_id = s.order_id
        WHERE s.platform='shopee'")->fetchColumn();
    $check('Phí sao kê khớp SQL độc lập', abs($sqlSettled - $spJun['fee_total']) < 2,
        number_format($sqlSettled) . ' vs ' . number_format($spJun['fee_total']));
}

// --- Cộng dồn nhất quán ---
$_GET = ['mode' => 'year', 'period' => '2026', 'platform' => 'all'];
$d = build_cost_analysis($pdo);
$s = $d['summary'];
$check('Tổng phí = cộng các sàn', abs(array_sum(array_column($d['platforms'], 'fee_total')) - $s['fee_total']) <= 3);
$check('Doanh thu thuần = doanh thu - phí', abs(($s['revenue'] - $s['fee_total']) - $s['net_revenue']) <= 2);
$check('Tổng phí = 3 nhóm cộng lại',
    abs(($s['fee_platform'] + $s['fee_marketing'] + $s['fee_promotion']) - $s['fee_total']) <= 3);

// --- Doanh thu cùng cơ sở với dashboard ---
$revB = (float) $pdo->query("SELECT ROUND(SUM(subtotal_after_discount)) FROM orders
    WHERE normalized_status IN ('completed','delivered')
      AND order_created_at >= '2026-01-01' AND order_created_at < '2027-01-01'")->fetchColumn();
$check('Doanh thu cùng cơ sở với trang Tổng quan', abs($revB - $s['revenue']) < 2);

// --- Biểu phí: kẹp 0..100 và bỏ giá trị rác ---
$saved = get_app_setting($pdo, COST_RATES_SETTING_KEY, '');
set_app_setting($pdo, COST_RATES_SETTING_KEY, json_encode([
    'lazada'     => ['commission' => 250, 'payment' => -5],
    'tiktokshop' => ['commission' => 'abc'],
]));
$rates = cost_load_rates($pdo);
$check('Tỷ lệ > 100 bị kẹp về 100', $rates['lazada']['commission'] === 100.0);
$check('Tỷ lệ âm bị kẹp về 0', $rates['lazada']['payment'] === 0.0);
$check('Giá trị không phải số bị bỏ qua', $rates['tiktokshop']['commission'] === cost_default_rates()['tiktokshop']['commission']);
set_app_setting($pdo, COST_RATES_SETTING_KEY, $saved); // trả lại như cũ

// --- Kỳ không có đơn thì không chia cho 0 ---
$_GET = ['mode' => 'year', 'period' => '1999', 'platform' => 'all'];
$empty = build_cost_analysis($pdo);
$check('Kỳ rỗng: không lỗi chia 0', $empty['summary']['orders'] === 0 && $empty['summary']['fee_pct'] === 0.0);

echo $fails === 0 ? "\nOK — tất cả self-check chi phí sàn đều pass.\n" : "\n$fails lỗi.\n";
exit($fails === 0 ? 0 : 1);
