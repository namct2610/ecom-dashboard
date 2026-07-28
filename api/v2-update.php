<?php

declare(strict_types=1);

/**
 * Main self-update endpoint (the v2-named file is kept for URL stability
 * across the v3.0.0 restructure — the in-app Settings → "Phiên bản v2"
 * card already POSTs here, so renaming would break existing deployments).
 *
 *   • Reads / writes the root version.txt
 *   • Pulls manifest.json at repo root (the public main manifest)
 *   • build.sh excludes /old/ from the zip so updates never touch the
 *     legacy v1 app — that has its own channel via /api/update.php.
 *
 * Manifest schema (Updater::fetchManifest):
 *   { "version":"3.0.0", "download_url":"...zip", "changelog":"…",
 *     "min_php":"8.1", "released_at":"YYYY-MM-DD" }
 */

require dirname(__DIR__) . '/includes/bootstrap.php';
require dirname(__DIR__) . '/includes/Updater.php';

use Dashboard\Updater;

require_admin();

$pdo = db($config);

// Update channel — Updater anchors at repo root with the canonical
// version.txt at the root. preservedPaths keeps config + uploads
// across updates.
$appRoot = dirname(__DIR__);
$updater = new Updater($appRoot);

// GitHub API contents endpoint — 60s CDN cache + ETag revalidation,
// much more reliable than raw.githubusercontent.com (5-min cache + edge
// inconsistency). The Updater detects the base64 content envelope and
// decodes it transparently.
const V2_MANIFEST_URL = 'https://api.github.com/repos/namct2610/ecom-dashboard/contents/manifest.json?ref=main';
const V2_MANIFEST_CACHE_TTL = 60;

/** Repo that may serve updates — must match V2_MANIFEST_URL's repo. */
const V2_UPDATE_REPO = 'namct2610/ecom-dashboard';

/**
 * True only for https URLs serving this project's own release artifacts.
 *
 * Hosts are matched exactly (not by suffix) so a lookalike such as
 * "raw.githubusercontent.com.evil.tld" cannot slip through, and the path must
 * sit under the expected repo so another GitHub project cannot be used either.
 */
function update_url_is_trusted(string $url): bool
{
    $parts = parse_url($url);
    if (!is_array($parts)) return false;

    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    $host   = strtolower((string) ($parts['host'] ?? ''));
    $path   = (string) ($parts['path'] ?? '');

    if ($scheme !== 'https') return false;
    if (!in_array($host, ['raw.githubusercontent.com', 'github.com', 'codeload.github.com'], true)) {
        return false;
    }

    return str_starts_with($path, '/' . V2_UPDATE_REPO . '/');
}

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

        if ($cacheAge < V2_MANIFEST_CACHE_TTL && $cachedData !== '') {
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
        // Force-refresh: bypass BOTH caches (server-side DB cache + GitHub raw
        // CDN's 5-minute cache) by appending a cache-buster to the manifest URL.
        v2_update_set_setting($pdo, 'v2_update_last_check', '');
        v2_update_set_setting($pdo, 'v2_update_cached_data', '');

        $bustUrl = V2_MANIFEST_URL . (strpos(V2_MANIFEST_URL, '?') === false ? '?' : '&') . '_=' . time();
        try {
            $manifest = $updater->fetchManifest($bustUrl);
            v2_update_set_setting($pdo, 'v2_update_last_check', (string) time());
            v2_update_set_setting($pdo, 'v2_update_cached_data', json_encode($manifest) ?: '');
            $latestVer = $manifest['version'] ?? null;
            json_response([
                'success'      => true,
                'current'      => $updater->getCurrentVersion(),
                'latest'       => $latestVer,
                'has_update'   => $latestVer ? $updater->hasUpdate($latestVer) : false,
                'changelog'    => $manifest['changelog'] ?? null,
                'download_url' => $manifest['download_url'] ?? null,
                'released_at'  => $manifest['released_at'] ?? null,
                'min_php'      => $manifest['min_php'] ?? null,
                'last_checked' => date('d/m/Y H:i'),
            ]);
        } catch (\Throwable $e) {
            json_response(['success' => true, 'fetch_error' => $e->getMessage()]);
        }
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
        // The URL arrives in the request body, so without this check an admin
        // session could point the updater at any host and have its zip unpacked
        // over the app root — i.e. arbitrary code execution, plus an SSRF probe
        // primitive. Updates may only ever come from this project's own repo.
        if (!update_url_is_trusted($downloadUrl)) {
            json_error('download_url phải trỏ tới kho phát hành chính thức trên GitHub.', 400);
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
            'message' => "Đã cập nhật thành công lên v{$version}! Tải lại trang để áp dụng.",
        ]);
    }

    json_error('Unknown action.', 400);
} catch (\Throwable $e) {
    json_exception($e, 'Lỗi hệ thống cập nhật v2.');
}
