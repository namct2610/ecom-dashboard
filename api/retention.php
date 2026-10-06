<?php

declare(strict_types=1);

/**
 * Giữ chân khách hàng cho tab Khách hàng: tỷ lệ mua lại, khoảng cách giữa hai
 * lần mua, và bảng giữ chân theo tháng mua đầu.
 *
 * Khác các chỉ số khác, đây là phân tích theo chiều dài thời gian nên KHÔNG chỉ
 * nhìn trong kỳ: dùng toàn bộ lịch sử tính đến ngày cuối kỳ đang chọn (ngày cắt).
 * Bộ lọc sàn vẫn áp dụng.
 *
 * Nhận diện khách bằng buyer_username, nên chỉ Shopee và TikTok Shop được tính —
 * Lazada che tên người mua. Chỉ đơn hoàn thành/đã giao được coi là một lần mua.
 */

require dirname(__DIR__) . '/includes/bootstrap.php';
require dirname(__DIR__) . '/includes/retention.php';

require_auth();
require_method('GET');

try {
    $pdo = db($config);

    $range  = request_date_range();
    $cutoff = $range ? $range[1] : date('Y-m-d');
    $cutoffExcl = (new DateTimeImmutable($cutoff))->modify('+1 day')->format('Y-m-d');

    $where  = ["normalized_status IN ('completed','delivered')",
               "buyer_username IS NOT NULL", "buyer_username <> ''",
               "order_created_at < :cut"];
    $params = [':cut' => $cutoffExcl . ' 00:00:00'];
    $platform = (string) ($_GET['platform'] ?? 'all');
    if (in_array($platform, ['shopee', 'lazada', 'tiktokshop'], true)) {
        $where[] = 'platform = :pf';
        $params[':pf'] = $platform;
    }

    // Một dòng một đơn: ngày tạo sớm nhất của đơn đó. Khoá khách theo sàn +
    // tên đăng nhập: cùng một tên trên Shopee và TikTok là hai người khác nhau.
    $stmt = $pdo->prepare("
        SELECT CONCAT(platform, '|', MAX(buyer_username)) AS buyer, DATE(MIN(order_created_at)) AS d
        FROM orders
        WHERE " . implode(' AND ', $where) . "
        GROUP BY platform, order_id
    ");
    $stmt->execute($params);
    $rows = [];
    while ($r = $stmt->fetch(PDO::FETCH_NUM)) {
        $rows[] = [(string) $r[0], (string) $r[1]];
    }

    $result = retention_compute($rows, substr($cutoff, 0, 7), 12, 6);

    json_response(['success' => true, 'cutoff' => $cutoff, 'platform' => $platform] + $result);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải dữ liệu giữ chân khách hàng.');
}
