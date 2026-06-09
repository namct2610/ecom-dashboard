<?php

declare(strict_types=1);

/**
 * V2 UI self-update endpoint.
 *
 * Independent of the main app's update channel:
 *   • Reads / writes v2/version.txt (NOT root version.txt)
 *   • Pulls a separate manifest URL (v2/manifest.json on the public repo)
 *   • Update zips include only v2-related files (v2/* + api/v2-*.php) so
 *     applying an update never touches v1.
 *
 * Manifest schema = same as core (Updater::fetchManifest):
 *   { "version":"2.0.1", "download_url":"...zip", "changelog":"…",
 *     "min_php":"8.1", "released_at":"2026-06-10" }
 */

require dirname(__DIR__) . '/includes/bootstrap.php';
require dirname(__DIR__) . '/includes/Updater.php';

use Dashboard\Updater;

require_admin();

$pdo = db($config);

// Updater installs files into the dashboard root (zip paths are repo-relative,
// e.g. v2/index.html, api/v2-data.php) but tracks version in v2/version.txt.
$appRoot = dirname(__DIR__);
$updater = new Updater($appRoot, $appRoot . '/v2/version.txt');

const V2_MANIFEST_URL = 'https://raw.githubusercontent.com/namct2610/ecom-dashboard/main/v2/manifest.json';

function v2_update_get_setting(PDO $pdo, string $key, string $default = ''): string
{
    $stmt = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?');
    $stmt->execute([$key]);
    return $stmt->fetchColumn() ?: $default;
}

function v2_update_set_setting(PDO $pdo, string $key, string $value): void
{
    $pdo->prepare("
        INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    ")->execute([$key, $value]);
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $currentVer = $updater->getCurrentVersion();
        $lastCheck  = v2_update_get_setting($pdo, 'v2_update_last_check');
        $cachedData = v2_update_get_setting($pdo, 'v2_update_cached_data');
        $cacheAge   = $lastCheck ? (time() - (int) $lastCheck) : PHP_INT_MAX;
        $fetchError = null;

        if ($cacheAge < 1800 && $cachedData !== '') {
            $manifest = json_decode($cachedData, true) ?: [];
        } else {
            try {
                $manifest = $updater->fetchManifest(V2_MANIFEST_URL);
                v2_update_set_setting($pdo, 'v2_update_last_check', (string) time());
                v2_update_set_setting($pdo, 'v2_update_cached_data', json_encode($manifest) ?: '');
            } catch (\Throwable $e) {
                $fetchError = $e->getMessage();
                $manifest = json_decode($cachedData ?: '[]', true) ?: [];
            }
        }

        $latestVer = $manifest['version'] ?? null;
        json_response([
            'success'      => true,
            'channel'      => 'v2',
            'current'      => $currentVer,
            'latest'       => $latestVer,
            'has_update'   => $latestVer ? $updater->hasUpdate($latestVer) : false,
            'changelog'    => $manifest['changelog'] ?? null,
            'download_url' => $manifest['download_url'] ?? null,
            'released_at'  => $manifest['released_at'] ?? null,
            'min_php'      => $manifest['min_php'] ?? null,
            'last_checked' => $lastCheck ? date('d/m/Y H:i', (int) $lastCheck) : null,
            'manifest_url' => V2_MANIFEST_URL,
            'fetch_error'  => $fetchError,
        ]);
    }

    require_method('POST');
    require_csrf();

    $body   = (array) json_decode(file_get_contents('php://input') ?: '{}', true);
    $action = (string) ($body['action'] ?? '');

    if ($action === 'check_now') {
        v2_update_set_setting($pdo, 'v2_update_last_check', '');
        v2_update_set_setting($pdo, 'v2_update_cached_data', '');
        json_response(['success' => true]);
    }

    if ($action === 'apply') {
        $downloadUrl = trim((string) ($body['download_url'] ?? ''));
        $version     = trim((string) ($body['version'] ?? ''));
        if ($downloadUrl === '' || $version === '') {
            json_error('Thiếu download_url hoặc version.');
        }
        if (!filter_var($downloadUrl, FILTER_VALIDATE_URL)) {
            json_error('download_url không hợp lệ.');
        }
        if (!$updater->hasUpdate($version)) {
            json_error('Phiên bản v2 này không mới hơn phiên bản hiện tại.');
        }

        @set_time_limit(300);
        log_activity('info', 'system', "Bắt đầu cập nhật v2 lên v{$version}");
        $updater->applyUpdate($downloadUrl, $version);
        ensure_schema($pdo, $config);

        v2_update_set_setting($pdo, 'v2_update_last_check', '');
        v2_update_set_setting($pdo, 'v2_update_cached_data', '');
        log_activity('info', 'system', "Cập nhật v2 thành công lên v{$version}");
        json_response([
            'success' => true,
            'message' => "Đã cập nhật giao diện v2 thành công lên v{$version}! Tải lại /v2/ để áp dụng.",
        ]);
    }

    json_error('Unknown action.', 400);
} catch (\Throwable $e) {
    json_exception($e, 'Lỗi hệ thống cập nhật v2.');
}
