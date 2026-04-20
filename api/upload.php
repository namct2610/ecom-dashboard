<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('POST');

try {
    set_time_limit(300);
    ini_set('memory_limit', '256M');
    ensure_upload_dir($config);
    $pdo = db($config);

    if (empty($_FILES)) {
        json_error('Không có file nào được gửi lên.', 422);
    }

    // Support both files[] (multiple) and file (single)
    $files = [];
    if (isset($_FILES['files'])) {
        $f = $_FILES['files'];
        $count = is_array($f['name']) ? count($f['name']) : 1;
        for ($i = 0; $i < $count; $i++) {
            if (is_array($f['name'])) {
                $files[] = [
                    'name'     => $f['name'][$i],
                    'tmp_name' => $f['tmp_name'][$i],
                    'error'    => $f['error'][$i],
                    'size'     => $f['size'][$i],
                ];
            } else {
                $files[] = $f;
            }
        }
    } elseif (isset($_FILES['file'])) {
        $files[] = $_FILES['file'];
    }

    if (empty($files)) {
        json_error('Không có file nào được gửi lên.', 422);
    }

    $results = [];

    foreach ($files as $file) {
        $originalName = (string)($file['name'] ?? 'unknown');
        $uploadError  = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);

        if ($uploadError !== UPLOAD_ERR_OK) {
            $errMsgs = [
                UPLOAD_ERR_INI_SIZE  => 'File vượt quá upload_max_filesize. Tạo .user.ini: upload_max_filesize = 50M',
                UPLOAD_ERR_FORM_SIZE => 'File vượt quá giới hạn form.',
                UPLOAD_ERR_PARTIAL   => 'File chỉ upload được một phần.',
                UPLOAD_ERR_NO_FILE   => 'Không có file.',
            ];
            $results[] = ['file' => $originalName, 'success' => false, 'error' => $errMsgs[$uploadError] ?? "Upload error $uploadError"];
            continue;
        }

        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!in_array($ext, ['xlsx', 'xls'], true)) {
            $results[] = ['file' => $originalName, 'success' => false, 'error' => 'Chỉ chấp nhận .xlsx hoặc .xls'];
            continue;
        }

        if ((int)$file['size'] > $config['app']['max_upload_size']) {
            $results[] = ['file' => $originalName, 'success' => false, 'error' => 'File quá lớn (tối đa 50MB)'];
            continue;
        }

        $tempPath  = $file['tmp_name'];
        $isTraffic = false;
        $platform  = null;
        $detectedBy = null;

        try {
            $profile = detect_upload_profile_from_file($tempPath);
            $platform = (string) ($profile['platform'] ?? '');
            $isTraffic = (string) ($profile['data_type'] ?? 'orders') === 'traffic';
            $detectedBy = (string) ($profile['detected_by'] ?? '');
        } catch (\Throwable $e) {
            $results[] = ['file' => $originalName, 'success' => false, 'error' => $e->getMessage()];
            continue;
        }

        // Move to upload dir
        $stored = sprintf('%s_%s_%s.%s', $platform, date('Ymd_His'), bin2hex(random_bytes(4)), $ext);
        $dest   = $config['app']['upload_path'] . '/' . $stored;

        if (!move_uploaded_file($tempPath, $dest)) {
            $results[] = ['file' => $originalName, 'success' => false, 'error' => 'Không thể lưu file lên server.'];
            continue;
        }

        // Create upload_history record
        $pdo->prepare(
            "INSERT INTO upload_history (platform, data_type, filename, original_filename, status)
             VALUES (:p, :dt, :fn, :ofn, 'processing')"
        )->execute([':p' => $platform, ':dt' => $isTraffic ? 'traffic' : 'orders', ':fn' => $stored, ':ofn' => $originalName]);
        $uploadId = (int)$pdo->lastInsertId();

        try {
            $parser  = $isTraffic ? create_traffic_parser($platform, $dest) : create_order_parser($platform, $dest);
            $parsed  = $parser->parse($uploadId);

            $pdo->beginTransaction();
            foreach ($parsed['errors'] ?? [] as $err) {
                log_import_error($pdo, $uploadId, (int)$err['row_number'], $err['raw_order_id'] ?? null, $err['raw_sku'] ?? null, $err['error_code'], $err['error_message'], (array)($err['raw_payload'] ?? []));
            }
            if ($isTraffic) {
                foreach ($parsed['rows'] as $row) upsert_traffic_daily($pdo, $row);
            } else {
                foreach ($parsed['rows'] as $row) upsert_order($pdo, $row);
            }
            $pdo->commit();

            update_upload_history($pdo, $uploadId, 'completed', $parsed);

            $errCount = count($parsed['errors'] ?? []);
            log_activity('info', 'upload', "Import thành công: {$originalName}", [
                'upload_id'  => $uploadId,
                'platform'   => $platform,
                'data_type'  => $isTraffic ? 'traffic' : 'orders',
                'detected_by'=> $detectedBy,
                'total_rows' => $parsed['total_rows'],
                'imported'   => $parsed['imported_rows'],
                'skipped'    => $parsed['skipped_rows'],
                'errors'     => $errCount,
                'parse_errors' => $errCount > 0 ? array_slice($parsed['errors'], 0, 5) : [],
            ]);

            $results[] = [
                'file'       => $originalName,
                'success'    => true,
                'upload_id'  => $uploadId,
                'platform'   => $platform,
                'data_type'  => $isTraffic ? 'traffic' : 'orders',
                'detected_by'=> $detectedBy,
                'total_rows' => $parsed['total_rows'],
                'imported'   => $parsed['imported_rows'],
                'skipped'    => $parsed['skipped_rows'],
                'errors'     => $errCount,
            ];
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            update_upload_history($pdo, $uploadId, 'failed', ['error_message' => $e->getMessage()]);
            log_activity('error', 'upload', "Import thất bại: {$originalName} — " . $e->getMessage(), [
                'upload_id' => $uploadId,
                'platform'  => $platform,
                'exception' => get_class($e),
                'file'      => $e->getFile() . ':' . $e->getLine(),
                'trace'     => array_slice(explode("\n", $e->getTraceAsString()), 0, 6),
            ]);
            $results[] = ['file' => $originalName, 'success' => false, 'upload_id' => $uploadId, 'error' => is_local() ? $e->getMessage() : 'Lỗi xử lý file.'];
        } finally {
            if (is_file($dest)) @unlink($dest);
        }
    }

    $successCount = count(array_filter($results, fn($r) => $r['success']));
    json_response([
        'success' => $successCount > 0,
        'message' => "$successCount/" . count($results) . " file được import thành công.",
        'results' => $results,
    ], 201);

} catch (\Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    json_exception($e, 'Upload thất bại.');
}
