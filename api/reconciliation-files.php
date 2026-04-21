<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use Dashboard\Reconciliation\GbsReconciliationService;
use Dashboard\Reconciliation\ReconciliationFileStore;

require_auth();

function sanitize_reconciliation_file_meta(array $file): array
{
    $entry = $file;
    unset($entry['path']);
    return $entry;
}

try {
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $store = new ReconciliationFileStore(dirname(__DIR__), $config);

    if ($method === 'GET') {
        $files = array_map(
            'sanitize_reconciliation_file_meta',
            $store->listGbsFiles()
        );

        json_response([
            'success' => true,
            'files'   => $files,
        ]);
    }

    if ($method !== 'POST') {
        json_error('Method not allowed.', 405);
    }

    require_csrf();
    set_time_limit(180);
    ensure_upload_dir($config);

    $sourceKey = 'gbs';

    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        json_error('Không có file nào được gửi lên.', 422);
    }

    $file = $_FILES['file'];
    $originalName = (string) ($file['name'] ?? '');
    $uploadError = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);

    if ($uploadError !== UPLOAD_ERR_OK) {
        $errMsgs = [
            UPLOAD_ERR_INI_SIZE  => 'File vượt quá upload_max_filesize.',
            UPLOAD_ERR_FORM_SIZE => 'File vượt quá giới hạn form.',
            UPLOAD_ERR_PARTIAL   => 'File chỉ upload được một phần.',
            UPLOAD_ERR_NO_FILE   => 'Không có file.',
        ];
        json_error($errMsgs[$uploadError] ?? "Upload error {$uploadError}", 422);
    }

    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if (!in_array($ext, ['xlsx', 'xls'], true)) {
        json_error('Chỉ chấp nhận file .xlsx hoặc .xls.', 422);
    }

    if ((int) ($file['size'] ?? 0) > (int) ($config['app']['max_upload_size'] ?? 50 * 1024 * 1024)) {
        json_error('File quá lớn (tối đa 50MB).', 422);
    }

    $tmpPath = (string) ($file['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
        json_error('File upload không hợp lệ.', 422);
    }

    $inspector = new GbsReconciliationService(dirname(__DIR__), $config);
    $stats = $inspector->inspectSourceFile($sourceKey, $tmpPath);
    $storedFile = $store->storeUploadedFile($sourceKey, $file);

    log_activity('info', 'reconcile_upload', "Lưu file đối soát: {$originalName}", [
        'source_key'  => $sourceKey,
        'filename'    => $storedFile['filename'] ?? '',
        'row_count'   => $stats['row_count'] ?? 0,
        'order_count' => $stats['order_count'] ?? 0,
        'months'      => $stats['months'] ?? [],
        'size_bytes'  => $storedFile['size_bytes'] ?? 0,
    ]);

    json_response([
        'success' => true,
        'message' => 'Đã lưu file đối soát.',
        'file'    => sanitize_reconciliation_file_meta($storedFile),
        'stats'   => $stats,
    ], 201);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể lưu file đối soát.');
}
