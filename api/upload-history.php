<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('GET');

try {
    $pdo   = db($config);
    $limit = min(50, max(10, (int)($_GET['limit'] ?? 20)));

    $stmt = $pdo->prepare("
        SELECT id, platform, data_type, original_filename, total_rows,
               imported_rows, skipped_rows, status, error_message, uploaded_at, processed_at
        FROM upload_history
        ORDER BY uploaded_at DESC
        LIMIT {$limit}
    ");
    $stmt->execute();
    $history = $stmt->fetchAll();

    json_response(['success' => true, 'history' => $history]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải lịch sử upload.');
}
