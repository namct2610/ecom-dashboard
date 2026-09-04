<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('POST');
require_csrf();

/** Turn a php.ini shorthand size ("50M", "8M", "1G") into bytes. */
function upload_ini_bytes(string $key): int
{
    $raw = trim((string) ini_get($key));
    if ($raw === '') return 0;
    $unit = strtolower(substr($raw, -1));
    $n = (int) $raw;
    return match ($unit) {
        'g' => $n * 1024 * 1024 * 1024,
        'm' => $n * 1024 * 1024,
        'k' => $n * 1024,
        default => (int) $raw,
    };
}

function upload_human_size(int $bytes): string
{
    if ($bytes >= 1048576) return round($bytes / 1048576, 1) . ' MB';
    if ($bytes >= 1024) return round($bytes / 1024) . ' KB';
    return $bytes . ' B';
}

/**
 * The project ships a .user.ini asking for 50M, so "create .user.ini" is useless
 * advice — it already exists. It only takes effect on PHP-FPM/CGI, which is the
 * part worth telling the user.
 */
function upload_limit_hint(): string
{
    $sapi = PHP_SAPI;
    if (in_array($sapi, ['fpm-fcgi', 'cgi-fcgi', 'cgi'], true)) {
        return 'File .user.ini ở thư mục gốc đã đặt 50M — nếu vẫn lỗi thì nhà cung cấp hosting đang khoá mức cao hơn, cần liên hệ để nâng.';
    }
    return sprintf(
        'Máy chủ đang chạy PHP dạng "%s" nên KHÔNG đọc file .user.ini; phải nâng upload_max_filesize và post_max_size trong php.ini (hoặc nhờ hosting nâng).',
        $sapi
    );
}

try {
    set_time_limit(300);
    ini_set('memory_limit', '256M');

    // A memory_limit or max_execution_time fatal unwinds past every try/catch,
    // so the browser gets a blank 500 and the operator learns nothing — that is
    // what most of the failures in the field looked like. Both limits are the
    // foreseeable outcome of a big sheet on a shared host, so answer them with
    // JSON that names the limit instead of with an empty response. Shared hosts
    // often block set_time_limit/ini_set outright, hence reporting the value
    // that is actually in force rather than the one we asked for.
    $fatalCtx = ['file' => null, 'upload_id' => null, 'pdo' => null];
    register_shutdown_function(function () use (&$fatalCtx) {
        $err = error_get_last();
        if (!$err || !in_array($err['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR], true)) return;

        $msg = (string) $err['message'];
        if (stripos($msg, 'memory size') !== false) {
            $why = sprintf(
                'Máy chủ hết bộ nhớ khi đọc file (memory_limit đang là %s). File báo cáo Shopee có tới ~1000 cột nên cần nhiều RAM; hãy nâng memory_limit lên 512M.',
                ini_get('memory_limit')
            );
        } elseif (stripos($msg, 'Maximum execution time') !== false) {
            $why = sprintf(
                'Quá thời gian xử lý (max_execution_time đang là %ss). Hãy nâng max_execution_time lên 300.',
                ini_get('max_execution_time')
            );
        } else {
            $why = 'Lỗi nghiêm trọng của PHP: ' . $msg;
        }

        if ($fatalCtx['pdo'] instanceof PDO && $fatalCtx['upload_id']) {
            try {
                if ($fatalCtx['pdo']->inTransaction()) $fatalCtx['pdo']->rollBack();
                update_upload_history($fatalCtx['pdo'], (int) $fatalCtx['upload_id'], 'failed', ['error_message' => $why]);
            } catch (\Throwable $ignore) {}
        }

        if (headers_sent()) return;
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'message' => '0/1 file được import thành công.',
            'results' => [[
                'file'      => $fatalCtx['file'] ?? 'unknown',
                'success'   => false,
                'upload_id' => $fatalCtx['upload_id'],
                'error'     => $why,
            ]],
        ], JSON_UNESCAPED_UNICODE);
    });
    ensure_upload_dir($config);
    $pdo = db($config);

    if (empty($_FILES)) {
        // PHP throws the whole body away when it is larger than post_max_size —
        // $_FILES and $_POST both come back empty. Reporting "no file" there
        // sends the user hunting for the wrong problem, so name the real cause.
        $sent = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        $postMax = upload_ini_bytes('post_max_size');
        if ($postMax > 0 && $sent > $postMax) {
            json_error(sprintf(
                'File quá lớn so với giới hạn của máy chủ: gửi %s nhưng post_max_size chỉ %s. %s',
                upload_human_size($sent), upload_human_size($postMax), upload_limit_hint()
            ), 413);
        }
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
        $fatalCtx['file'] = $originalName;
        $fatalCtx['pdo']  = $pdo;
        $fatalCtx['upload_id'] = null;
        $uploadError  = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);

        if ($uploadError !== UPLOAD_ERR_OK) {
            $errMsgs = [
                // PHP zeroes ['size'] when it rejects on this error, so fall back
                // to the request length rather than printing a useless "0 B".
                UPLOAD_ERR_INI_SIZE  => sprintf(
                    'File%s vượt giới hạn upload_max_filesize của máy chủ (%s). %s',
                    (($sz = (int) ($file['size'] ?: ($_SERVER['CONTENT_LENGTH'] ?? 0))) > 0 ? ' (' . upload_human_size($sz) . ')' : ''),
                    upload_human_size(upload_ini_bytes('upload_max_filesize')),
                    upload_limit_hint()
                ),
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
            $dataType  = (string) ($profile['data_type'] ?? 'orders');
            $isTraffic = $dataType === 'traffic';
            $isSettlement = $dataType === 'settlement';
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
        )->execute([':p' => $platform, ':dt' => $dataType, ':fn' => $stored, ':ofn' => $originalName]);
        $uploadId = (int)$pdo->lastInsertId();
        $fatalCtx['upload_id'] = $uploadId;

        try {
            if ($isSettlement) {
                $settlement = \Dashboard\Parsers\SettlementParser::parse($dest);
                $parsed = [
                    'rows'          => $settlement['rows'],
                    'errors'        => [],
                    'total_rows'    => count($settlement['rows']),
                    'imported_rows' => count($settlement['rows']),
                    'skipped_rows'  => (int) ($settlement['skipped'] ?? 0),
                ];
            } else {
                $parser = $isTraffic ? create_traffic_parser($platform, $dest) : create_order_parser($platform, $dest);
                $parsed = $parser->parse($uploadId);
            }

            $pdo->beginTransaction();
            foreach ($parsed['errors'] ?? [] as $err) {
                log_import_error($pdo, $uploadId, (int)$err['row_number'], $err['raw_order_id'] ?? null, $err['raw_sku'] ?? null, $err['error_code'], $err['error_message'], (array)($err['raw_payload'] ?? []));
            }
            if ($isSettlement) {
                foreach ($parsed['rows'] as $row) upsert_order_settlement($pdo, $row, $uploadId);
            } elseif ($isTraffic) {
                foreach ($parsed['rows'] as $row) upsert_traffic_daily($pdo, $row);
            } else {
                delete_orders_by_platform_and_ids(
                    $pdo,
                    $platform,
                    array_column($parsed['rows'] ?? [], 'order_id')
                );
                foreach ($parsed['rows'] as $row) upsert_order($pdo, $row);
            }
            // Giữ nguyên văn từng dòng để sau này xuất ngược ra đúng format gốc.
            // Lỗi ở bước này không được làm hỏng import: dữ liệu phân tích vẫn
            // phải vào được, chỉ mất khả năng xuất lại của riêng file đó.
            $rawSaved = 0;
            $rawError = null;
            try {
                $raw = \Dashboard\Parsers\RawRowCapture::capture($dest, $platform, $dataType);
                save_import_layout($pdo, $raw['layout_hash'], $platform, $dataType, $raw['headers'], $raw['preamble'] ?? [], $raw['sheet_name'] ?? 'Sheet1', $raw['prologue'] ?? []);
                $rawSaved = upsert_import_rows($pdo, $platform, $dataType, $raw['layout_hash'], $raw['rows'], $uploadId);
            } catch (\Throwable $rawEx) {
                $rawError = $rawEx->getMessage();
                log_activity('warning', 'upload_raw', "Không lưu được dòng thô: {$originalName}", [
                    'upload_id' => $uploadId,
                    'error'     => $rawError,
                ]);
            }

            $pdo->commit();

            update_upload_history($pdo, $uploadId, 'completed', $parsed);

            $errCount = count($parsed['errors'] ?? []);
            log_activity('info', 'upload', "Import thành công: {$originalName}", [
                'upload_id'  => $uploadId,
                'platform'   => $platform,
                'data_type'  => $dataType,
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
                'data_type'  => $dataType,
                'detected_by'=> $detectedBy,
                'total_rows' => $parsed['total_rows'],
                'imported'   => $parsed['imported_rows'],
                'skipped'    => $parsed['skipped_rows'],
                'errors'     => $errCount,
                'raw_saved'  => $rawSaved,
                'raw_error'  => $rawError,
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
            // Every other endpoint shows the real message to an admin (see
            // json_exception); this one hid it behind "Lỗi xử lý file." unless the
            // request came from localhost, which left the operator on a live
            // server with no way to tell a memory limit from a bad sheet. The
            // detail is already written to upload_history and app_logs — showing
            // it to an admin here just saves digging for it.
            $viewer   = function_exists('current_user') ? current_user() : null;
            $showReal = is_local() || (($viewer['role'] ?? '') === 'admin');
            $results[] = [
                'file'      => $originalName,
                'success'   => false,
                'upload_id' => $uploadId,
                'error'     => $showReal
                    ? sprintf('%s (%s)', $e->getMessage(), basename($e->getFile()) . ':' . $e->getLine())
                    : 'Lỗi xử lý file.',
            ];
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
