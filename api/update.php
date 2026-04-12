<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';
require dirname(__DIR__) . '/includes/Updater.php';

use Dashboard\Updater;

require_auth();

$pdo     = db($config);
$updater = new Updater(__DIR__ . '/..');

// ── Helpers ───────────────────────────────────────────────────────────────────

function get_setting(PDO $pdo, string $key, string $default = ''): string
{
    $st = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key = ?");
    $st->execute([$key]);
    return $st->fetchColumn() ?: $default;
}

function set_setting(PDO $pdo, string $key, string $value): void
{
    $pdo->prepare("
        INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    ")->execute([$key, $value]);
}

// ── GET: check for updates ────────────────────────────────────────────────────
try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $manifestUrl = get_setting($pdo, 'update_manifest_url');
        $currentVer  = $updater->getCurrentVersion();
        $lastCheck   = get_setting($pdo, 'update_last_check');
        $cachedData  = get_setting($pdo, 'update_cached_data');
        $cacheAge    = $lastCheck ? (time() - (int) $lastCheck) : PHP_INT_MAX;

        $manifest    = [];
        $fetchError  = null;

        if ($manifestUrl) {
            // Use cache if less than 6 hours old
            if ($cacheAge < 21600 && $cachedData) {
                $manifest = json_decode($cachedData, true) ?: [];
            } else {
                try {
                    $manifest = $updater->fetchManifest($manifestUrl);
                    set_setting($pdo, 'update_last_check',  (string) time());
                    set_setting($pdo, 'update_cached_data', json_encode($manifest) ?: '');
                } catch (\Throwable $e) {
                    $fetchError = $e->getMessage();
                    $manifest   = json_decode($cachedData ?: '[]', true) ?: [];
                }
            }
        }

        $latestVer = $manifest['version'] ?? null;
        $hasUpdate = $latestVer ? $updater->hasUpdate($latestVer) : false;

        json_response([
            'success'      => true,
            'current'      => $currentVer,
            'latest'       => $latestVer,
            'has_update'   => $hasUpdate,
            'changelog'    => $manifest['changelog']    ?? null,
            'download_url' => $manifest['download_url'] ?? null,
            'released_at'  => $manifest['released_at']  ?? null,
            'min_php'      => $manifest['min_php']       ?? null,
            'last_checked' => $lastCheck ? date('d/m/Y H:i', (int) $lastCheck) : null,
            'manifest_url' => $manifestUrl,
            'fetch_error'  => $fetchError,
        ]);
    }

    // ── POST requests ─────────────────────────────────────────────────────────
    require_method('POST');
    require_csrf();

    $body   = (array) json_decode(file_get_contents('php://input') ?: '{}', true);
    $action = $body['action'] ?? '';

    // ── Save manifest URL ─────────────────────────────────────────────────────
    if ($action === 'save_manifest_url') {
        $url = trim($body['url'] ?? '');
        if ($url !== '' && !filter_var($url, FILTER_VALIDATE_URL)) {
            json_error('URL không hợp lệ.');
        }
        set_setting($pdo, 'update_manifest_url', $url);
        set_setting($pdo, 'update_last_check',   '');
        set_setting($pdo, 'update_cached_data',  '');
        json_response(['success' => true]);
    }

    // ── Force re-check (clear cache) ──────────────────────────────────────────
    if ($action === 'check_now') {
        set_setting($pdo, 'update_last_check',  '');
        set_setting($pdo, 'update_cached_data', '');
        json_response(['success' => true]);
    }

    // ── Apply update ──────────────────────────────────────────────────────────
    if ($action === 'apply') {
        $downloadUrl = trim($body['download_url'] ?? '');
        $version     = trim($body['version']      ?? '');

        if ($downloadUrl === '' || $version === '') {
            json_error('Thiếu download_url hoặc version.');
        }
        if (!filter_var($downloadUrl, FILTER_VALIDATE_URL)) {
            json_error('download_url không hợp lệ.');
        }
        if (!$updater->hasUpdate($version)) {
            json_error('Phiên bản này không mới hơn phiên bản hiện tại.');
        }

        // Increase time limit — download + extract can take a while
        @set_time_limit(300);

        log_activity('info', 'system', "Bắt đầu cập nhật lên v{$version}");

        try {
            $updater->applyUpdate($downloadUrl, $version);
        } catch (\Throwable $e) {
            log_activity('error', 'system', 'Cập nhật thất bại: ' . $e->getMessage());
            json_error('Cập nhật thất bại: ' . $e->getMessage());
        }

        // Run DB migrations for any new tables/columns in this version
        try {
            ensure_schema($pdo);
        } catch (\Throwable $e) {
            log_activity('warning', 'system', 'ensure_schema sau cập nhật: ' . $e->getMessage());
        }

        // Invalidate cache so next check reads new version
        set_setting($pdo, 'update_last_check',  '');
        set_setting($pdo, 'update_cached_data', '');

        log_activity('info', 'system', "Cập nhật thành công lên v{$version}");
        json_response([
            'success' => true,
            'message' => "Đã cập nhật thành công lên v{$version}! Tải lại trang để áp dụng.",
        ]);
    }

    json_error('Unknown action.', 400);

} catch (\Throwable $e) {
    json_exception($e, 'Lỗi hệ thống cập nhật.');
}
