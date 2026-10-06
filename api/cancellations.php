<?php

declare(strict_types=1);

/**
 * Phân tích huỷ đơn cho tab Đơn hàng: tỷ lệ huỷ theo sàn, theo phương thức
 * thanh toán, và lý do huỷ (ai huỷ + nhóm lý do).
 *
 * Tính ở cấp ĐƠN (platform, order_id), không phải cấp dòng sản phẩm — một đơn
 * nhiều sản phẩm chỉ được đếm một lần.
 *
 * Lý do huỷ chỉ có cho đơn nhập từ 3.5.6 trở đi, hoặc đơn còn dòng thô để điền
 * bù; đơn cũ hơn cần tải lại file đơn. `reason_coverage` cho giao diện biết bao
 * nhiêu đơn huỷ đã có lý do, để không trình bày một phần dữ liệu như toàn bộ.
 */

require dirname(__DIR__) . '/includes/bootstrap.php';
require dirname(__DIR__) . '/includes/cancellations.php';

require_auth();
require_method('GET');

try {
    $pdo = db($config);
    $params = [];
    $where  = sql_filters($params);

    $stmt = $pdo->prepare("
        SELECT platform,
               MAX(normalized_status = 'cancelled') AS cancelled,
               MAX(payment_method)                  AS payment_method,
               MAX(cancel_reason)                   AS cancel_reason
        FROM orders {$where}
        GROUP BY platform, order_id
    ");
    $stmt->execute($params);

    $total = 0; $cancelled = 0; $withReason = 0;
    $byPlatform = []; $byPayment = []; $byWho = []; $byGroup = [];

    while ($o = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $isCancel = (int) $o['cancelled'] === 1;
        $total++;
        $plat = (string) $o['platform'];
        $pay  = cancel_payment_group((string) ($o['payment_method'] ?? ''));

        $byPlatform[$plat] ??= ['orders' => 0, 'cancelled' => 0];
        $byPlatform[$plat]['orders']++;
        $byPayment[$pay] ??= ['orders' => 0, 'cancelled' => 0];
        $byPayment[$pay]['orders']++;

        if (!$isCancel) { continue; }
        $cancelled++;
        $byPlatform[$plat]['cancelled']++;
        $byPayment[$pay]['cancelled']++;

        $reason = trim((string) ($o['cancel_reason'] ?? ''));
        if ($reason === '') { continue; }
        $withReason++;
        $c = cancel_reason_classify($reason);
        $byWho[$c['who']]     = ($byWho[$c['who']] ?? 0) + 1;
        $byGroup[$c['group']] = ($byGroup[$c['group']] ?? 0) + 1;
    }

    $rate = static fn(int $c, int $n): float => $n > 0 ? round($c / $n * 100, 1) : 0.0;
    $rows = static function (array $map, string $keyName) use ($rate): array {
        $out = [];
        foreach ($map as $k => $v) {
            $out[] = [$keyName => $k, 'orders' => $v['orders'], 'cancelled' => $v['cancelled'],
                      'rate' => $rate($v['cancelled'], $v['orders'])];
        }
        usort($out, static fn($a, $b) => $b['orders'] <=> $a['orders']);
        return $out;
    };
    $shares = static function (array $map, string $keyName) use ($withReason): array {
        arsort($map);
        $out = [];
        foreach ($map as $k => $n) {
            $out[] = [$keyName => $k, 'count' => $n,
                      'share' => $withReason > 0 ? round($n / $withReason * 100, 1) : 0.0];
        }
        return $out;
    };

    json_response([
        'success'         => true,
        'total_orders'    => $total,
        'cancelled'       => $cancelled,
        'rate'            => $rate($cancelled, $total),
        'by_platform'     => $rows($byPlatform, 'platform'),
        'by_payment'      => $rows($byPayment, 'method'),
        'by_who'          => $shares($byWho, 'who'),
        'reasons'         => $shares($byGroup, 'group'),
        'reason_coverage' => ['with_reason' => $withReason, 'cancelled' => $cancelled],
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải phân tích huỷ đơn.');
}
