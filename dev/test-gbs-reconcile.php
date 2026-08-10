<?php

/**
 * Self-check cho đối soát chéo GBS giữa các tháng.
 * Chạy: php dev/test-gbs-reconcile.php
 */

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Dashboard\Reconciliation\GbsReconciliationService;

$service = new GbsReconciliationService(dirname(__DIR__), []);

function call_private(object $object, string $method, array $args): mixed
{
    $ref = new ReflectionMethod($object, $method);
    if (PHP_VERSION_ID < 80100) {
        $ref->setAccessible(true);
    }
    return $ref->invokeArgs($object, $args);
}

/** Dòng đơn sàn theo đúng shape mà mapSharedOrderRow() trả về. */
function platform_row(string $orderId, string $sku, float $qty, float $nmv): array
{
    return [
        'order_id'                   => $orderId,
        'sku'                        => $sku,
        'comparison_sku'             => $sku,
        'product_name'               => 'SP ' . $sku,
        'status'                     => 'completed',
        'created_at'                 => '2026-05-02 10:00:00',
        'reconcile_at'               => '2026-05-20 10:00:00',
        'raw_qty'                    => $qty,
        'comparable_qty'             => $qty,
        'comparable_nmv'             => $nmv,
        'order_level_seller_voucher' => 0.0,
        'combo_multiplier'           => 1,
        'expanded_items'             => [[
            'sku'              => $sku,
            'comparison_sku'   => $sku,
            'quantity'         => $qty,
            'comparable_qty'   => $qty,
            'comparable_nmv'   => $nmv,
            'combo_multiplier' => 1,
            'name'             => 'SP ' . $sku,
        ]],
        'has_bundle'                 => false,
    ];
}

/** Đơn GBS đã gom nhóm theo shape của groupGbsOrdersByPlatform(). */
function gbs_order(string $sku, float $qty, float $nmv): array
{
    return [
        'total_qty'    => $qty,
        'total_nmv'    => $nmv,
        'line_count'   => 1,
        'has_bundle'   => false,
        'statuses'     => ['Hoàn thành'],
        'reconcile_at' => '2026-05-21 08:00:00',
        'sku_map'      => [$sku => $qty],
        'sku_items'    => [['sku' => $sku, 'quantity' => $qty, 'nmv' => $nmv, 'type' => '', 'name' => 'SP ' . $sku]],
    ];
}

function later(float $qty, float $nmv, string $month = '2026-06'): array
{
    return ['qty' => $qty, 'nmv' => $nmv, 'months' => [$month => $month]];
}

function order_by_id(array $result, string $orderId): array
{
    foreach ($result['orders'] as $order) {
        if ($order['order_id'] === $orderId) {
            return $order;
        }
    }
    throw new RuntimeException("Không tìm thấy đơn {$orderId} trong kết quả.");
}

/* ── 1. Đơn thiếu ở GBS tháng này, xuất hiện đủ ở GBS tháng sau → khớp hoàn toàn ── */
$result = call_private($service, 'comparePlatform', [
    'shopee',
    [platform_row('A1', 'SKU1', 2, 200000)],
    [],
    ['A1' => later(2, 200000)],
]);
$a1 = order_by_id($result, 'A1');
assert($a1['status'] === 'matched', 'A1 phải là matched, đang là ' . $a1['status']);
assert($a1['cross_month'] === true, 'A1 phải được đánh dấu cross_month');
assert($a1['cross_month_months'] === ['2026-06'], 'A1 phải ghi nhận tháng 2026-06');
assert($result['summary']['missing_in_gbs'] === 0, 'A1 không được tính là thiếu GBS');
assert($result['summary']['matched_orders'] === 1, 'A1 phải vào matched_orders');
assert($result['summary']['cross_month_orders'] === 1, 'A1 phải vào cross_month_orders');
assert(str_contains($a1['note'], '6/2026'), 'Ghi chú A1 phải nêu tháng 6/2026');

/* ── 2. Đơn lệch một phần, phần còn lại nằm ở GBS tháng sau → cộng gộp thì khớp ── */
$result = call_private($service, 'comparePlatform', [
    'lazada',
    [platform_row('B2', 'SKU2', 3, 300000)],
    ['B2' => gbs_order('SKU2', 1, 100000)],
    ['B2' => later(2, 200000)],
]);
$b2 = order_by_id($result, 'B2');
assert($b2['status'] === 'matched', 'B2 phải khớp sau khi cộng gộp tháng sau, đang là ' . $b2['status']);
assert($b2['cross_month'] === true, 'B2 phải được đánh dấu cross_month');
assert($result['summary']['mismatch_orders'] === 0, 'B2 không còn được tính là lệch');
assert(abs($b2['qty_diff']) < 0.001 && abs($b2['nmv_diff']) < 0.001, 'B2 phải hết chênh lệch');

/* ── 3. Có ở tháng sau nhưng số liệu vẫn lệch → giữ nguyên trạng thái lệch ── */
$result = call_private($service, 'comparePlatform', [
    'shopee',
    [platform_row('C3', 'SKU3', 5, 500000)],
    [],
    ['C3' => later(1, 100000)],
]);
$c3 = order_by_id($result, 'C3');
assert($c3['status'] === 'missing_in_gbs', 'C3 phải vẫn là missing_in_gbs, đang là ' . $c3['status']);
assert($c3['cross_month'] === false, 'C3 không được đánh dấu khớp chéo');
assert($result['summary']['cross_month_orders'] === 0, 'C3 không được tính khớp chéo');
assert(str_contains($c3['note'], '6/2026'), 'Ghi chú C3 vẫn phải nhắc đơn có ở tháng 6/2026');

/* ── 4. Đơn đã khớp sẵn mà tháng sau cũng có → không cộng gộp, không đếm 2 lần ── */
$result = call_private($service, 'comparePlatform', [
    'shopee',
    [platform_row('D4', 'SKU4', 2, 200000)],
    ['D4' => gbs_order('SKU4', 2, 200000)],
    ['D4' => later(2, 200000)],
]);
$d4 = order_by_id($result, 'D4');
assert($d4['status'] === 'matched', 'D4 phải giữ nguyên matched, đang là ' . $d4['status']);
assert($d4['cross_month'] === false, 'D4 không được cộng gộp số của tháng sau');
assert(abs($d4['gbs_qty'] - 2) < 0.001, 'D4 phải giữ số lượng GBS gốc: ' . $d4['gbs_qty']);
assert($result['summary']['cross_month_orders'] === 0, 'D4 không được tính khớp chéo');

/* ── 5. Lệch thật, không có dữ liệu tháng sau → vẫn báo lệch ── */
$result = call_private($service, 'comparePlatform', [
    'shopee',
    [platform_row('E5', 'SKU5', 2, 200000)],
    ['E5' => gbs_order('SKU5', 1, 100000)],
    [],
]);
assert(order_by_id($result, 'E5')['status'] === 'mismatch', 'E5 phải là mismatch');
assert($result['summary']['mismatch_orders'] === 1, 'E5 phải vào mismatch_orders');

/* ── 6. Chỉ gom đơn của các tháng SAU tháng đang chọn ── */
$index = call_private($service, 'collectLaterMonthGbsOrders', [
    [
        '2026-04' => ['orders' => ['shopee|OLD' => ['qty' => 1.0, 'nmv' => 10.0]]],
        '2026-05' => ['orders' => ['shopee|NOW' => ['qty' => 1.0, 'nmv' => 10.0]]],
        '2026-06' => ['orders' => ['shopee|NEXT' => ['qty' => 1.0, 'nmv' => 10.0]]],
        '2026-07' => ['orders' => ['shopee|NEXT' => ['qty' => 2.0, 'nmv' => 20.0]]],
    ],
    '2026-05',
]);
assert(array_keys($index['shopee']) === ['NEXT'], 'Chỉ đơn của tháng sau mới được gom.');
assert(abs($index['shopee']['NEXT']['qty'] - 3.0) < 0.001, 'Phải cộng dồn nhiều tháng sau.');
assert(array_values($index['shopee']['NEXT']['months']) === ['2026-06', '2026-07'], 'Phải ghi nhận đủ các tháng.');

/* ── 7. Nhận diện trạng thái huỷ / hoàn trả (đơn huỷ không cần đối soát) ── */
$cancelled = ['Đã hủy', 'Đã huỷ', 'đã hủy', 'CANCELLED', 'canceled', 'Cancelled by system',
              'Huỷ bởi người mua', 'Returned', 'Refunded'];
$keep = ['Hoàn thành', 'Completed', 'Delivered', 'Đã giao', 'Chờ xác nhận', 'Đang giao', '', 'Đã thanh toán'];
foreach ($cancelled as $status) {
    assert(call_private($service, 'isCancelledStatus', [$status]) === true, "phải coi là huỷ: {$status}");
}
foreach ($keep as $status) {
    assert(call_private($service, 'isCancelledStatus', [$status]) === false, "không được coi là huỷ: {$status}");
}

echo "OK — tất cả self-check đối soát chéo GBS đều pass.\n";
