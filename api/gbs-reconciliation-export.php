<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use Dashboard\Reconciliation\GbsReconciliationService;

require_auth();
require_method('GET');

try {
    $month = trim((string) ($_GET['month'] ?? ''));
    $platform = trim((string) ($_GET['platform'] ?? ''));
    if ($month === '') {
        throw new RuntimeException('Thiếu tháng đối soát để export.');
    }

    $service = new GbsReconciliationService(dirname(__DIR__), $config);
    $data = $service->exportUnmatchedPlatformOrders($month, $platform !== '' ? $platform : null);
    $rows = $data['rows'] ?? [];

    $filenameParts = ['gbs-unmatched', $month];
    if ($platform !== '') {
        $filenameParts[] = $platform;
    }
    $filename = implode('-', $filenameParts) . '.csv';

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');

    $output = fopen('php://output', 'wb');
    if ($output === false) {
        throw new RuntimeException('Không thể tạo file export.');
    }

    fwrite($output, "\xEF\xBB\xBF");
    fputcsv($output, [
        'Tháng đối soát',
        'Sàn',
        'Mã đơn',
        'Kết quả',
        'Thời gian sàn',
        'Trạng thái sàn',
        'SL sàn',
        'SL GBS',
        'Lệch SL',
        'NMV sàn',
        'NMV GBS',
        'Lệch NMV',
        'SKU sàn',
        'SKU GBS',
        'Ghi chú',
    ]);

    foreach ($rows as $row) {
        fputcsv($output, [
            $data['month'] ?? $month,
            match ($row['platform'] ?? '') {
                'shopee' => 'Shopee',
                'lazada' => 'Lazada',
                'tiktokshop' => 'TikTok Shop',
                default => (string) ($row['platform'] ?? ''),
            },
            (string) ($row['order_id'] ?? ''),
            match ($row['status'] ?? '') {
                'missing_in_gbs' => 'Thiếu GBS',
                'mismatch' => 'Lệch',
                default => (string) ($row['status'] ?? ''),
            },
            (string) ($row['platform_reconcile_at'] ?? ''),
            implode(', ', array_filter(array_map('strval', $row['platform_statuses'] ?? []))),
            (string) ($row['platform_qty'] ?? 0),
            (string) ($row['gbs_qty'] ?? 0),
            (string) ($row['qty_diff'] ?? 0),
            (string) ($row['platform_nmv'] ?? 0),
            (string) ($row['gbs_nmv'] ?? 0),
            (string) ($row['nmv_diff'] ?? 0),
            implode(' | ', array_map(static function (array $sku): string {
                $value = (string) ($sku['sku'] ?? '');
                $qty = (string) ($sku['comparable_qty'] ?? $sku['quantity'] ?? 0);
                return $value . ' x' . $qty;
            }, $row['platform_skus'] ?? [])),
            implode(' | ', array_map(static function (array $sku): string {
                $value = (string) ($sku['sku'] ?? '');
                $qty = (string) ($sku['quantity'] ?? 0);
                return $value . ' x' . $qty;
            }, $row['gbs_skus'] ?? [])),
            (string) ($row['note'] ?? ''),
        ]);
    }

    fclose($output);
    exit;
} catch (\Throwable $e) {
    json_exception($e, 'Không thể export danh sách đơn chưa khớp.');
}
