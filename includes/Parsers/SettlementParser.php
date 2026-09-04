<?php

declare(strict_types=1);

namespace Dashboard\Parsers;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;
use RuntimeException;

/**
 * Sheet báo cáo của sàn đệm rất nhiều cột rỗng — bản Shopee thật là 1301 dòng
 * x 1000 cột (1,3 triệu ô) trong khi chỉ 53 cột có dữ liệu. PhpSpreadsheet tạo
 * một object cho mỗi ô nên đọc hết sẽ vượt memory_limit 256M của server. Lọc
 * theo số cột tối đa cần dùng là đủ để về ngưỡng an toàn.
 */
final class SettlementColumnFilter implements IReadFilter
{
    public function __construct(private int $maxColumn = 80) {}

    public function readCell($columnAddress, $row, $worksheetName = ''): bool
    {
        return Coordinate::columnIndexFromString($columnAddress) <= $this->maxColumn;
    }
}

/**
 * Đọc báo cáo tài chính / sao kê của 3 sàn và quy về một khuôn chung.
 *
 * File đơn hàng chỉ có phí ở Shopee, và ngay cả Shopee cũng thiếu affiliate và
 * quảng cáo. Ba loại báo cáo này mới là chứng từ tiền thật, nhưng mỗi sàn một
 * kiểu: Shopee và TikTok dạng ngang (mỗi đơn một dòng, mỗi loại phí một cột),
 * Lazada dạng dọc (mỗi dòng là một khoản phí, gộp theo `Mã đơn hàng`).
 *
 * Phí được xếp vào 3 nhóm để phân biệt tiền buộc phải trả với tiền tự chọn chi:
 *   - platform : hoa hồng, phí cố định, dịch vụ, thanh toán, hạ tầng
 *   - marketing: affiliate, quảng cáo, Voucher Xtra/Max, flash sale, campaign
 *   - promotion: mã giảm giá / xu / voucher do người bán tự chịu
 * Khoản lạ chưa phân loại được xếp vào `platform` và giữ nguyên tên trong
 * `details` để còn truy ra và phân loại lại sau.
 */
final class SettlementParser
{
    /** Từ khoá phân loại, xét theo thứ tự: khớp trước thắng. */
    private const RULES = [
        ['group' => 'promotion', 'any' => ['mã ưu đãi', 'ma uu dai', 'mã hoàn xu', 'ma hoan xu',
                                            'mã giảm giá', 'ma giam gia', 'giảm giá bằng xu', 'giam gia bang xu']],
        ['group' => 'marketing', 'any' => ['liên kết', 'lien ket', 'affiliate', 'quảng cáo', 'quang cao',
                                            'voucher xtra', 'voucher max', 'flash sale', 'flexi combo',
                                            'lazcoins', 'eams', 'gmv max', 'chiến dịch', 'chien dich',
                                            'nttd', 'ưu đãi đặc biệt', 'uu dai dac biet']],
        ['group' => 'platform', 'any' => ['hoa hồng', 'hoa hong', 'commission', 'phí cố định', 'phi co dinh',
                                           'phí dịch vụ', 'phi dich vu', 'phí giao dịch', 'phi giao dich',
                                           'xử lý', 'xu ly', 'hạ tầng', 'ha tang', 'infrastructure',
                                           'paylater', 'sfp', 'sfr', 'piship', 'quản lý', 'quan ly']],
    ];

    /**
     * Khoản KHÔNG phải chi phí của người bán — bỏ qua hoàn toàn.
     * Từ khoá hoàn tiền phải viết đủ cụm: chỉ 'hoàn' thôi sẽ nuốt luôn
     * "Mã hoàn xu do Người Bán chịu" — vốn là tiền shop thật sự bỏ ra.
     */
    private const SKIP = ['giá trị sản phẩm', 'gia tri san pham', 'tổng doanh thu', 'vận chuyển', 'van chuyen',
                          'thuế', 'thue', 'tax', 'trợ giá', 'tro gia', 'trợ cấp', 'tro cap',
                          'hoàn tiền', 'hoan tien', 'hoàn lại', 'hoan lai', 'được hoàn', 'duoc hoan',
                          'hoàn phí', 'hoan phi', 'khoản hoàn', 'khoan hoan', 'hoàn hoa hồng', 'hoan hoa hong',
                          'điều chỉnh', 'dieu chinh', 'trade-in', 'lắp đặt', 'lap dat'];

    public static function classify(string $feeName): ?string
    {
        $n = self::fold($feeName);
        if ($n === '') {
            return null;
        }
        foreach (self::SKIP as $kw) {
            if (str_contains($n, self::fold($kw))) {
                return null;
            }
        }
        foreach (self::RULES as $rule) {
            foreach ($rule['any'] as $kw) {
                if (str_contains($n, self::fold($kw))) {
                    return $rule['group'];
                }
            }
        }

        return 'platform'; // chưa biết thì coi là phí sàn, tên gốc vẫn nằm trong details
    }

    private static function fold(string $s): string
    {
        $s = trim(mb_strtolower($s));
        if (class_exists('\Normalizer')) {
            $d = \Normalizer::normalize($s, \Normalizer::FORM_D);
            if (is_string($d)) {
                $s = preg_replace('/\p{Mn}+/u', '', $d) ?? $s;
            }
        }
        $s = str_replace(['đ', 'Đ'], 'd', $s);
        return trim(preg_replace('/\s+/u', ' ', $s) ?? $s);
    }

    /** @return array{platform:string,sheet:int,header_row:int} */
    public static function detect(string $path): array
    {
        $names = self::sheetNames($path);
        $lower = array_map(static fn(string $n): string => mb_strtolower($n), $names);

        if (in_array('income overview', $lower, true)) {
            return ['platform' => 'lazada', 'sheet' => (int) array_search('income overview', $lower, true), 'header_row' => 0];
        }
        foreach ($lower as $i => $n) {
            if (str_contains($n, 'chi tiết đơn hàng') || str_contains($n, 'order details')) {
                return ['platform' => 'tiktokshop', 'sheet' => $i, 'header_row' => 0];
            }
        }
        foreach ($lower as $i => $n) {
            if ($n === 'doanh thu' || str_contains($n, 'income details')) {
                return ['platform' => 'shopee', 'sheet' => $i, 'header_row' => 2];
            }
        }

        throw new RuntimeException('Không nhận diện được báo cáo tài chính. Hỗ trợ: báo cáo doanh thu Shopee, sao kê Lazada (Income Overview), quyết toán TikTok Shop.');
    }

    public static function isSettlementFile(string $path): bool
    {
        try {
            self::detect($path);
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @return array{platform:string,rows:array<int,array>,fee_names:array<string,string>,skipped:int}
     */
    public static function parse(string $path): array
    {
        $meta = self::detect($path);
        $rows = self::sheetRows($path, $meta['sheet']);

        // detect() only reads workbook.xml, so it succeeds even when the sheet
        // itself never parses — which surfaced as "thiếu cột mã đơn hàng" and
        // sent everyone looking at the export layout instead of at the reader.
        // Separate the two: an empty load is a reading failure, and says so.
        if (self::isBlank($rows)) {
            throw new RuntimeException(sprintf(
                'Đọc được sheet "%s" nhưng không có dữ liệu nào (%d dòng). File tải lên có thể hỏng, '
                . 'hoặc thư viện đọc Excel của máy chủ không xử lý được sheet lớn này.%s',
                self::sheetNames($path)[$meta['sheet']] ?? '?',
                count($rows),
                self::xmlErrorHint()
            ));
        }

        // Shopee's preamble is not a fixed height — an extra line shifts the
        // header off the hardcoded row and makes every column look missing.
        // Find the row that actually carries the id column and fall back to the
        // documented one only when the scan finds nothing.
        $headerRow = self::findHeaderRow($rows, $meta['platform']) ?? $meta['header_row'];
        $header = array_map(static fn($v): string => trim((string) ($v ?? '')), $rows[$headerRow] ?? []);
        $data = array_slice($rows, $headerRow + 1);

        return $meta['platform'] === 'lazada'
            ? self::parseLong($header, $data, 'lazada')
            : self::parseWide($header, $data, $meta['platform']);
    }

    /** Lazada: mỗi dòng một khoản phí, gộp theo mã đơn. */
    private static function parseLong(array $header, array $data, string $platform): array
    {
        $idx = self::indexOf($header, self::idCandidates('lazada'));
        $nameIdx = self::indexOf($header, ['tên phí', 'fee name']);
        $amtIdx = self::indexOf($header, ['số tiền (đã bao gồm thuế)', 'số tiền', 'amount']);
        if ($idx === null || $nameIdx === null || $amtIdx === null) {
            throw new RuntimeException('Sao kê Lazada thiếu cột Mã đơn hàng / Tên phí / Số tiền.');
        }

        $orders = [];
        $feeNames = [];
        $skipped = 0;
        foreach ($data as $row) {
            $orderId = trim((string) ($row[$idx] ?? ''));
            $name = trim((string) ($row[$nameIdx] ?? ''));
            $amount = (float) ($row[$amtIdx] ?? 0);
            if ($orderId === '' || $name === '' || $amount === 0.0) {
                continue;
            }
            $group = self::classify($name);
            if ($group === null) { $skipped++; continue; }
            $feeNames[$name] = $group;
            self::add($orders, $platform, $orderId, $group, $name, abs($amount));
        }

        return ['platform' => $platform, 'rows' => array_values($orders), 'fee_names' => $feeNames, 'skipped' => $skipped];
    }

    /** Shopee / TikTok: mỗi đơn một dòng, mỗi loại phí một cột. */
    private static function parseWide(array $header, array $data, string $platform): array
    {
        $idx = self::indexOf($header, self::idCandidates($platform));
        if ($idx === null) {
            // Naming only the missing column left no way to tell a genuinely new
            // export layout from a sheet detected as the wrong platform (which
            // picks a different header row, so every column looks missing).
            // Report what was actually read so the answer is in the message.
            $seen = array_slice(array_values(array_filter($header, static fn($h) => $h !== '')), 0, 12);
            throw new RuntimeException(sprintf(
                'Báo cáo thiếu cột mã đơn hàng (nhận diện là %s, đọc được %d cột: %s).',
                $platform,
                count(array_filter($header, static fn($h) => $h !== '')),
                $seen ? implode(' | ', $seen) : 'không có cột nào'
            ));
        }

        // Chỉ những cột tên có chữ "phí"/"fee"/"mã ưu đãi"... mới là khoản chi.
        $feeCols = [];
        $feeNames = [];
        foreach ($header as $i => $name) {
            if ($name === '' || $i === $idx) { continue; }
            $folded = self::fold($name);
            // "Transaction Fee Rate (%)" là tỷ lệ, không phải số tiền.
            if (str_contains($folded, '(%)') || str_contains($folded, 'rate')) { continue; }
            $looksLikeFee = str_contains($folded, 'phi ') || str_starts_with($folded, 'phi')
                || str_contains($folded, 'fee') || str_contains($folded, 'hoa hong')
                || str_contains($folded, 'ma uu dai') || str_contains($folded, 'ma hoan xu')
                || str_contains($folded, 'commission');
            if (!$looksLikeFee) { continue; }
            $group = self::classify($name);
            if ($group === null) { continue; }
            $feeCols[$i] = ['group' => $group, 'name' => $name];
            $feeNames[$name] = $group;
        }
        if ($feeCols === []) {
            throw new RuntimeException('Không tìm thấy cột phí nào trong báo cáo.');
        }

        // Báo cáo Shopee lặp mỗi đơn thành 2 dòng: một dòng cấp "Order" và một
        // dòng cấp "Sku", phí ghi y hệt trên cả hai. Chỉ lấy dòng Order, không
        // thì mọi khoản bị nhân đôi.
        $levelIdx = self::indexOf($header, ['đơn hàng / sản phẩm', 'order/sku', 'order / sku']);

        $orders = [];
        $seen = [];
        $duplicates = 0;
        foreach ($data as $row) {
            $orderId = trim((string) ($row[$idx] ?? ''));
            if ($orderId === '' || !preg_match('/^[A-Za-z0-9._-]+$/', $orderId)) {
                continue;
            }
            if ($levelIdx !== null && self::fold((string) ($row[$levelIdx] ?? '')) !== 'order') {
                continue;
            }
            if (isset($seen[$orderId])) { $duplicates++; }
            $seen[$orderId] = true;
            foreach ($feeCols as $i => $col) {
                $amount = $row[$i] ?? null;
                if (!is_numeric($amount) || (float) $amount === 0.0) { continue; }
                self::add($orders, $platform, $orderId, $col['group'], $col['name'], abs((float) $amount));
            }
        }

        return ['platform' => $platform, 'rows' => array_values($orders), 'fee_names' => $feeNames,
                'skipped' => 0, 'duplicate_rows' => $duplicates];
    }

    private static function add(array &$orders, string $platform, string $orderId, string $group, string $name, float $amount): void
    {
        $orders[$orderId] ??= [
            'platform' => $platform, 'order_id' => $orderId,
            'fee_platform' => 0.0, 'fee_marketing' => 0.0, 'fee_promotion' => 0.0, 'details' => [],
        ];
        $orders[$orderId]['fee_' . $group] += $amount;
        $orders[$orderId]['details'][$name] = round(($orders[$orderId]['details'][$name] ?? 0) + $amount, 2);
    }

    /** Tên cột mã đơn theo từng sàn. */
    private static function idCandidates(string $platform): array
    {
        return match ($platform) {
            'lazada' => ['mã đơn hàng', 'order number', 'ordernumber'],
            'shopee' => ['mã đơn hàng', 'order id'],
            default  => ['id đơn hàng/điều chỉnh', 'order/adjustment id', 'order id'],
        };
    }

    /** Dòng tiêu đề thật, dò trong 10 dòng đầu. */
    private static function findHeaderRow(array $rows, string $platform): ?int
    {
        $candidates = self::idCandidates($platform);
        foreach (array_slice($rows, 0, 10, true) as $i => $row) {
            if (!is_array($row)) { continue; }
            $cells = array_map(static fn($v): string => trim((string) ($v ?? '')), $row);
            if (self::indexOf($cells, $candidates) !== null) { return (int) $i; }
        }
        return null;
    }

    /** Sheet không có ô nào mang dữ liệu. */
    private static function isBlank(array $rows): bool
    {
        foreach ($rows as $row) {
            if (!is_array($row)) { continue; }
            foreach ($row as $v) {
                if (trim((string) ($v ?? '')) !== '') { return false; }
            }
        }
        return true;
    }

    /**
     * PhpSpreadsheet đọc XML với libxml ở chế độ internal errors, nên khi libxml
     * từ chối file thì sheet về rỗng mà không ném lỗi. Lấy lại thông báo đó.
     */
    private static function xmlErrorHint(): string
    {
        $errors = libxml_get_errors();
        if ($errors === []) { return ''; }
        $first = trim((string) $errors[0]->message);
        libxml_clear_errors();
        return $first === '' ? '' : ' Lỗi XML: ' . $first;
    }

    private static function indexOf(array $header, array $candidates): ?int
    {
        foreach ($header as $i => $name) {
            foreach ($candidates as $c) {
                if (self::fold($name) === self::fold($c)) { return $i; }
            }
        }
        return null;
    }

    private static function sheetNames(string $path): array
    {
        $reader = IOFactory::createReaderForFile($path);
        $reader->setReadDataOnly(true);
        return $reader->listWorksheetNames($path);
    }

    private static function sheetRows(string $path, int $sheetIndex): array
    {
        $reader = IOFactory::createReaderForFile($path);
        $reader->setReadDataOnly(true);
        $reader->setReadFilter(new SettlementColumnFilter());
        $names = $reader->listWorksheetNames($path);
        if (isset($names[$sheetIndex])) {
            $reader->setLoadSheetsOnly($names[$sheetIndex]);
        }
        $spreadsheet = $reader->load($path);
        $rows = $spreadsheet->getSheet(0)->toArray(null, false, true, false);
        $spreadsheet->disconnectWorksheets();
        unset($spreadsheet);

        return $rows;
    }
}
