<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

use Dashboard\Reconciliation\GbsReconciliationService;

require_auth();
require_method('GET');

try {
    $service = new GbsReconciliationService(dirname(__DIR__));
    json_response($service->compare());
} catch (\Throwable $e) {
    json_exception($e, 'Không thể đối soát file GBS với file sàn.');
}
