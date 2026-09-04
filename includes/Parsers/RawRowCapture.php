<?php

declare(strict_types=1);

namespace Dashboard\Parsers;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;
use RuntimeException;

/**
 * Chỉ đọc số cột thật sự có thể có (file rộng nhất là Lazada 76 cột). Sheet
 * của sàn đệm cột rỗng tới tận cột 1000, đọc hết là vượt memory_limit.
 */
final class RawColumnFilter implements IReadFilter
{
    public function __construct(private int $maxColumn = 100) {}

    public function readCell($columnAddress, $row, $worksheetName = ''): bool
    {
        return Coordinate::columnIndexFromString($columnAddress) <= $this->maxColumn;
    }
}

/**
 * Giữ lại NGUYÊN VĂN từng dòng của file sàn để sau này xuất ngược ra đúng
 * format gốc.
 *
 * Vì sao không lưu chính file đã upload: file tải lên bị phân mảnh theo kỳ bất
 * kỳ (3 ngày, 5 ngày, tròn tháng, hoặc vắt qua hai tháng) và các kỳ chồng lấn
 * nhau, nên muốn xuất một khoảng ngày tuỳ ý thì vẫn phải ghép nhiều file rồi
 * khử trùng bằng tay. Lưu theo DÒNG, khoá bằng mã tự nhiên của sàn, thì tải
 * chồng bao nhiêu lần cũng chỉ ghi đè đúng dòng đó, và cắt khoảng ngày nào
 * cũng được.
 *
 * Vì sao không dựng lại từ bảng orders: parser chỉ giữ 21–30 trên 54–76 cột,
 * hơn một nửa thông tin (người mua, địa chỉ, mã vận đơn, hoá đơn...) chưa bao
 * giờ được lưu.
 *
 * Giá trị được lưu đúng như đọc ra từ file — các sàn đều xuất dạng chuỗi
 * ("2026-03-01 00:36", "113360.00") nên round-trip khớp tuyệt đối, không dính
 * chuyện Excel đổi ngày thành số serial.
 */
final class RawRowCapture
{
    /**
     * Với mỗi (loại file, sàn): cột làm khoá tự nhiên và cột lấy ngày để cắt kỳ.
     * `key` xét theo thứ tự, khớp cái nào có đủ dữ liệu thì dùng cái đó.
     */
    private const PROFILES = [
        'orders' => [
            'shopee' => [
                'key'  => [['mã đơn hàng', 'sku sản phẩm'], ['mã đơn hàng']],
                'date' => ['ngày đặt hàng', 'thời gian tạo đơn'],
            ],
            'lazada' => [
                'key'  => [['orderitemid'], ['ordernumber', 'sellersku']],
                'date' => ['createtime', 'create time'],
            ],
            'tiktokshop' => [
                'key'  => [['order id', 'seller sku'], ['order id']],
                'date' => ['created time'],
                // File TikTok có 2 dòng tiêu đề: dòng 2 là phần mô tả từng cột
                // ("Platform unique order ID."), không phải dữ liệu.
                // TiktokShopParser cũng bỏ qua bằng `$i <= 1`.
                'skip_rows' => 1,
            ],
        ],
        'traffic' => [
            '*' => [
                'key'  => [['ngày', 'date', 'ngày tháng']],
                'date' => ['ngày', 'date', 'ngày tháng'],
            ],
        ],
        'settlement' => [
            'shopee' => [
                'key'  => [['mã giao dịch', 'mã đơn hàng', 'đơn hàng / sản phẩm'], ['mã đơn hàng']],
                'date' => ['ngày đặt hàng', 'ngày hoàn thành thanh toán'],
            ],
            'lazada' => [
                'key'  => [['mã sao kê', 'mã đơn hàng', 'tên phí', 'mã sản phẩm'], ['mã sao kê', 'tên phí']],
                'date' => ['ngày giao dịch', 'ngày tạo đơn'],
            ],
            'tiktokshop' => [
                'key'  => [['id đơn hàng/điều chỉnh', 'thời gian quyết toán đơn hàng'], ['id đơn hàng/điều chỉnh']],
                'date' => ['thời gian tạo đơn hàng', 'thời gian quyết toán đơn hàng'],
            ],
        ],
    ];

    /**
     * @return array{layout_hash:string,headers:array,rows:array,skipped:int}
     */
    public static function capture(string $path, string $platform, string $fileType, ?int $sheetIndex = null, ?int $headerRow = null): array
    {
        $profile = self::PROFILES[$fileType][$platform]
            ?? self::PROFILES[$fileType]['*']
            ?? null;
        if ($profile === null) {
            throw new RuntimeException("Chưa cấu hình cách lưu dòng thô cho {$fileType}/{$platform}.");
        }

        [$sheetIndex, $headerRow] = self::resolveSheet($path, $fileType, $sheetIndex, $headerRow);
        $sheetName = self::sheetNameAt($path, $sheetIndex);
        $rows = self::readSheet($path, $sheetIndex);
        $headers = array_map(
            static fn($v): string => trim((string) ($v ?? '')),
            $rows[$headerRow] ?? []
        );
        // Cắt đuôi cột rỗng để layout không phình theo phần đệm của sàn.
        while ($headers !== [] && end($headers) === '') {
            array_pop($headers);
        }
        if ($headers === []) {
            throw new RuntimeException('Không đọc được dòng tiêu đề của file.');
        }

        $lookup = [];
        foreach ($headers as $i => $name) {
            $lookup[self::fold($name)] = $i;
        }

        // Các dòng NẰM TRÊN tiêu đề (báo cáo Shopee có dòng tựa đề + dòng
        // trống trước header) cũng thuộc format gốc.
        $prologue = [];
        for ($i = 0; $i < $headerRow; $i++) {
            $line = $rows[$i] ?? [];
            $prologue[] = array_map(
                static fn($v): string => $v === null ? '' : (string) $v,
                array_slice(array_pad($line, count($headers), ''), 0, count($headers))
            );
        }

        // Dòng nằm giữa tiêu đề và dữ liệu (TikTok: dòng mô tả từng cột) là
        // một phần của format gốc — phải giữ để lúc xuất dựng lại y hệt, nếu
        // không file xuất ra sẽ lệch một dòng so với bản sàn.
        $skipRows = (int) ($profile['skip_rows'] ?? 0);
        $preamble = [];
        for ($i = 1; $i <= $skipRows; $i++) {
            $line = $rows[$headerRow + $i] ?? [];
            $preamble[] = array_map(
                static fn($v): string => $v === null ? '' : (string) $v,
                array_slice(array_pad($line, count($headers), ''), 0, count($headers))
            );
        }

        $captured = [];
        $skipped = 0;
        $dataStart = $headerRow + 1 + $skipRows;
        foreach (array_slice($rows, $dataStart) as $row) {
            $key = self::buildKey($row, $lookup, $profile['key']);
            if ($key === null) { $skipped++; continue; }

            $payload = [];
            foreach ($headers as $i => $name) {
                if ($name === '') { continue; }
                $value = $row[$i] ?? null;
                if ($value === null || $value === '') { continue; }
                $payload[$name] = is_string($value) ? $value : (string) $value;
            }
            if ($payload === []) { $skipped++; continue; }

            $captured[$key] = [
                'row_key'  => $key,
                'row_date' => self::extractDate($row, $lookup, $profile['date']),
                'payload'  => $payload,
            ];
        }

        return [
            'layout_hash' => sha1($platform . '|' . $fileType . '|' . implode('|', $headers)),
            'headers'     => $headers,
            'prologue'    => $prologue,
            'preamble'    => $preamble,
            'sheet_name'  => $sheetName,
            'rows'        => array_values($captured),
            'skipped'     => $skipped,
        ];
    }

    /** Sao kê nằm ở sheet riêng; đơn hàng và traffic dùng sheet đầu. */
    private static function resolveSheet(string $path, string $fileType, ?int $sheetIndex, ?int $headerRow): array
    {
        if ($sheetIndex !== null && $headerRow !== null) {
            return [$sheetIndex, $headerRow];
        }
        if ($fileType === 'settlement') {
            $meta = SettlementParser::detect($path);
            return [$meta['sheet'], $meta['header_row']];
        }

        return [$sheetIndex ?? 0, $headerRow ?? 0];
    }

    /** Tên sheet gốc: sao kê được nhận diện bằng tên sheet nên xuất phải giữ. */
    private static function sheetNameAt(string $path, int $sheetIndex): string
    {
        $reader = IOFactory::createReaderForFile($path);
        $reader->setReadDataOnly(true);
        $names = $reader->listWorksheetNames($path);

        return (string) ($names[$sheetIndex] ?? 'Sheet1');
    }

    private static function readSheet(string $path, int $sheetIndex): array
    {
        // Cùng lý do như trong SheetStream: PhpSpreadsheet nạp nguyên entry XML
        // của sheet thành một chuỗi ~60MB, và bước này chạy BÊN TRONG transaction
        // nên một lần OOM ở đây sẽ cuốn bay cả lần import đã làm xong.
        $streamed = SheetStream::rows($path, $sheetIndex, 100);
        if ($streamed !== null) {
            return $streamed;
        }

        $reader = IOFactory::createReaderForFile($path);
        $reader->setReadDataOnly(true);
        $reader->setReadFilter(new RawColumnFilter());
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

    /** @param array<int,array<int,string>> $candidates */
    private static function buildKey(array $row, array $lookup, array $candidates): ?string
    {
        foreach ($candidates as $parts) {
            $values = [];
            foreach ($parts as $header) {
                $idx = $lookup[self::fold($header)] ?? null;
                $val = $idx === null ? '' : trim((string) ($row[$idx] ?? ''));
                if ($val === '') { $values = []; break; }
                $values[] = $val;
            }
            if ($values !== []) {
                $key = implode('|', $values);
                // Khoá dài hơn cột thì băm lại, tránh cắt cụt gây trùng khoá.
                return mb_strlen($key) <= 180 ? $key : sha1($key);
            }
        }

        return null;
    }

    private static function extractDate(array $row, array $lookup, array $candidates): ?string
    {
        foreach ($candidates as $header) {
            $idx = $lookup[self::fold($header)] ?? null;
            if ($idx === null) { continue; }
            $raw = trim((string) ($row[$idx] ?? ''));
            if ($raw === '') { continue; }
            // TikTok xuất ngày kiểu 2026/06/29 mà parse_datetime_value chưa
            // nhận. Đổi gạch chéo thành gạch ngang tại chỗ thay vì sửa hàm
            // dùng chung của mọi parser.
            if (preg_match('#^(\d{4})/(\d{1,2})/(\d{1,2})(.*)$#', $raw, $m)) {
                $raw = sprintf('%04d-%02d-%02d%s', (int) $m[1], (int) $m[2], (int) $m[3], $m[4]);
            }
            $parsed = \parse_datetime_value($raw);
            if ($parsed !== null) {
                return substr($parsed, 0, 10);
            }
        }

        return null;
    }

    private static function fold(string $s): string
    {
        $s = trim(mb_strtolower($s));
        return preg_replace('/\s+/u', ' ', $s) ?? $s;
    }
}
