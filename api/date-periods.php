<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo = db($config);

    $months = $pdo->query("
        SELECT DISTINCT DATE_FORMAT(order_created_at, '%Y-%m') AS m
        FROM orders WHERE order_created_at IS NOT NULL
        UNION
        SELECT DISTINCT DATE_FORMAT(traffic_date, '%Y-%m') AS m
        FROM traffic_daily WHERE traffic_date IS NOT NULL
        ORDER BY m DESC
    ")->fetchAll(PDO::FETCH_COLUMN);

    $years = $pdo->query("
        SELECT DISTINCT YEAR(order_created_at) AS y FROM orders WHERE order_created_at IS NOT NULL
        UNION
        SELECT DISTINCT YEAR(traffic_date) AS y FROM traffic_daily WHERE traffic_date IS NOT NULL
        ORDER BY y DESC
    ")->fetchAll(PDO::FETCH_COLUMN);

    $monthList = array_map(static function (string $m): array {
        $dt = \DateTimeImmutable::createFromFormat('Y-m', $m);
        return ['value' => $m, 'label' => $dt ? $dt->format('m/Y') : $m];
    }, $months);

    $yearList = array_map(static fn($y) => ['value' => (string)$y, 'label' => 'Năm ' . $y], $years);

    json_response(['success' => true, 'months' => $monthList, 'years' => $yearList]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải danh sách thời gian.');
}
