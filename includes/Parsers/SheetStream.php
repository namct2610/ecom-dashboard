<?php

declare(strict_types=1);

namespace Dashboard\Parsers;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;

/**
 * Đọc một sheet của file .xlsx theo kiểu stream.
 *
 * PhpSpreadsheet nạp nguyên entry XML của sheet thành MỘT chuỗi. Báo cáo doanh
 * thu Shopee có entry nặng ~60MB sau khi giải nén, và hosting có trần bộ nhớ
 * cứng cho mỗi tiến trình sẽ từ chối thẳng lần cấp phát đó: PHP báo
 * "Out of memory (allocated ...)" — khác hẳn "Allowed memory size exhausted",
 * và memory_limit không chữa được vì trần nằm ngoài PHP.
 *
 * XMLReader đi qua wrapper zip:// đọc đúng file XML ấy mà chỉ tốn vài MB, nên
 * cùng một báo cáo chạy được ở mức 32M thay vì cần hơn 112M.
 *
 * Kết quả trả về có cùng hình dạng với Worksheet::toArray(null, false, true,
 * false): danh sách dòng theo thứ tự, mỗi dòng là mảng theo chỉ số cột 0-based.
 * Trả về null khi không dựng được đường đọc, để nơi gọi rơi về PhpSpreadsheet.
 */
final class SheetStream
{
    /** Đọc một entry nhỏ trong file xlsx. */
    private static function zipEntry(string $path, string $entry): ?string
    {
        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) { return null; }
        $data = $zip->getFromName($entry);
        $zip->close();
        return is_string($data) ? $data : null;
    }

    /** Đường dẫn XML của sheet thứ $sheetIndex bên trong file xlsx. */
    private static function sheetEntryPath(string $path, int $sheetIndex): ?string
    {
        $book = self::zipEntry($path, 'xl/workbook.xml');
        $rels = self::zipEntry($path, 'xl/_rels/workbook.xml.rels');
        if ($book === null || $rels === null) { return null; }

        $bookXml = @simplexml_load_string($book);
        $relsXml = @simplexml_load_string($rels);
        if ($bookXml === false || $relsXml === false) { return null; }

        $map = [];
        foreach ($relsXml->Relationship as $r) {
            $map[(string) $r['Id']] = (string) $r['Target'];
        }

        $i = 0;
        foreach ($bookXml->sheets->sheet as $sheet) {
            if ($i++ !== $sheetIndex) { continue; }
            $rid = (string) $sheet->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')->id;
            $target = $map[$rid] ?? null;
            if ($target === null) { return null; }
            $target = ltrim($target, '/');
            return str_starts_with($target, 'xl/') ? $target : 'xl/' . $target;
        }
        return null;
    }

    /** Bảng chuỗi dùng chung, đọc kiểu stream. */
    private static function sharedStrings(string $path): array
    {
        $out = [];
        $reader = new \XMLReader();
        if (@$reader->open('zip://' . $path . '#xl/sharedStrings.xml') !== true) {
            return $out; // file không có sharedStrings là hợp lệ
        }
        $buf = null;
        while (@$reader->read()) {
            if ($reader->nodeType === \XMLReader::ELEMENT && $reader->name === 'si') {
                $buf = '';
            } elseif ($reader->nodeType === \XMLReader::ELEMENT && $reader->name === 't' && $buf !== null) {
                $buf .= $reader->readString();
            } elseif ($reader->nodeType === \XMLReader::END_ELEMENT && $reader->name === 'si') {
                $out[] = $buf ?? '';
                $buf = null;
            }
        }
        $reader->close();
        return $out;
    }

    /**
     * PhpSpreadsheet nạp nguyên entry XML của sheet thành MỘT chuỗi. Với các báo
     * cáo này entry đó nặng ~60MB sau giải nén, và một tài khoản hosting có trần
     * bộ nhớ cứng cho mỗi tiến trình sẽ từ chối thẳng lần cấp phát đó — PHP báo
     * "Out of memory", thứ mà memory_limit không chữa được. XMLReader đi qua
     * wrapper zip:// đọc đúng file XML ấy mà chỉ tốn vài MB.
     *
     * Trả về null khi không dựng được đường đọc, để rơi về cách cũ.
     */
    public static function rows(string $path, int $sheetIndex, int $maxColumn = 80): ?array
    {
        $entry = self::sheetEntryPath($path, $sheetIndex);
        if ($entry === null) { return null; }

        $reader = new \XMLReader();
        if (@$reader->open('zip://' . $path . '#' . $entry) !== true) { return null; }

        $sst = self::sharedStrings($path);
        $rows = [];
        $row = [];
        $rowNum = 0;

        while (@$reader->read()) {
            if ($reader->nodeType === \XMLReader::ELEMENT && $reader->name === 'row') {
                $row = [];
                $rowNum = (int) $reader->getAttribute('r');
            } elseif ($reader->nodeType === \XMLReader::ELEMENT && $reader->name === 'c') {
                $ref = (string) $reader->getAttribute('r');
                $type = (string) $reader->getAttribute('t');
                if ($ref === '' || !preg_match('/^([A-Z]+)/', $ref, $m)) { continue; }
                $col = Coordinate::columnIndexFromString($m[1]);
                if ($col > $maxColumn) { continue; }

                $node = @simplexml_load_string($reader->readOuterXml());
                if ($node === false) { continue; }
                if ($type === 'inlineStr') {
                    $value = isset($node->is) ? (string) $node->is->t : '';
                } elseif ($type === 's') {
                    $value = $sst[(int) $node->v] ?? '';
                } elseif (isset($node->v)) {
                    $raw = (string) $node->v;
                    $value = is_numeric($raw) ? $raw + 0 : $raw;
                } else {
                    $value = null;
                }
                $row[$col - 1] = $value;
            } elseif ($reader->nodeType === \XMLReader::END_ELEMENT && $reader->name === 'row') {
                // Giữ đúng vị trí dòng: sheet có thể nhảy số dòng.
                while (count($rows) < $rowNum - 1) { $rows[] = []; }
                ksort($row);
                $rows[] = $row;
                $row = [];
            }
        }
        $reader->close();

        return $rows;
    }
}
