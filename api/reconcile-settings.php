<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

require_admin();

const RECONCILE_PRICE_SETTING_KEY = 'reconcile_price_table';
const RECONCILE_COMBO_SETTING_KEY = 'reconcile_combo_to_single';

function decode_reconcile_setting(string $raw): array
{
    if ($raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function parse_reconcile_number(mixed $value): ?float
{
    if ($value === null || $value === '') {
        return null;
    }

    if (is_int($value) || is_float($value)) {
        return (float) $value;
    }

    $text = trim((string) $value);
    $text = str_replace(["\xc2\xa0", ' '], '', $text);
    if ($text === '' || $text === '-' || $text === '--') {
        return null;
    }

    if (preg_match('/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/', $text) === 1) {
        $text = str_replace('.', '', $text);
        $text = str_replace(',', '.', $text);
        return (float) $text;
    }

    if (preg_match('/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/', $text) === 1) {
        $text = str_replace(',', '', $text);
        return (float) $text;
    }

    if (preg_match('/^\d+,\d{1,4}$/', $text) === 1) {
        return (float) str_replace(',', '.', $text);
    }

    $text = str_replace(',', '', $text);
    $cleaned = preg_replace('/[^\d.\-]/', '', $text) ?: '';
    if ($cleaned === '' || $cleaned === '-' || !is_numeric($cleaned)) {
        return null;
    }

    return (float) $cleaned;
}

function normalize_reconcile_prices(array $rows): array
{
    $normalized = [];

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        $sku = strtoupper(trim((string) ($row['sku'] ?? '')));
        $productName = trim((string) ($row['product_name'] ?? ''));
        $unitPrice = parse_reconcile_number($row['unit_price'] ?? null);

        if ($sku === '' && $productName === '' && $unitPrice === null) {
            continue;
        }

        if ($sku === '') {
            json_error('Bảng giá GBS: mỗi dòng phải có SKU.', 422);
        }

        if ($unitPrice === null) {
            json_error("Bảng giá GBS: SKU {$sku} có đơn giá không hợp lệ.", 422);
        }

        $unitPrice = round($unitPrice, 2);
        if ($unitPrice < 0) {
            json_error("Bảng giá GBS: SKU {$sku} có đơn giá âm.", 422);
        }

        $normalized[$sku] = [
            'sku'          => $sku,
            'product_name' => $productName,
            'unit_price'   => $unitPrice,
        ];
    }

    ksort($normalized);
    return array_values($normalized);
}

function normalize_reconcile_combos(array $rows): array
{
    $normalized = [];
    $allowedPlatforms = ['all', 'shopee', 'lazada', 'tiktokshop'];

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        $platform = mb_strtolower(trim((string) ($row['platform'] ?? 'all')));
        $comboSku = strtoupper(trim((string) ($row['combo_sku'] ?? '')));
        $comboName = trim((string) ($row['combo_name'] ?? ''));
        $singleSku = strtoupper(trim((string) ($row['single_sku'] ?? '')));
        $singleQty = parse_reconcile_number($row['single_qty'] ?? null);

        if ($platform === '' && $comboSku === '' && $comboName === '' && $singleSku === '' && $singleQty === null) {
            continue;
        }

        if (!in_array($platform, $allowedPlatforms, true)) {
            json_error('Combo_to_single: sàn không hợp lệ.', 422);
        }
        if ($comboSku === '' && $comboName === '') {
            json_error('Combo_to_single: mỗi dòng cần ít nhất SKU combo hoặc tên/từ khóa combo.', 422);
        }
        if ($singleSku === '') {
            json_error('Combo_to_single: mỗi dòng phải có SKU sản phẩm đơn.', 422);
        }
        if ($singleQty === null) {
            json_error("Combo_to_single: SKU đơn {$singleSku} có số lượng không hợp lệ.", 422);
        }

        $singleQty = round($singleQty, 4);
        if ($singleQty <= 0) {
            json_error("Combo_to_single: SKU đơn {$singleSku} phải có số lượng > 0.", 422);
        }

        $normalized[] = [
            'platform'   => $platform,
            'combo_sku'  => $comboSku,
            'combo_name' => $comboName,
            'single_sku' => $singleSku,
            'single_qty' => $singleQty,
        ];
    }

    usort($normalized, static function (array $left, array $right): int {
        return [$left['platform'], $left['combo_sku'], $left['combo_name'], $left['single_sku']]
            <=> [$right['platform'], $right['combo_sku'], $right['combo_name'], $right['single_sku']];
    });

    return $normalized;
}

function normalize_import_header(string $value): string
{
    $value = trim(mb_strtolower($value));

    if (class_exists('\Normalizer')) {
        $normalized = \Normalizer::normalize($value, \Normalizer::FORM_C);
        if (is_string($normalized) && $normalized !== '') {
            $value = $normalized;
        }
    }

    if (function_exists('iconv')) {
        $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        if (is_string($ascii) && $ascii !== '') {
            $value = $ascii;
        }
    }

    $value = preg_replace('/[^a-z0-9]+/u', ' ', $value) ?? $value;
    return trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
}

function is_import_row_empty(array $row): bool
{
    foreach ($row as $value) {
        if ($value !== null && trim((string) $value) !== '') {
            return false;
        }
    }

    return true;
}

function resolve_import_columns(array $headers, array $columnMap): array
{
    $resolved = [];
    $normalizedHeaders = [];

    foreach ($headers as $index => $header) {
        $normalizedHeaders[$index] = normalize_import_header((string) ($header ?? ''));
    }

    foreach ($columnMap as $field => $candidates) {
        $match = null;

        foreach ($candidates as $candidate) {
            $candidateNormalized = normalize_import_header($candidate);
            foreach ($normalizedHeaders as $index => $headerNormalized) {
                if ($headerNormalized === $candidateNormalized) {
                    $match = $index;
                    break 2;
                }
            }
        }

        if ($match === null) {
            foreach ($candidates as $candidate) {
                $candidateNormalized = normalize_import_header($candidate);
                foreach ($normalizedHeaders as $index => $headerNormalized) {
                    if ($candidateNormalized !== '' && $headerNormalized !== '' && str_contains($headerNormalized, $candidateNormalized)) {
                        $match = $index;
                        break 2;
                    }
                }
            }
        }

        $resolved[$field] = $match;
    }

    return $resolved;
}

function load_import_sheet(string $path, ?string $preferredName = null): Worksheet
{
    $reader = IOFactory::createReaderForFile($path);
    $reader->setReadDataOnly(true);
    if (method_exists($reader, 'setReadEmptyCells')) {
        $reader->setReadEmptyCells(false);
    }

    $spreadsheet = $reader->load($path);
    if ($preferredName !== null) {
        $sheet = $spreadsheet->getSheetByName($preferredName);
        if ($sheet instanceof Worksheet) {
            return $sheet;
        }
    }

    return $spreadsheet->getSheet(0);
}

function import_price_rows_from_file(string $path): array
{
    $sheet = load_import_sheet($path, 'Bang_gia');
    $rows = $sheet->toArray(null, false, true, false);
    $headers = array_map(static fn($value): string => (string) ($value ?? ''), $rows[0] ?? []);
    $col = resolve_import_columns($headers, [
        'sku'          => ['brand code sku', 'sku', 'sku san pham'],
        'product_name' => ['ten san pham', 'product name', 'ten sp'],
        'unit_price'   => ['gia tren hoa don thanh toan vat', 'gia thanh toan vat', 'don gia', 'gia'],
    ]);

    if (($col['sku'] ?? null) === null) {
        json_error('Không tìm thấy cột SKU trong file Bang_gia.', 422);
    }
    if (($col['unit_price'] ?? null) === null) {
        json_error('Không tìm thấy cột đơn giá trong file Bang_gia.', 422);
    }

    $result = [];
    foreach ($rows as $index => $row) {
        if ($index === 0 || is_import_row_empty($row)) {
            continue;
        }

        $result[] = [
            'sku'          => trim((string) ($row[$col['sku']] ?? '')),
            'product_name' => ($col['product_name'] ?? null) !== null ? trim((string) ($row[$col['product_name']] ?? '')) : '',
            'unit_price'   => $row[$col['unit_price']] ?? null,
        ];
    }

    $normalized = normalize_reconcile_prices($result);
    if ($normalized === []) {
        json_error('File Bang_gia không có dữ liệu hợp lệ để nhập.', 422);
    }

    return $normalized;
}

function import_combo_rows_from_file(string $path): array
{
    $sheet = load_import_sheet($path, 'Combo_to_single');
    $rows = $sheet->toArray(null, false, true, false);
    $headers = array_map(static fn($value): string => (string) ($value ?? ''), $rows[0] ?? []);
    $col = resolve_import_columns($headers, [
        'combo_sku'  => ['sku san pham', 'sku combo', 'combo sku', 'sku'],
        'combo_name' => ['ten san pham', 'ten combo', 'combo name'],
    ]);

    if (($col['combo_sku'] ?? null) === null) {
        json_error('Không tìm thấy cột SKU combo trong file Combo_to_single.', 422);
    }

    $pairs = [];
    foreach ($headers as $index => $header) {
        $normalizedHeader = normalize_import_header((string) ($header ?? ''));

        if (preg_match('/^san pham quy doi(?:\s*(\d+))?$/', $normalizedHeader, $matches) === 1) {
            $key = (string) ($matches[1] ?? $index);
            $pairs[$key]['single_sku'] = $index;
            continue;
        }

        if (preg_match('/^so luong san pham(?:\s*(\d+))?$/', $normalizedHeader, $matches) === 1) {
            $key = (string) ($matches[1] ?? $index);
            $pairs[$key]['single_qty'] = $index;
        }
    }

    $pairs = array_values(array_filter($pairs, static fn(array $pair): bool =>
        isset($pair['single_sku'], $pair['single_qty'])
    ));

    if ($pairs === []) {
        json_error('Không tìm thấy các cặp cột quy đổi trong file Combo_to_single.', 422);
    }

    $result = [];
    foreach ($rows as $index => $row) {
        if ($index === 0 || is_import_row_empty($row)) {
            continue;
        }

        $comboSku = trim((string) ($row[$col['combo_sku']] ?? ''));
        if ($comboSku === '') {
            continue;
        }

        $comboName = ($col['combo_name'] ?? null) !== null ? trim((string) ($row[$col['combo_name']] ?? '')) : '';

        foreach ($pairs as $pair) {
            $singleSku = trim((string) ($row[$pair['single_sku']] ?? ''));
            $singleQty = $row[$pair['single_qty']] ?? null;
            if ($singleSku === '' && ($singleQty === null || trim((string) $singleQty) === '')) {
                continue;
            }

            $result[] = [
                'platform'   => 'all',
                'combo_sku'  => $comboSku,
                'combo_name' => $comboName,
                'single_sku' => $singleSku,
                'single_qty' => $singleQty,
            ];
        }
    }

    $normalized = normalize_reconcile_combos($result);
    if ($normalized === []) {
        json_error('File Combo_to_single không có dữ liệu hợp lệ để nhập.', 422);
    }

    return $normalized;
}

function import_reconcile_settings_from_upload(string $action): void
{
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        json_error('Thiếu file upload.', 422);
    }

    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_error('Upload file thất bại.', 422);
    }

    $tmpName = (string) ($file['tmp_name'] ?? '');
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        json_error('File upload không hợp lệ.', 422);
    }

    if ($action === 'import_prices') {
        $prices = import_price_rows_from_file($tmpName);
        log_activity('info', 'reconcile_settings', 'Nạp Bang_gia từ file Excel.', [
            'filename'   => (string) ($file['name'] ?? ''),
            'price_rows' => count($prices),
        ]);

        json_response([
            'success' => true,
            'message' => 'Đã nạp dữ liệu Bang_gia từ file Excel.',
            'prices'  => $prices,
        ]);
    }

    if ($action === 'import_combos') {
        $combos = import_combo_rows_from_file($tmpName);
        log_activity('info', 'reconcile_settings', 'Nạp Combo_to_single từ file Excel.', [
            'filename'   => (string) ($file['name'] ?? ''),
            'combo_rows' => count($combos),
        ]);

        json_response([
            'success' => true,
            'message' => 'Đã nạp dữ liệu Combo_to_single từ file Excel.',
            'combos'  => $combos,
        ]);
    }

    json_error('Unknown action.', 400);
}

try {
    $pdo = db($config);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $prices = decode_reconcile_setting(get_app_setting($pdo, RECONCILE_PRICE_SETTING_KEY));
        $combos = decode_reconcile_setting(get_app_setting($pdo, RECONCILE_COMBO_SETTING_KEY));

        json_response([
            'success' => true,
            'prices'  => $prices,
            'combos'  => $combos,
        ]);
    }

    require_method('POST');
    require_csrf();

    if (isset($_FILES['file'])) {
        import_reconcile_settings_from_upload((string) ($_POST['action'] ?? ''));
    }

    $body = (array) json_decode((string) file_get_contents('php://input'), true);
    $action = (string) ($body['action'] ?? 'save');

    if ($action !== 'save') {
        json_error('Unknown action.', 400);
    }

    $prices = normalize_reconcile_prices((array) ($body['prices'] ?? []));
    $combos = normalize_reconcile_combos((array) ($body['combos'] ?? []));

    $pdo->beginTransaction();
    set_app_setting($pdo, RECONCILE_PRICE_SETTING_KEY, json_encode($prices, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]');
    set_app_setting($pdo, RECONCILE_COMBO_SETTING_KEY, json_encode($combos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]');
    $pdo->commit();

    log_activity('info', 'reconcile_settings', 'Cập nhật cấu hình đối soát GBS.', [
        'price_rows' => count($prices),
        'combo_rows' => count($combos),
    ]);

    json_response([
        'success' => true,
        'message' => 'Đã lưu cài đặt đối soát.',
        'prices'  => $prices,
        'combos'  => $combos,
    ]);
} catch (\Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_exception($e, 'Không thể lưu cài đặt đối soát.');
}
