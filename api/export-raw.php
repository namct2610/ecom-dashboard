<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

require_auth();
require_method('GET');

@set_time_limit(300);
@ini_set('memory_limit', '512M');

const EXPORT_ROW_LIMIT = 100000;

/** Danh mục dữ liệu thô đang có, để màn hình xuất biết chọn gì. */
function raw_export_catalog(PDO $pdo): array
{
    $rows = $pdo->query("
        SELECT platform, file_type, COUNT(*) AS rows_count,
               MIN(row_date) AS date_from, MAX(row_date) AS date_to,
               SUM(row_date IS NULL) AS undated,
               COUNT(DISTINCT layout_hash) AS layouts,
               MAX(imported_at) AS last_import
        FROM import_rows
        GROUP BY platform, file_type
        ORDER BY file_type, platform
    ")->fetchAll();

    return array_map(static fn(array $r): array => [
        'platform'    => (string) $r['platform'],
        'file_type'   => (string) $r['file_type'],
        'rows'        => (int) $r['rows_count'],
        'date_from'   => $r['date_from'],
        'date_to'     => $r['date_to'],
        'undated'     => (int) $r['undated'],
        'layouts'     => (int) $r['layouts'],
        'last_import' => $r['last_import'],
    ], $rows);
}

try {
    $pdo = db($config);

    if (($_GET['action'] ?? '') === 'catalog') {
        json_response(['success' => true, 'catalog' => raw_export_catalog($pdo)]);
    }

    $platform = trim((string) ($_GET['platform'] ?? ''));
    $fileType = trim((string) ($_GET['file_type'] ?? ''));
    $range    = request_date_range();

    if (!in_array($platform, ['shopee', 'lazada', 'tiktokshop'], true)) {
        json_error('Chưa chọn sàn hợp lệ.', 422);
    }
    if (!in_array($fileType, ['orders', 'traffic', 'settlement'], true)) {
        json_error('Chưa chọn loại dữ liệu hợp lệ.', 422);
    }
    if ($range === null) {
        json_error('Cần chọn khoảng ngày (date_from, date_to).', 422);
    }
    [$dateFrom, $dateTo] = $range;

    $stmt = $pdo->prepare("
        SELECT layout_hash, payload
        FROM import_rows
        WHERE platform = :platform
          AND file_type = :file_type
          AND row_date BETWEEN :date_from AND :date_to
        ORDER BY row_date ASC, row_key ASC
        LIMIT " . (EXPORT_ROW_LIMIT + 1)
    );
    $stmt->execute([
        ':platform'  => $platform,
        ':file_type' => $fileType,
        ':date_from' => $dateFrom,
        ':date_to'   => $dateTo,
    ]);
    $rows = $stmt->fetchAll();

    if ($rows === []) {
        json_error('Không có dữ liệu thô trong khoảng ngày này. Chỉ những file tải lên từ bản 3.4.60 trở đi mới xuất lại được.', 404);
    }
    if (count($rows) > EXPORT_ROW_LIMIT) {
        json_error(sprintf('Khoảng ngày quá lớn (> %s dòng). Hãy chia nhỏ khoảng ngày.', number_format(EXPORT_ROW_LIMIT)), 422);
    }

    // Cột lấy theo layout mới nhất để file mở ra quen mắt như bản sàn xuất.
    // Nếu dòng cũ có cột mà layout mới bỏ đi thì nối vào cuối — thà thừa cột
    // còn hơn nuốt mất dữ liệu đã lưu.
    $layoutHashes = array_values(array_unique(array_column($rows, 'layout_hash')));
    $placeholders = implode(',', array_fill(0, count($layoutHashes), '?'));
    $layoutStmt = $pdo->prepare("
        SELECT layout_hash, headers, prologue, preamble, sheet_name FROM import_layouts
        WHERE layout_hash IN ({$placeholders})
        ORDER BY last_seen DESC
    ");
    $layoutStmt->execute($layoutHashes);

    $headers = [];
    $preamble = [];
    $layoutRows = $layoutStmt->fetchAll();
    foreach ($layoutRows as $layout) {
        foreach ((array) json_decode((string) $layout['headers'], true) as $name) {
            $name = (string) $name;
            if ($name !== '' && !in_array($name, $headers, true)) {
                $headers[] = $name;
            }
        }
    }
    if ($headers === []) {
        json_error('Không tìm thấy cấu trúc cột đã lưu cho dữ liệu này.', 500);
    }
    // Dòng mô tả cột của bản layout mới nhất (TikTok có, các sàn khác không).
    $newest = $layoutRows[0] ?? null;
    $prologue = [];
    foreach (['prologue' => &$prologue, 'preamble' => &$preamble] as $field => &$target) {
        if ($newest && $newest[$field] !== null) {
            $decoded = json_decode((string) $newest[$field], true);
            if (is_array($decoded)) { $target = $decoded; }
        }
    }
    unset($target);

    $spreadsheet = new Spreadsheet();
    $sheet = $spreadsheet->getActiveSheet();
    // Giữ đúng tên sheet gốc: báo cáo tài chính được nhận diện bằng tên sheet,
    // đổi tên là file xuất ra không tải ngược lên được.
    $sheet->setTitle(mb_substr((string) ($newest['sheet_name'] ?? 'Data'), 0, 31) ?: 'Data');

    // Dựng lại đúng thứ tự của file gốc: phần đầu -> tiêu đề -> mô tả -> dữ liệu.
    $rowNum = 1;
    foreach ($prologue as $line) {
        foreach (array_values((array) $line) as $i => $value) {
            if ($value === '' || $value === null) { continue; }
            $sheet->setCellValueExplicit([$i + 1, $rowNum], (string) $value, DataType::TYPE_STRING);
        }
        $rowNum++;
    }

    foreach ($headers as $i => $name) {
        $sheet->setCellValueExplicit([$i + 1, $rowNum], $name, DataType::TYPE_STRING);
    }
    $rowNum++;
    foreach ($preamble as $line) {
        foreach (array_values((array) $line) as $i => $value) {
            if ($value === '' || $value === null) { continue; }
            $sheet->setCellValueExplicit([$i + 1, $rowNum], (string) $value, DataType::TYPE_STRING);
        }
        $rowNum++;
    }

    foreach ($rows as $r) {
        $payload = json_decode((string) $r['payload'], true);
        if (!is_array($payload)) { continue; }
        foreach ($headers as $i => $name) {
            $value = $payload[$name] ?? null;
            if ($value === null || $value === '') { continue; }
            // Ghi dạng chuỗi đúng như lúc đọc vào: để Excel tự suy kiểu thì
            // "2026-03-01 00:36" thành số serial và "113360.00" mất số 0 cuối,
            // đọc lại sẽ không còn khớp file gốc.
            $sheet->setCellValueExplicit([$i + 1, $rowNum], (string) $value, DataType::TYPE_STRING);
        }
        $rowNum++;
    }

    $labels = ['orders' => 'don-hang', 'traffic' => 'luu-luong', 'settlement' => 'tai-chinh'];
    $filename = sprintf('%s-%s-%s-den-%s.xlsx', $platform, $labels[$fileType] ?? $fileType, $dateFrom, $dateTo);

    log_activity('info', 'export_raw', "Xuất dữ liệu thô: {$filename}", [
        'platform'  => $platform,
        'file_type' => $fileType,
        'from'      => $dateFrom,
        'to'        => $dateTo,
        'rows'      => $rowNum - 2,
        'columns'   => count($headers),
        'layouts'   => count($layoutHashes),
    ]);

    while (ob_get_level() > 0) { ob_end_clean(); }
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store');
    (new Xlsx($spreadsheet))->save('php://output');
    $spreadsheet->disconnectWorksheets();
    exit;
} catch (\Throwable $e) {
    json_exception($e, 'Không thể xuất dữ liệu thô.');
}
