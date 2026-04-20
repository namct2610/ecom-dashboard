<?php

declare(strict_types=1);

namespace Dashboard\Parsers;

final class TrafficParser extends BaseParser
{
    private string $platform;

    public function __construct(string $filePath, string $platform)
    {
        parent::__construct($filePath);
        $this->platform = $platform;
    }

    public function parse(int $uploadId): array
    {
        $spreadsheet = $this->loadSpreadsheet();
        $targetSheet = $this->resolveTargetSheet($spreadsheet);

        $rows   = $targetSheet->toArray(null, false, true, false);
        $result = ['rows' => [], 'errors' => [], 'total_rows' => 0, 'imported_rows' => 0, 'skipped_rows' => 0];

        if (empty($rows)) return $result;

        // Find header row: must have an individual cell that is exactly (or closely)
        // a date keyword AND resolve a date column via resolveColumns.
        // This prevents "Dữ liệu theo ngày" title rows from being mistaken as headers.
        $headerIdx  = null;
        $col        = [];
        $dateCells  = ['ngày', 'date', 'ngày tháng'];
        for ($i = 0; $i < min(15, count($rows)); $i++) {
            $headers = array_map(fn($v) => mb_strtolower(trim((string)($v ?? ''))), $rows[$i]);
            $flat    = implode(' ', $headers);

            // Quick pre-filter: row must contain at least one traffic/date keyword
            $hasKeyword = str_contains($flat, 'ngày') || str_contains($flat, 'date')
                       || str_contains($flat, 'lượt xem') || str_contains($flat, 'page views')
                       || str_contains($flat, 'lượt truy cập') || str_contains($flat, 'khách truy cập');
            if (!$hasKeyword) continue;

            // Require at least one cell to be an exact or near-exact date keyword
            $hasDateCell = false;
            foreach ($headers as $h) {
                if (in_array($h, $dateCells, true)) { $hasDateCell = true; break; }
            }
            if (!$hasDateCell) continue;

            // Resolve columns; only accept if date column is found
            $resolved = $this->resolveColumns($rows[$i], $this->getColumnMap());
            if (isset($resolved['date'])) {
                $headerIdx = $i;
                $col       = $resolved;
                break;
            }
        }

        if ($headerIdx === null) {
            $result['errors'][] = ['row_number' => 0, 'error_code' => 'no_header', 'error_message' => 'Cannot find header row.', 'raw_payload' => []];
            return $result;
        }

        $deviceType = $this->detectDeviceType($targetSheet->getTitle());

        for ($i = $headerIdx + 1; $i < count($rows); $i++) {
            $row = $rows[$i];
            if ($this->isEmptyRow($row)) continue;

            $dateStr = $this->cell($row, $col['date'] ?? null);
            if (!$dateStr) continue;

            // Skip summary rows (contain range like "01-03-2026-31-03-2026")
            if (strlen($dateStr) > 12 && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateStr) && !preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $dateStr)) {
                continue;
            }

            $date = parse_date_value($dateStr);
            if (!$date) continue;

            $result['total_rows']++;

            $pageViews      = (int) parse_traffic_number($this->cell($row, $col['page_views'] ?? null));
            $visits         = (int) parse_traffic_number($this->cell($row, $col['visits'] ?? null));
            $newVisitors    = (int) parse_traffic_number($this->cell($row, $col['new_visitors'] ?? null));
            $returning      = (int) parse_traffic_number($this->cell($row, $col['returning_visitors'] ?? null));
            $bounceRate     = parse_bounce_rate($this->cell($row, $col['bounce_rate'] ?? null));
            $avgDuration    = parse_duration($this->cell($row, $col['avg_duration'] ?? null));
            $avgPageViews   = parse_traffic_number($this->cell($row, $col['avg_page_views'] ?? null));
            $newFollowers   = (int) parse_traffic_number($this->cell($row, $col['new_followers'] ?? null));

            $result['rows'][] = [
                'platform'            => $this->platform,
                'traffic_date'        => $date,
                'device_type'         => $deviceType,
                'page_views'          => $pageViews,
                'avg_page_views'      => $avgPageViews,
                'avg_session_duration'=> $avgDuration,
                'bounce_rate'         => $bounceRate,
                'visits'              => $visits,
                'new_visitors'        => $newVisitors,
                'returning_visitors'  => $returning,
                'new_followers'       => $newFollowers,
                'upload_id'           => $uploadId,
            ];
            $result['imported_rows']++;
        }
        return $result;
    }

    private function getColumnMap(): array
    {
        return [
            'date'               => ['ngày', 'date', 'ngày tháng'],
            'page_views'         => ['lượt xem', 'page views', 'lượt xem trang', 'tổng lượt xem'],
            'avg_page_views'     => ['số lượt xem trung bình', 'avg page views'],
            'avg_duration'       => ['thời gian xem trung bình', 'avg session duration', 'avg duration'],
            'bounce_rate'        => ['tỉ lệ thoát trang', 'bounce rate', 'tỷ lệ thoát', 'tỷ lệ chuyển đổi'],
            'visits'             => ['lượt truy cập', 'visits', 'khách truy cập', 'lượt truy cập trang cửa hàng', 'lượt truy cập trang cửa hàng'],
            'new_visitors'       => ['số khách truy cập mới', 'new visitors', 'khách mới'],
            'returning_visitors' => ['số khách truy cập hiện tại', 'returning visitors', 'khách quay lại'],
            'new_followers'      => ['người theo dõi mới', 'new followers'],
        ];
    }

    private function detectDeviceType(string $sheetTitle): string
    {
        $t = mb_strtolower(trim($sheetTitle));
        if (str_contains($t, 'máy tính') || str_contains($t, 'desktop')) return 'desktop';
        if (str_contains($t, 'ứng dụng') || str_contains($t, 'mobile') || str_contains($t, 'app')) return 'mobile';
        return 'all';
    }

    private function resolveTargetSheet(\PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet): \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet
    {
        if ($this->platform === 'shopee') {
            $sheet = $this->findSheetByName($spreadsheet, ['Tất cả']);
            if ($sheet === null) {
                throw new \RuntimeException('File traffic Shopee phải có sheet "Tất cả". Hệ thống chỉ import số liệu trong mục này.');
            }

            return $sheet;
        }

        if ($this->platform === 'lazada') {
            return $this->findSheetByName($spreadsheet, ['Các chỉ số quan trọng']) ?? $spreadsheet->getSheet(0);
        }

        if ($this->platform === 'tiktokshop') {
            return $this->findSheetByName($spreadsheet, ['Sheet1', 'sheet1']) ?? $spreadsheet->getSheet(0);
        }

        return $spreadsheet->getSheet(0);
    }

    private function findSheetByName(\PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet, array $names): ?\PhpOffice\PhpSpreadsheet\Worksheet\Worksheet
    {
        $targets = array_map(
            static fn(string $name): string => mb_strtolower(trim($name)),
            $names
        );

        foreach ($spreadsheet->getAllSheets() as $sheet) {
            $title = mb_strtolower(trim($sheet->getTitle()));
            if (in_array($title, $targets, true)) {
                return $sheet;
            }
        }

        return null;
    }

    private function loadSpreadsheet(): \PhpOffice\PhpSpreadsheet\Spreadsheet
    {
        $reader = \PhpOffice\PhpSpreadsheet\IOFactory::createReaderForFile($this->filePath);
        $reader->setReadDataOnly(true);
        if (method_exists($reader, 'setReadEmptyCells')) {
            $reader->setReadEmptyCells(false);
        }
        return $reader->load($this->filePath);
    }
}
