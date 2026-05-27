<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';
require dirname(__DIR__) . '/includes/Updater.php';

use Dashboard\Updater;

require_admin();

$pdo = db($config);
$updater = new Updater(__DIR__ . '/..');

const BETA_MANIFEST_URL = 'https://raw.githubusercontent.com/namct2610/ecom-dashboard/main/beta/manifest.json';

function beta_update_get_setting(PDO $pdo, string $key, string $default = ''): string
{
    $stmt = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?');
    $stmt->execute([$key]);
    return $stmt->fetchColumn() ?: $default;
}

function beta_update_set_setting(PDO $pdo, string $key, string $value): void
{
    $pdo->prepare("
        INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    ")->execute([$key, $value]);
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $currentVer = $updater->getCurrentVersion();
        $lastCheck = beta_update_get_setting($pdo, 'beta_update_last_check');
        $cachedData = beta_update_get_setting($pdo, 'beta_update_cached_data');
        $cacheAge = $lastCheck ? (time() - (int) $lastCheck) : PHP_INT_MAX;
        $fetchError = null;

        if ($cacheAge < 1800 && $cachedData !== '') {
            $manifest = json_decode($cachedData, true) ?: [];
        } else {
            try {
                $manifest = $updater->fetchManifest(BETA_MANIFEST_URL);
                beta_update_set_setting($pdo, 'beta_update_last_check', (string) time());
                beta_update_set_setting($pdo, 'beta_update_cached_data', json_encode($manifest) ?: '');
            } catch (\Throwable $e) {
                $fetchError = $e->getMessage();
                $manifest = json_decode($cachedData ?: '[]', true) ?: [];
            }
        }

        $latestVer = $manifest['version'] ?? null;
        json_response([
            'success' => true,
            'channel' => 'beta',
            'current' => $currentVer,
            'latest' => $latestVer,
            'has_update' => $latestVer ? $updater->hasUpdate($latestVer) : false,
            'changelog' => $manifest['changelog'] ?? null,
            'download_url' => $manifest['download_url'] ?? null,
            'released_at' => $manifest['released_at'] ?? null,
            'min_php' => $manifest['min_php'] ?? null,
            'last_checked' => $lastCheck ? date('d/m/Y H:i', (int) $lastCheck) : null,
            'manifest_url' => BETA_MANIFEST_URL,
            'fetch_error' => $fetchError,
        ]);
    }

    require_method('POST');
    require_csrf();

    $body = (array) json_decode(file_get_contents('php://input') ?: '{}', true);
    $action = (string) ($body['action'] ?? '');

    if ($action === 'check_now') {
        beta_update_set_setting($pdo, 'beta_update_last_check', '');
        beta_update_set_setting($pdo, 'beta_update_cached_data', '');
        json_response(['success' => true]);
    }

    if ($action === 'apply') {
        $downloadUrl = trim((string) ($body['download_url'] ?? ''));
        $version = trim((string) ($body['version'] ?? ''));
        if ($downloadUrl === '' || $version === '') {
            json_error('Thiếu download_url hoặc version.');
        }
        if (!filter_var($downloadUrl, FILTER_VALIDATE_URL)) {
            json_error('download_url không hợp lệ.');
        }
        if (!$updater->hasUpdate($version)) {
            json_error('Phiên bản beta này không mới hơn phiên bản hiện tại.');
        }

        @set_time_limit(300);
        log_activity('info', 'system', "Bắt đầu cập nhật beta lên v{$version}");
        $updater->applyUpdate($downloadUrl, $version);
        ensure_schema($pdo, $config);

        beta_update_set_setting($pdo, 'beta_update_last_check', '');
        beta_update_set_setting($pdo, 'beta_update_cached_data', '');
        log_activity('info', 'system', "Cập nhật beta thành công lên v{$version}");
        json_response([
            'success' => true,
            'message' => "Đã cập nhật beta thành công lên v{$version}! Tải lại trang để áp dụng.",
        ]);
    }

    json_error('Unknown action.', 400);
} catch (\Throwable $e) {
    json_exception($e, 'Lỗi hệ thống cập nhật beta.');
}
