<?php

/**
 * Self-check cho việc lưu dòng thô và xuất ngược ra đúng format gốc.
 * Tự sinh file mô phỏng 3 kiểu bố cục có thật:
 *   - header ngay dòng đầu            (Shopee/Lazada đơn hàng)
 *   - header + dòng mô tả cột         (TikTok đơn hàng)
 *   - vài dòng tựa đề rồi mới header  (báo cáo doanh thu Shopee)
 * Chạy: php dev/test-raw-export.php
 */

declare(strict_types=1);

$root = dirname(__DIR__);
require $root . '/includes/bootstrap.php';

use Dashboard\Parsers\RawRowCapture;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

$tmp = sys_get_temp_dir() . '/zott-raw-export-test';
@mkdir($tmp, 0777, true);
$fails = 0;
$check = function (string $label, bool $ok, string $extra = '') use (&$fails): void {
    printf("%-54s %s%s\n", $label, $ok ? 'OK' : 'FAIL', $ok ? '' : "  <- {$extra}");
    if (!$ok) { $fails++; }
};

function makeFile(string $path, string $sheetName, array $rows): void
{
    $ss = new Spreadsheet();
    $sheet = $ss->getActiveSheet();
    $sheet->setTitle($sheetName);
    foreach ($rows as $r => $line) {
        foreach (array_values($line) as $c => $v) {
            if ($v === '' || $v === null) { continue; }
            $sheet->setCellValueExplicit([$c + 1, $r + 1], (string) $v, DataType::TYPE_STRING);
        }
    }
    (new Xlsx($ss))->save($path);
}

/** Dựng lại file y hệt api/export-raw.php, rồi đọc lại để so từng ô. */
function rebuildAndCompare(array $raw, string $platform, string $fileType, string $out): array
{
    $ss = new Spreadsheet();
    $sheet = $ss->getActiveSheet();
    $sheet->setTitle(mb_substr($raw['sheet_name'] ?? 'Data', 0, 31));
    $rowNum = 1;
    foreach ($raw['prologue'] ?? [] as $line) {
        foreach (array_values((array) $line) as $i => $v) {
            if ($v === '') { continue; }
            $sheet->setCellValueExplicit([$i + 1, $rowNum], (string) $v, DataType::TYPE_STRING);
        }
        $rowNum++;
    }
    foreach ($raw['headers'] as $i => $n) {
        $sheet->setCellValueExplicit([$i + 1, $rowNum], $n, DataType::TYPE_STRING);
    }
    $rowNum++;
    foreach ($raw['preamble'] ?? [] as $line) {
        foreach (array_values((array) $line) as $i => $v) {
            if ($v === '') { continue; }
            $sheet->setCellValueExplicit([$i + 1, $rowNum], (string) $v, DataType::TYPE_STRING);
        }
        $rowNum++;
    }
    foreach ($raw['rows'] as $r) {
        foreach ($raw['headers'] as $i => $n) {
            $v = $r['payload'][$n] ?? null;
            if ($v === null || $v === '') { continue; }
            $sheet->setCellValueExplicit([$i + 1, $rowNum], (string) $v, DataType::TYPE_STRING);
        }
        $rowNum++;
    }
    (new Xlsx($ss))->save($out);

    $back = RawRowCapture::capture($out, $platform, $fileType);
    $byKey = [];
    foreach ($back['rows'] as $r) { $byKey[$r['row_key']] = $r['payload']; }

    $diff = 0;
    foreach ($raw['rows'] as $r) {
        $b = $byKey[$r['row_key']] ?? null;
        if ($b === null) { $diff++; continue; }
        if ($b !== $r['payload']) { $diff++; }
    }

    return ['headers_same' => $back['headers'] === $raw['headers'], 'rows_back' => count($back['rows']), 'diff' => $diff];
}

/* ── 1. Bố cục thường: header ở dòng đầu ── */
$f = $tmp . '/shopee-orders.xlsx';
makeFile($f, 'Sheet1', [
    ['Mã đơn hàng', 'SKU sản phẩm', 'Ngày đặt hàng', 'Tên Người mua', 'Tổng số tiền'],
    ['260301W2QGR51T', 'MON055', '2026-03-01 00:36', 'Nguyễn Văn A', '113360.00'],
    ['260302X3TFP12K', 'YOG100', '2026-03-02 09:15', 'Trần Thị B', '250000.50'],
]);
$raw = RawRowCapture::capture($f, 'shopee', 'orders');
$check('Bố cục thường: đọc đủ dòng', count($raw['rows']) === 2, (string) count($raw['rows']));
$check('Bố cục thường: lấy được ngày', ($raw['rows'][0]['row_date'] ?? null) === '2026-03-01');
$r = rebuildAndCompare($raw, 'shopee', 'orders', $tmp . '/out1.xlsx');
$check('Bố cục thường: xuất lại khớp tuyệt đối', $r['headers_same'] && $r['diff'] === 0 && $r['rows_back'] === 2);

/* ── 2. Số có đuôi .00 và chuỗi ngày không bị Excel đổi kiểu ── */
$back = RawRowCapture::capture($tmp . '/out1.xlsx', 'shopee', 'orders');
$p = $back['rows'][0]['payload'];
$check('Giữ nguyên "113360.00" (không rụng số 0)', ($p['Tổng số tiền'] ?? '') === '113360.00', $p['Tổng số tiền'] ?? 'NULL');
$check('Giữ nguyên "2026-03-01 00:36" (không thành serial)', ($p['Ngày đặt hàng'] ?? '') === '2026-03-01 00:36', $p['Ngày đặt hàng'] ?? 'NULL');
$check('Giữ nguyên tiếng Việt có dấu', ($p['Tên Người mua'] ?? '') === 'Nguyễn Văn A');

/* ── 3. TikTok: header + dòng mô tả cột ── */
$f = $tmp . '/tiktok-orders.xlsx';
makeFile($f, 'Sheet1', [
    ['Order ID', 'Seller SKU', 'Created Time', 'Quantity'],
    ['Platform unique order ID.', 'Seller sku input by the seller.', 'Order created time.', 'Qty.'],
    ['583310629161108873', 'MON055GC24VAN', '2026/03/03 10:00:00', '2'],
    ['583310629161108874', 'YOG100GC04DAU', '2026/03/04 11:00:00', '1'],
]);
$raw = RawRowCapture::capture($f, 'tiktokshop', 'orders');
$check('TikTok: bỏ dòng mô tả cột', count($raw['rows']) === 2, (string) count($raw['rows']));
$check('TikTok: giữ lại dòng mô tả để xuất lại', count($raw['preamble'] ?? []) === 1);
$check('TikTok: đọc được ngày kiểu 2026/03/03', ($raw['rows'][0]['row_date'] ?? null) === '2026-03-03',
    (string) ($raw['rows'][0]['row_date'] ?? 'NULL'));
$r = rebuildAndCompare($raw, 'tiktokshop', 'orders', $tmp . '/out2.xlsx');
$check('TikTok: xuất lại khớp tuyệt đối', $r['headers_same'] && $r['diff'] === 0 && $r['rows_back'] === 2,
    "diff={$r['diff']} rows={$r['rows_back']}");

/* ── 4. Shopee tài chính: có dòng tựa đề phía trên header ── */
$f = $tmp . '/shopee-income.xlsx';
makeFile($f, 'Doanh thu', [
    ['Thông tin đơn hàng', '', '', ''],
    ['', '', '', ''],
    ['Mã giao dịch', 'Đơn hàng / Sản phẩm', 'Mã đơn hàng', 'Ngày đặt hàng'],
    ['1', 'Order', '260629CV0V9A5Q', '2026-06-29'],
    ['2', 'Sku', '260629CV0V9A5Q', '2026-06-29'],
]);
$raw = RawRowCapture::capture($f, 'shopee', 'settlement');
$check('Shopee tài chính: giữ 2 dòng tựa đề phía trên', count($raw['prologue'] ?? []) === 2,
    (string) count($raw['prologue'] ?? []));
$check('Shopee tài chính: giữ tên sheet gốc', ($raw['sheet_name'] ?? '') === 'Doanh thu', $raw['sheet_name'] ?? 'NULL');
$check('Shopee tài chính: đọc đủ dòng Order + Sku', count($raw['rows']) === 2, (string) count($raw['rows']));
$r = rebuildAndCompare($raw, 'shopee', 'settlement', $tmp . '/out3.xlsx');
$check('Shopee tài chính: xuất lại khớp tuyệt đối', $r['headers_same'] && $r['diff'] === 0 && $r['rows_back'] === 2,
    "diff={$r['diff']} rows={$r['rows_back']}");

/* ── 5. Tải chồng kỳ: cùng đơn thì ghi đè, không nhân bản ── */
$f2 = $tmp . '/shopee-orders-overlap.xlsx';
makeFile($f2, 'Sheet1', [
    ['Mã đơn hàng', 'SKU sản phẩm', 'Ngày đặt hàng', 'Tên Người mua', 'Tổng số tiền'],
    ['260302X3TFP12K', 'YOG100', '2026-03-02 09:15', 'Trần Thị B', '250000.50'],
    ['260303Z9QWE33M', 'FRC050', '2026-03-03 14:00', 'Lê Văn C', '99000.00'],
]);
$a = RawRowCapture::capture($tmp . '/shopee-orders.xlsx', 'shopee', 'orders');
$b = RawRowCapture::capture($f2, 'shopee', 'orders');
$merged = [];
foreach (array_merge($a['rows'], $b['rows']) as $row) { $merged[$row['row_key']] = $row; }
$check('Kỳ chồng lấn: 2+2 dòng gộp còn 3 (khử trùng theo mã đơn)', count($merged) === 3, (string) count($merged));

array_map('unlink', glob($tmp . '/*.xlsx') ?: []);
echo $fails === 0 ? "\nOK — lưu dòng thô và xuất lại đúng format đều pass.\n" : "\n$fails lỗi.\n";
exit($fails === 0 ? 0 : 1);
