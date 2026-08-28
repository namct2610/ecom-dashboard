<?php

/**
 * Self-check cho việc đọc báo cáo tài chính của sàn.
 * Tự sinh file xlsx mô phỏng đúng cấu trúc thật của 3 sàn, không cần file gốc.
 * Chạy: php dev/test-settlement.php
 */

declare(strict_types=1);

$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';
require $root . '/includes/Parsers/SettlementParser.php';

use Dashboard\Parsers\SettlementParser;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

$tmp = sys_get_temp_dir() . '/zott-settlement-test';
@mkdir($tmp, 0777, true);
$fails = 0;
$check = function (string $label, bool $ok, string $extra = '') use (&$fails): void {
    printf("%-56s %s%s\n", $label, $ok ? 'OK' : 'FAIL', $ok ? '' : "  <- {$extra}");
    if (!$ok) { $fails++; }
};

function writeSheet(string $path, array $sheets): void
{
    $ss = new Spreadsheet();
    $ss->removeSheetByIndex(0);
    foreach ($sheets as $name => $rows) {
        $sheet = $ss->createSheet();
        $sheet->setTitle($name);
        $sheet->fromArray($rows, null, 'A1');
    }
    (new Xlsx($ss))->save($path);
}

/* ───────── Shopee: có cả dòng Order lẫn Sku, phí lặp y hệt ───────── */
$shopeeHeader = ['Mã giao dịch', 'Đơn hàng / Sản phẩm', 'Mã đơn hàng', 'Mã sản phẩm',
                 'Mã ưu đãi do Người Bán chịu', 'Phí cố định', 'Phí Dịch Vụ', 'Phí xử lý giao dịch',
                 'Phí hoa hồng Tiếp thị liên kết', 'Transaction Fee Rate (%)'];
$shopeeFile = $tmp . '/shopee.xlsx';
writeSheet($shopeeFile, ['Summary' => [['Bao cáo doanh thu']], 'Doanh thu' => [
    ['Thông tin đơn hàng'], [], $shopeeHeader,
    [1, 'Order', 'SP001', '-',        -10000, -17500, -10700, -8400, -9677, 6.00],
    [1, 'Sku',   'SP001', '25030208',  -10000, -17500, -10700, -8400, -9677, 6.00],
    [2, 'Order', 'SP002', '-',              0, -20000,      0,     0,     0, 6.00],
]]);

$res = SettlementParser::parse($shopeeFile);
$byOrder = [];
foreach ($res['rows'] as $r) { $byOrder[$r['order_id']] = $r; }
$check('Shopee: nhận diện đúng sàn', $res['platform'] === 'shopee', $res['platform']);
$check('Shopee: 2 đơn (bỏ dòng Sku trùng)', count($res['rows']) === 2, (string) count($res['rows']));
$check('Shopee: KHÔNG nhân đôi phí Order/Sku',
    abs($byOrder['SP001']['fee_platform'] - 36600) < 1, (string) $byOrder['SP001']['fee_platform']);
$check('Shopee: bỏ cột "Transaction Fee Rate (%)"',
    !isset($byOrder['SP001']['details']['Transaction Fee Rate (%)']));
$check('Shopee: affiliate vào nhóm marketing',
    abs($byOrder['SP001']['fee_marketing'] - 9677) < 1, (string) $byOrder['SP001']['fee_marketing']);
$check('Shopee: mã ưu đãi vào nhóm khuyến mãi tự chịu',
    abs($byOrder['SP001']['fee_promotion'] - 10000) < 1, (string) $byOrder['SP001']['fee_promotion']);

/* ───────── Lazada: dạng dọc, mỗi dòng một khoản ───────── */
$lazadaFile = $tmp . '/lazada.xlsx';
writeSheet($lazadaFile, ['Income Overview' => [
    ['kỳ báo cáo', 'Mã sao kê', 'Ngày giao dịch', 'Tên phí', 'Số tiền (Đã bao gồm thuế)',
     'VAT Amount', 'Đã thanh toán', 'Ngày phát hành', 'Bình luận', 'Ngày tạo đơn', 'Mã đơn hàng'],
    ['x', 'VN1', '01 Jun 2026', 'Phí cố định',                -20000, 0, '', '', '', '', 'LZ001'],
    ['x', 'VN1', '01 Jun 2026', 'Phí xử lý đơn hàng',         -9577,  0, '', '', '', '', 'LZ001'],
    ['x', 'VN1', '01 Jun 2026', 'Phí quảng cáo tiếp thị liên kết', -5000, 0, '', '', '', '', 'LZ001'],
    ['x', 'VN1', '01 Jun 2026', 'Giảm Giá Bằng Xu',           -3000,  0, '', '', '', '', 'LZ001'],
    ['x', 'VN1', '01 Jun 2026', 'Giá trị sản phẩm',           500000, 0, '', '', '', '', 'LZ001'],
]]);

$res = SettlementParser::parse($lazadaFile);
$lz = $res['rows'][0] ?? [];
$check('Lazada: nhận diện đúng sàn', $res['platform'] === 'lazada', $res['platform']);
$check('Lazada: gộp nhiều dòng về 1 đơn', count($res['rows']) === 1, (string) count($res['rows']));
$check('Lazada: phí sàn = cố định + xử lý đơn',
    abs(($lz['fee_platform'] ?? 0) - 29577) < 1, (string) ($lz['fee_platform'] ?? 0));
$check('Lazada: quảng cáo affiliate vào marketing', abs(($lz['fee_marketing'] ?? 0) - 5000) < 1);
$check('Lazada: giảm giá bằng xu vào khuyến mãi', abs(($lz['fee_promotion'] ?? 0) - 3000) < 1);
$check('Lazada: KHÔNG tính "Giá trị sản phẩm" là phí',
    !isset($lz['details']['Giá trị sản phẩm']));

/* ───────── TikTok: dạng ngang ───────── */
$tiktokFile = $tmp . '/tiktok.xlsx';
writeSheet($tiktokFile, ['Chi tiết đơn hàng' => [
    ['ID đơn hàng/điều chỉnh', 'Loại giao dịch', 'Tổng phí', 'Phí giao dịch',
     'Phí hoa hồng của TikTok Shop', 'Hoa hồng liên kết', 'Phí dịch vụ Voucher Xtra',
     'Phí vận chuyển của người bán'],
    ['TT001', 'Đơn hàng', -70000, -16575, -40270, -9000, -10260, -5000],
    ['TT001', 'Đơn hàng',      0,       0,       0,     0,       0,      0],
]]);

$res = SettlementParser::parse($tiktokFile);
$tt = $res['rows'][0] ?? [];
$check('TikTok: nhận diện đúng sàn', $res['platform'] === 'tiktokshop', $res['platform']);
$check('TikTok: phí sàn = giao dịch + hoa hồng',
    abs(($tt['fee_platform'] ?? 0) - 56845) < 1, (string) ($tt['fee_platform'] ?? 0));
$check('TikTok: affiliate + Voucher Xtra vào marketing',
    abs(($tt['fee_marketing'] ?? 0) - 19260) < 1, (string) ($tt['fee_marketing'] ?? 0));
$check('TikTok: KHÔNG tính phí vận chuyển vào chi phí',
    !isset($tt['details']['Phí vận chuyển của người bán']));
$check('TikTok: dòng điều chỉnh toàn 0 không phá số', abs(($tt['fee_platform'] ?? 0) - 56845) < 1);

/* ───────── Phân loại & nhận diện ───────── */
$check('Phân loại: "Phí hoa hồng" -> platform', SettlementParser::classify('Phí hoa hồng của TikTok Shop') === 'platform');
$check('Phân loại: "Phí quảng cáo GMV Max" -> marketing', SettlementParser::classify('Phí quảng cáo GMV Max') === 'marketing');
$check('Phân loại: "Mã hoàn xu do Người Bán chịu" -> promotion', SettlementParser::classify('Mã hoàn xu do Người Bán chịu') === 'promotion');
$check('Phân loại: khoản vận chuyển bị bỏ qua', SettlementParser::classify('Phí vận chuyển thực tế') === null);
$check('Phân loại: khoản lạ -> platform (giữ tên trong details)', SettlementParser::classify('Phí gì đó mới toanh') === 'platform');

$notSettlement = $tmp . '/orders.xlsx';
writeSheet($notSettlement, ['Sheet1' => [['Order ID', 'Seller SKU'], ['A', 'B']]]);
$check('File đơn hàng thường KHÔNG bị nhận nhầm', !SettlementParser::isSettlementFile($notSettlement));
$check('Cả 3 báo cáo đều được nhận diện',
    SettlementParser::isSettlementFile($shopeeFile) && SettlementParser::isSettlementFile($lazadaFile)
    && SettlementParser::isSettlementFile($tiktokFile));

array_map('unlink', glob($tmp . '/*.xlsx') ?: []);
echo $fails === 0 ? "\nOK — tất cả self-check báo cáo tài chính đều pass.\n" : "\n$fails lỗi.\n";
exit($fails === 0 ? 0 : 1);
