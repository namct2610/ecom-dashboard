<?php

/**
 * Self-check cho việc gộp kho trùng tên ở "Phân bổ đơn theo kho hàng".
 * Chạy: php dev/test-warehouse-merge.php
 */

declare(strict_types=1);

$root = dirname(__DIR__);

// Chỉ lấy 3 hàm chuẩn hoá từ api/customers.php, không chạy cả endpoint
// (endpoint đòi bootstrap + auth + DB).
$src = (string) file_get_contents($root . '/api/customers.php');
foreach (['warehouse_group_key', 'warehouse_display_name', 'warehouse_core_name'] as $fn) {
    $start = strpos($src, "function {$fn}(");
    if ($start === false) {
        fwrite(STDERR, "Không tìm thấy {$fn}() trong api/customers.php\n");
        exit(1);
    }
    $brace = strpos($src, '{', $start);
    $depth = 0;
    for ($i = $brace; $i < strlen($src); $i++) {
        if ($src[$i] === '{') { $depth++; }
        if ($src[$i] === '}') { $depth--; if ($depth === 0) { break; } }
    }
    eval(substr($src, $start, $i - $start + 1));
}

/** Gộp giống hệt logic trong api/customers.php. */
function merge_warehouses(array $rows): array
{
    $groups = [];
    foreach ($rows as [$raw, $orders]) {
        $key = warehouse_group_key($raw);
        if (!isset($groups[$key])) {
            $groups[$key] = ['warehouse' => '', 'orders' => 0, 'label_orders' => -1];
        }
        if ($orders > $groups[$key]['label_orders']) {
            $groups[$key]['warehouse'] = warehouse_display_name($raw);
            $groups[$key]['label_orders'] = $orders;
        }
        $groups[$key]['orders'] += $orders;
    }
    $groups = array_values($groups);
    usort($groups, static fn(array $a, array $b): int => $b['orders'] <=> $a['orders']);

    return $groups;
}

// Đúng dữ liệu trên ảnh chụp của trang Khách hàng.
$rows = [
    ['Zott Việt Nam', 1737],
    ['Kho Gò Vấp', 802],
    ['Kho Bình Tân', 667],
    ['Kho Hà Đông', 485],
    ['Kho Gia Lâm', 339],
    ['NPP Gò Vấp (Dũng Tiến)', 17],
    ['NPP Bình Tân (Quốc Thắng)', 14],
    ['NPP Hà Đông (Batos)', 10],
    ['NPP Gia Lâm (Phú Quý)', 6],
    ['NPP Thanh Trì (Châu Á)', 2],
];

$merged = merge_warehouses($rows);
$byName = [];
foreach ($merged as $g) { $byName[$g['warehouse']] = $g['orders']; }

assert(count($merged) === 6, '10 dòng phải gộp còn 6, đang là ' . count($merged));
assert(($byName['Kho Gò Vấp'] ?? 0) === 819, 'Gò Vấp phải là 802+17=819, đang là ' . ($byName['Kho Gò Vấp'] ?? 0));
assert(($byName['Kho Bình Tân'] ?? 0) === 681, 'Bình Tân phải là 667+14=681');
assert(($byName['Kho Hà Đông'] ?? 0) === 495, 'Hà Đông phải là 485+10=495');
assert(($byName['Kho Gia Lâm'] ?? 0) === 345, 'Gia Lâm phải là 339+6=345');
assert(($byName['Zott Việt Nam'] ?? 0) === 1737, 'Zott Việt Nam giữ nguyên 1737');

// Kho chỉ có biến thể NPP: giữ tên đó nhưng bỏ phần trong ngoặc.
assert(($byName['NPP Thanh Trì'] ?? 0) === 2, 'Thanh Trì phải hiện là "NPP Thanh Trì" = 2, thấy: ' . implode(', ', array_keys($byName)));
assert(!isset($byName['NPP Gò Vấp']), 'Không được còn dòng NPP Gò Vấp riêng');

// Tổng số đơn không đổi sau khi gộp.
$before = array_sum(array_column($rows, 1));
$after = array_sum(array_column($merged, 'orders'));
assert($before === $after, "Tổng đơn lệch: {$before} -> {$after}");

// Thứ tự giảm dần theo số đơn.
$orders = array_column($merged, 'orders');
$sorted = $orders; rsort($sorted);
assert($orders === $sorted, 'Phải sắp giảm dần theo số đơn');

// Nhãn hiển thị lấy theo biến thể nhiều đơn nhất, không phải dòng gặp trước.
$flipped = merge_warehouses([['NPP Gò Vấp (Dũng Tiến)', 17], ['Kho Gò Vấp', 802]]);
assert($flipped[0]['warehouse'] === 'Kho Gò Vấp', 'Nhãn phải là "Kho Gò Vấp" dù NPP đứng trước');

// Bỏ dấu: cùng kho nhưng sàn xuất ra không dấu vẫn phải gộp.
$noDiacritics = merge_warehouses([['Kho Gò Vấp', 100], ['NPP Go Vap (Dung Tien)', 5]]);
assert(count($noDiacritics) === 1, 'Bản không dấu phải gộp cùng bản có dấu');
assert($noDiacritics[0]['orders'] === 105, 'Phải cộng thành 105');

// Không được gộp hai kho khác nhau.
$distinct = merge_warehouses([['Kho Gò Vấp', 10], ['Kho Bình Tân', 10], ['Kho Thanh Trì', 10]]);
assert(count($distinct) === 3, 'Ba kho khác nhau phải giữ ba dòng');

// Tên rỗng/lạ không làm sập.
assert(warehouse_group_key('') === '', 'Tên rỗng phải cho key rỗng');
assert(warehouse_display_name('(Chỉ có ngoặc)') === '(Chỉ có ngoặc)', 'Tên chỉ gồm ngoặc thì giữ nguyên');
assert(warehouse_core_name('  NPP   Gia Lâm  (Phú Quý)  ') === 'Gia Lâm', 'Phải gọn khoảng trắng: ' . warehouse_core_name('  NPP   Gia Lâm  (Phú Quý)  '));

echo "OK — gộp kho trùng tên đúng: 10 dòng còn 6, tổng đơn không đổi.\n";
foreach ($merged as $g) {
    printf("  %-16s %5d\n", $g['warehouse'], $g['orders']);
}
