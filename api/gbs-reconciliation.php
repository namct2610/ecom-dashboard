<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use Dashboard\Reconciliation\GbsReconciliationService;

require_auth();

try {
    $service = new GbsReconciliationService(dirname(__DIR__), $config);
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if ($method === 'GET') {
        $month = trim((string) ($_GET['month'] ?? ''));
        json_response($service->compare($month !== '' ? $month : null));
    }

    require_method('POST');
    require_csrf();

    $payload = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        $payload = [];
    }

    $action = trim((string) ($payload['action'] ?? ''));
    if ($action !== 'set_confirmed') {
        json_error('Unknown action.', 400);
    }

    $month = trim((string) ($payload['month'] ?? ''));
    $confirmed = !empty($payload['confirmed']);
    $user = current_user();
    $result = $service->setMonthConfirmation($month, $confirmed, $user['username'] ?? null);

    json_response([
        'success' => true,
        'month' => $month,
        'confirmation' => $result,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể đối soát GBS với dữ liệu sàn.');
}
