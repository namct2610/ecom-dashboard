<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

$langDir = dirname(__DIR__) . '/assets/lang';

// ── GET: list available languages (public — needed before login) ──────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = $_GET['action'] ?? '';

    if ($action === 'list') {
        $files     = glob($langDir . '/*.json') ?: [];
        $languages = [];

        foreach ($files as $file) {
            $raw  = file_get_contents($file);
            $data = json_decode($raw ?: '', true);
            if (!is_array($data)) continue;

            $meta = $data['_meta'] ?? [];
            $code = preg_replace('/[^a-z0-9_-]/i', '', $meta['code'] ?? basename($file, '.json'));
            if (!$code) continue;

            $keyCount = count(array_filter(array_keys($data), fn($k) => $k !== '_meta'));

            $languages[] = [
                'code'     => $code,
                'name'     => $meta['name'] ?? $code,
                'flag'     => $meta['flag'] ?? '🌐',
                'keys'     => $keyCount,
                'builtin'  => in_array($code, ['vi', 'en'], true),
            ];
        }

        // vi first, then alphabetical
        usort($languages, function ($a, $b) {
            if ($a['code'] === 'vi') return -1;
            if ($b['code'] === 'vi') return 1;
            if ($a['code'] === 'en') return -1;
            if ($b['code'] === 'en') return 1;
            return strcmp($a['code'], $b['code']);
        });

        json_response(['success' => true, 'languages' => $languages]);
    }

    json_error('Unknown action.', 400);
}

// ── POST: upload / delete (requires auth) ─────────────────────────────────────
require_admin();
require_method('POST');
require_csrf();

$action = $_POST['action'] ?? '';

// ── Upload a new language JSON file ───────────────────────────────────────────
if ($action === 'upload') {
    $file = $_FILES['lang_file'] ?? null;

    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $errMsg = [
            UPLOAD_ERR_INI_SIZE   => 'File vượt quá giới hạn upload_max_filesize.',
            UPLOAD_ERR_FORM_SIZE  => 'File vượt quá giới hạn MAX_FILE_SIZE.',
            UPLOAD_ERR_NO_FILE    => 'Không có file được gửi lên.',
        ][$file['error'] ?? UPLOAD_ERR_NO_FILE] ?? 'Upload thất bại.';
        json_error($errMsg);
    }

    if ($file['size'] > 512 * 1024) {
        json_error('File ngôn ngữ không được vượt quá 512 KB.');
    }

    $raw  = file_get_contents($file['tmp_name']);
    $data = json_decode($raw ?: '', true);

    if (!is_array($data)) {
        json_error('File không phải JSON hợp lệ.');
    }
    if (empty($data['_meta']['code'])) {
        json_error('File thiếu trường _meta.code.');
    }
    if (empty($data['_meta']['name'])) {
        json_error('File thiếu trường _meta.name.');
    }

    $code = preg_replace('/[^a-z0-9_-]/i', '', (string) $data['_meta']['code']);
    if (!$code || strlen($code) > 10) {
        json_error('_meta.code không hợp lệ (chỉ chấp nhận a-z, 0-9, _, -).');
    }

    if (!is_dir($langDir)) {
        mkdir($langDir, 0755, true);
    }

    $dest = $langDir . '/' . $code . '.json';
    $written = file_put_contents(
        $dest,
        json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
    );

    if ($written === false) {
        json_error('Không thể ghi file. Kiểm tra quyền thư mục assets/lang/.');
    }

    log_activity('info', 'admin', "Đã upload ngôn ngữ: {$code} ({$data['_meta']['name']})");
    json_response([
        'success' => true,
        'code'    => $code,
        'name'    => $data['_meta']['name'],
        'flag'    => $data['_meta']['flag'] ?? '🌐',
    ]);
}

// ── Delete a language file ────────────────────────────────────────────────────
if ($action === 'delete') {
    $code = preg_replace('/[^a-z0-9_-]/i', '', $_POST['code'] ?? '');

    if (!$code) {
        json_error('Thiếu language code.');
    }
    if (in_array($code, ['vi', 'en'], true)) {
        json_error('Không thể xoá ngôn ngữ mặc định (vi, en).');
    }

    $file = $langDir . '/' . $code . '.json';
    if (!file_exists($file)) {
        json_error('Không tìm thấy file ngôn ngữ.');
    }

    unlink($file);
    log_activity('info', 'admin', "Đã xoá ngôn ngữ: {$code}");
    json_response(['success' => true]);
}

json_error('Unknown action.', 400);
