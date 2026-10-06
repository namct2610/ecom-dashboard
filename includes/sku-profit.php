<?php

declare(strict_types=1);

/**
 * Lãi sau phí sàn theo SKU và phân loại ABC.
 *
 * Phí sàn ghi ở cấp ĐƠN, nên phải chia xuống từng SKU trong đơn: mỗi dòng nhận
 * phần phí theo tỷ trọng doanh thu của nó trong đơn. Đơn doanh thu 0 (toàn
 * quà tặng) chia đều theo số dòng để phí không bị mất.
 *
 * Nguồn phí do nơi gọi quyết định theo TỪNG ĐƠN (đối soát > phí trong file đơn >
 * ước tính). `coverage` của một SKU = phần doanh thu của nó nằm trong đơn đã có
 * đối soát, để người xem biết con số nào là thật, con số nào là ước tính.
 *
 * ABC theo doanh thu, xét luỹ kế TRƯỚC khi cộng SKU đang xét: SKU vượt ngưỡng
 * vẫn thuộc hạng của ngưỡng đó, và SKU đầu luôn là A dù một mình chiếm >80%.
 *   A: luỹ kế trước < 80%   B: < 95%   C: còn lại
 *
 * @param array<int,array{order:string,sku:string,name:string,qty:int|float,revenue:float}> $lines
 * @param array<string,array{source:string,fee:float}> $orderFees  theo khoá đơn
 */
function sku_profit_compute(array $lines, array $orderFees): array
{
    // Doanh thu và số dòng của từng đơn — mẫu số để chia phí.
    $orderRev = [];
    $orderLines = [];
    foreach ($lines as $l) {
        $orderRev[$l['order']] = ($orderRev[$l['order']] ?? 0.0) + (float) $l['revenue'];
        $orderLines[$l['order']] = ($orderLines[$l['order']] ?? 0) + 1;
    }

    $skus = [];
    foreach ($lines as $l) {
        $o = $l['order'];
        $fee = $orderFees[$o] ?? ['source' => 'estimated', 'fee' => 0.0];
        $share = $orderRev[$o] > 0 ? (float) $l['revenue'] / $orderRev[$o] : 1 / $orderLines[$o];
        $alloc = (float) $fee['fee'] * $share;

        $k = $l['sku'];
        $skus[$k] ??= ['sku' => $k, 'names' => [], 'revenue' => 0.0, 'units' => 0.0,
                       'orders' => [], 'fees' => 0.0, 'settled_revenue' => 0.0];
        $skus[$k]['revenue'] += (float) $l['revenue'];
        $skus[$k]['units']   += (float) $l['qty'];
        $skus[$k]['fees']    += $alloc;
        $skus[$k]['orders'][$o] = true;
        if ($fee['source'] === 'settlement') {
            $skus[$k]['settled_revenue'] += (float) $l['revenue'];
        }
        $name = trim($l['name']);
        if ($name !== '') {
            $skus[$k]['names'][$name] = ($skus[$k]['names'][$name] ?? 0) + 1;
        }
    }

    usort($skus, static fn($a, $b) => $b['revenue'] <=> $a['revenue']);
    $total = array_sum(array_column($skus, 'revenue'));

    $out = [];
    $cum = 0.0;
    $abc = ['A' => ['count' => 0, 'revenue' => 0.0], 'B' => ['count' => 0, 'revenue' => 0.0], 'C' => ['count' => 0, 'revenue' => 0.0]];
    $tot = ['revenue' => 0.0, 'fees' => 0.0, 'settled_revenue' => 0.0];
    foreach ($skus as $s) {
        $before = $total > 0 ? $cum / $total * 100 : 100.0;
        $class = $before < 80 ? 'A' : ($before < 95 ? 'B' : 'C');
        $cum += $s['revenue'];

        arsort($s['names']);
        $rev = $s['revenue'];
        $net = $rev - $s['fees'];
        $out[] = [
            'sku'       => $s['sku'],
            'name'      => (string) (array_key_first($s['names']) ?? ''),
            'class'     => $class,
            'revenue'   => round($rev, 2),
            'units'     => (int) round($s['units']),
            'orders'    => count($s['orders']),
            'fees'      => round($s['fees'], 2),
            'net'       => round($net, 2),
            'margin'    => $rev > 0 ? round($net / $rev * 100, 1) : 0.0,
            'fee_rate'  => $rev > 0 ? round($s['fees'] / $rev * 100, 1) : 0.0,
            'coverage'  => $rev > 0 ? round($s['settled_revenue'] / $rev * 100, 1) : 0.0,
        ];
        $abc[$class]['count']++;
        $abc[$class]['revenue'] += $rev;
        $tot['revenue'] += $rev;
        $tot['fees'] += $s['fees'];
        $tot['settled_revenue'] += $s['settled_revenue'];
    }

    foreach ($abc as $k => $v) {
        $abc[$k]['revenue'] = round($v['revenue'], 2);
        $abc[$k]['share'] = $total > 0 ? round($v['revenue'] / $total * 100, 1) : 0.0;
    }
    $net = $tot['revenue'] - $tot['fees'];

    return [
        'skus'   => $out,
        'abc'    => $abc,
        'totals' => [
            'revenue'  => round($tot['revenue'], 2),
            'fees'     => round($tot['fees'], 2),
            'net'      => round($net, 2),
            'margin'   => $tot['revenue'] > 0 ? round($net / $tot['revenue'] * 100, 1) : 0.0,
            'coverage' => $tot['revenue'] > 0 ? round($tot['settled_revenue'] / $tot['revenue'] * 100, 1) : 0.0,
        ],
    ];
}
