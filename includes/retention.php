<?php

declare(strict_types=1);

/**
 * Chỉ số giữ chân khách hàng, tính từ danh sách (khách, ngày mua) của các đơn
 * hoàn thành.
 *
 * Đơn vị là NGÀY MUA chứ không phải số đơn: hai đơn cùng một ngày thường là một
 * lần mua bị tách (nhiều shop, nhiều kiện), đếm theo đơn sẽ coi đó là "quay
 * lại" và thổi phồng tỷ lệ mua lại. Một khách là "mua lại" khi có từ 2 ngày mua
 * khác nhau trở lên.
 *
 * @param array<int,array{0:string,1:string}> $rows [buyer, 'YYYY-MM-DD'] mỗi đơn
 * @param string $cutoffYm  tháng cuối được quan sát ('YYYY-MM')
 * @return array{
 *   buyers:int, repeat_buyers:int, repeat_rate:float,
 *   interval: array{pairs:int, median_days:?int, within_30:float, within_60:float, within_90:float},
 *   cohorts: array<int,array{ym:string, size:int, retention:array<int,?float>}>
 * }
 */
function retention_compute(array $rows, string $cutoffYm, int $cohortCount = 12, int $horizon = 6): array
{
    // Gom ngày mua khác nhau theo khách.
    $days = [];
    foreach ($rows as [$buyer, $date]) {
        if ($buyer === '' || $date === '') { continue; }
        $days[$buyer][$date] = true;
    }

    $buyers = 0; $repeat = 0; $gaps = [];
    $firstYm = [];          // khách → tháng mua đầu
    $activeMonths = [];     // khách → set tháng có mua
    foreach ($days as $buyer => $set) {
        $list = array_keys($set);
        sort($list);
        $buyers++;
        if (count($list) >= 2) { $repeat++; }
        for ($i = 1, $n = count($list); $i < $n; $i++) {
            $gaps[] = (int) ((strtotime($list[$i]) - strtotime($list[$i - 1])) / 86400);
        }
        $firstYm[$buyer] = substr($list[0], 0, 7);
        foreach ($list as $d) { $activeMonths[$buyer][substr($d, 0, 7)] = true; }
    }

    sort($gaps);
    $pairs = count($gaps);
    $share = static fn(int $limit): float => $pairs > 0
        ? round(count(array_filter($gaps, static fn($g) => $g <= $limit)) / $pairs * 100, 1) : 0.0;
    $median = null;
    if ($pairs > 0) {
        $mid = intdiv($pairs, 2);
        $median = $pairs % 2 ? $gaps[$mid] : (int) round(($gaps[$mid - 1] + $gaps[$mid]) / 2);
    }

    // Nhóm theo tháng mua đầu: N tháng gần nhất tính đến tháng cắt.
    $addMonths = static fn(string $ym, int $k): string =>
        date('Y-m', strtotime($ym . '-01 ' . ($k >= 0 ? '+' : '') . $k . ' month'));
    $members = [];
    foreach ($firstYm as $buyer => $ym) { $members[$ym][] = $buyer; }

    $cohorts = [];
    for ($i = $cohortCount - 1; $i >= 0; $i--) {
        $ym = $addMonths($cutoffYm, -$i);
        $list = $members[$ym] ?? [];
        $size = count($list);
        $ret = [];
        for ($k = 1; $k <= $horizon; $k++) {
            $target = $addMonths($ym, $k);
            if ($target > $cutoffYm || $size === 0) { $ret[] = null; continue; } // chưa quan sát được
            $back = 0;
            foreach ($list as $b) { if (isset($activeMonths[$b][$target])) { $back++; } }
            $ret[] = round($back / $size * 100, 1);
        }
        $cohorts[] = ['ym' => $ym, 'size' => $size, 'retention' => $ret];
    }

    return [
        'buyers'        => $buyers,
        'repeat_buyers' => $repeat,
        'repeat_rate'   => $buyers > 0 ? round($repeat / $buyers * 100, 1) : 0.0,
        'interval'      => [
            'pairs' => $pairs, 'median_days' => $median,
            'within_30' => $share(30), 'within_60' => $share(60), 'within_90' => $share(90),
        ],
        'cohorts'       => $cohorts,
    ];
}
