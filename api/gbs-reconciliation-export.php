<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use Dashboard\Reconciliation\GbsReconciliationService;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

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
    $filename = implode('-', $filenameParts) . '.xlsx';

    $headers = [
        'Tháng đối soát',
        'Sàn',
        'Mã đơn',
        'Kết quả',
        'Lý do chưa khớp',
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
    ];

    $spreadsheet = new Spreadsheet();
    $sheet = $spreadsheet->getActiveSheet();
    $sheet->setTitle('Don chua khop');
    $sheet->fromArray($headers, null, 'A1');

    $rowIndex = 2;
    foreach ($rows as $row) {
        $sheet->fromArray([
            $data['month'] ?? $month,
            exportPlatformLabel((string) ($row['platform'] ?? '')),
            (string) ($row['order_id'] ?? ''),
            exportStatusLabel((string) ($row['status'] ?? '')),
            exportReasonLabel($row),
            (string) ($row['platform_reconcile_at'] ?? ''),
            implode(', ', array_filter(array_map('strval', $row['platform_statuses'] ?? []))),
            (float) ($row['platform_qty'] ?? 0),
            (float) ($row['gbs_qty'] ?? 0),
            (float) ($row['qty_diff'] ?? 0),
            (float) ($row['platform_nmv'] ?? 0),
            (float) ($row['gbs_nmv'] ?? 0),
            (float) ($row['nmv_diff'] ?? 0),
            exportPlatformSkuList($row['platform_skus'] ?? []),
            exportGbsSkuList($row['gbs_skus'] ?? []),
            (string) ($row['note'] ?? ''),
        ], null, 'A' . $rowIndex);
        $rowIndex++;
    }

    $lastColumn = Coordinate::stringFromColumnIndex(count($headers));
    $lastRow = max(1, $rowIndex - 1);

    $sheet->freezePane('A2');
    $sheet->setAutoFilter("A1:{$lastColumn}{$lastRow}");

    $sheet->getStyle("A1:{$lastColumn}1")->applyFromArray([
        'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
        'fill' => [
            'fillType' => Fill::FILL_SOLID,
            'startColor' => ['rgb' => '1D4ED8'],
        ],
        'alignment' => [
            'vertical' => \PhpOffice\PhpSpreadsheet\Style\Alignment::VERTICAL_CENTER,
            'horizontal' => \PhpOffice\PhpSpreadsheet\Style\Alignment::HORIZONTAL_CENTER,
        ],
    ]);

    $sheet->getStyle("A1:{$lastColumn}{$lastRow}")->applyFromArray([
        'borders' => [
            'allBorders' => [
                'borderStyle' => Border::BORDER_THIN,
                'color' => ['rgb' => 'CBD5E1'],
            ],
        ],
        'alignment' => [
            'vertical' => \PhpOffice\PhpSpreadsheet\Style\Alignment::VERTICAL_TOP,
            'wrapText' => true,
        ],
    ]);

    foreach (['H', 'I', 'J'] as $column) {
        $sheet->getStyle("{$column}2:{$column}{$lastRow}")
            ->getNumberFormat()
            ->setFormatCode('#,##0.####');
    }
    foreach (['K', 'L', 'M'] as $column) {
        $sheet->getStyle("{$column}2:{$column}{$lastRow}")
            ->getNumberFormat()
            ->setFormatCode('#,##0');
    }

    $widths = [
        'A' => 14,
        'B' => 14,
        'C' => 22,
        'D' => 16,
        'E' => 36,
        'F' => 20,
        'G' => 28,
        'H' => 12,
        'I' => 12,
        'J' => 12,
        'K' => 14,
        'L' => 14,
        'M' => 14,
        'N' => 38,
        'O' => 38,
        'P' => 48,
    ];
    foreach ($widths as $column => $width) {
        $sheet->getColumnDimension($column)->setWidth($width);
    }

    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');

    $writer = new Xlsx($spreadsheet);
    $writer->save('php://output');
    $spreadsheet->disconnectWorksheets();
    unset($spreadsheet);
    exit;
} catch (\Throwable $e) {
    json_exception($e, 'Không thể export danh sách đơn chưa khớp.');
}

function exportPlatformLabel(string $platform): string
{
    return match ($platform) {
        'shopee' => 'Shopee',
        'lazada' => 'Lazada',
        'tiktokshop' => 'TikTok Shop',
        default => $platform,
    };
}

function exportStatusLabel(string $status): string
{
    return match ($status) {
        'missing_in_gbs' => 'Thiếu GBS',
        'missing_in_platform' => 'Thiếu dữ liệu sàn',
        'mismatch' => 'Lệch',
        default => $status,
    };
}

function exportReasonLabel(array $row): string
{
    $status = (string) ($row['status'] ?? '');
    $reasons = [];

    if ($status === 'missing_in_gbs') {
        $reasons[] = 'Đơn có trên sàn nhưng không tìm thấy trong GBS của tháng đã chọn.';
    }
    if ($status === 'missing_in_platform') {
        $reasons[] = 'Đơn có trong GBS nhưng chưa thấy ở dữ liệu sàn.';
    }

    if (abs((float) ($row['qty_diff'] ?? 0)) >= 0.001) {
        $reasons[] = 'Lệch số lượng sản phẩm giữa sàn và GBS.';
    }

    if (abs((float) ($row['nmv_diff'] ?? 0)) >= 0.05) {
        $reasons[] = 'Lệch NMV sau đối soát.';
    }

    $note = trim((string) ($row['note'] ?? ''));
    if ($note !== '' && str_contains(mb_strtolower($note), 'combo')) {
        $reasons[] = 'Cần kiểm tra lại quy đổi combo sang SKU đơn.';
    }

    if ($reasons === []) {
        return $note !== '' ? $note : 'Cần kiểm tra lại chi tiết đơn hàng.';
    }

    return implode(' ', array_values(array_unique($reasons)));
}

function exportPlatformSkuList(array $items): string
{
    return implode(' | ', array_map(static function (array $sku): string {
        $value = (string) ($sku['sku'] ?? '');
        $qty = (string) ($sku['comparable_qty'] ?? $sku['quantity'] ?? 0);
        return trim($value) !== '' ? $value . ' x' . $qty : 'x' . $qty;
    }, $items));
}

function exportGbsSkuList(array $items): string
{
    return implode(' | ', array_map(static function (array $sku): string {
        $value = (string) ($sku['sku'] ?? '');
        $qty = (string) ($sku['quantity'] ?? 0);
        return trim($value) !== '' ? $value . ' x' . $qty : 'x' . $qty;
    }, $items));
}
