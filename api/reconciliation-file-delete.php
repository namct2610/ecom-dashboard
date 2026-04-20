<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use Dashboard\Reconciliation\ReconciliationFileStore;

require_auth();
require_method('POST');
require_csrf();

try {
    $payload = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        $payload = $_POST;
    }

    $sourceKey = trim((string) ($payload['source_key'] ?? ''));
    if (!ReconciliationFileStore::isValidSourceKey($sourceKey)) {
        json_error('Loại file đối soát không hợp lệ.', 422);
    }

    $store = new ReconciliationFileStore(dirname(__DIR__), $config);
    $currentFile = $store->findFile($sourceKey);
    if (($currentFile['status'] ?? 'missing') !== 'ready') {
        json_error('Không tìm thấy file để xoá.', 404);
    }

    if (!$store->deleteFile($sourceKey)) {
        json_error('Không thể xoá file đối soát.', 500);
    }

    log_activity('info', 'reconcile_upload', 'Xoá file đối soát', [
        'source_key' => $sourceKey,
        'filename'   => $currentFile['filename'] ?? '',
    ]);

    json_response([
        'success' => true,
        'message' => 'Đã xoá file đối soát.',
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể xoá file đối soát.');
}
