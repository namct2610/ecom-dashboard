<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_admin();

try {
    $pdo = db($config);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        json_response([
            'success' => true,
            'rules'   => load_sku_brand_rules($pdo),
        ]);
    }

    require_method('POST');
    require_csrf();

    $body = (array) json_decode((string) file_get_contents('php://input'), true);
    $action = (string) ($body['action'] ?? 'save');
    if ($action !== 'save') {
        json_error('Unknown action.', 400);
    }

    $rules = normalize_sku_brand_rules((array) ($body['rules'] ?? []));
    set_app_setting(
        $pdo,
        SKU_BRAND_RULES_SETTING_KEY,
        json_encode($rules, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]'
    );

    log_activity('info', 'brand_settings', 'Cập nhật quy ước SKU sang thương hiệu.', [
        'brand_rules' => count($rules),
    ]);

    json_response([
        'success' => true,
        'message' => 'Đã lưu quy ước SKU sang thương hiệu.',
        'rules'   => $rules,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể lưu quy ước thương hiệu.');
}
