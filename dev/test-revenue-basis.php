<?php

/**
 * Chốt cơ sở tính doanh thu: cấp dòng SKU dùng `subtotal_after_discount`,
 * KHÔNG được SUM `order_total` (order_total là tổng cả đơn, lặp trên mọi dòng
 * nên SUM theo dòng sẽ nhân doanh thu lên theo số dòng của đơn).
 *
 * Chạy: php dev/test-revenue-basis.php
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$fails = 0;

// SUM(order_total) ở bất kỳ đâu đều sai; muốn lấy theo đơn thì phải
// MAX(order_total) kèm GROUP BY order_id (như api/customers.php đang làm).
foreach (glob($root . '/api/*.php') ?: [] as $file) {
    $src = (string) file_get_contents($file);
    $name = basename($file);

    if (preg_match_all('/SUM\(\s*order_total\s*\)/i', $src, $m)) {
        $fails++;
        printf("  FAIL %s: có %d chỗ SUM(order_total)\n", $name, count($m[0]));
    }
    if (preg_match_all('/THEN\s+order_total\s+ELSE/i', $src, $m)) {
        $fails++;
        printf("  FAIL %s: có %d chỗ SUM(CASE ... THEN order_total ...)\n", $name, count($m[0]));
    }
}

// Các endpoint tổng hợp doanh thu phải dùng subtotal_after_discount.
$mustUse = [
    'api/v2-data.php'         => 3, // monthly, daily, city
    'api/v2-range-detail.php' => 1, // city theo khoảng đã chọn
    'api/plan.php'            => 1, // doanh thu so với kế hoạch
];
foreach ($mustUse as $rel => $atLeast) {
    $src = (string) file_get_contents($root . '/' . $rel);
    $found = preg_match_all('/SUM\((?:CASE\b.*?THEN\s+)?subtotal_after_discount/is', $src);
    if ($found < $atLeast) {
        $fails++;
        printf("  FAIL %s: chỉ thấy %d chỗ dùng subtotal_after_discount, cần >= %d\n", $rel, $found, $atLeast);
    }
}

// MAX(order_total) theo từng đơn thì hợp lệ — không được báo lỗi oan.
$customers = (string) file_get_contents($root . '/api/customers.php');
if (!preg_match('/MAX\(order_total\)/i', $customers)) {
    $fails++;
    echo "  FAIL api/customers.php: mất MAX(order_total) — chỗ này tính đúng theo đơn, không nên bỏ\n";
}

echo $fails === 0
    ? "OK — doanh thu tính theo subtotal_after_discount, không còn chỗ nào SUM order_total theo dòng.\n"
    : "$fails lỗi.\n";
exit($fails === 0 ? 0 : 1);
