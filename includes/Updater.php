<?php

declare(strict_types=1);

namespace Dashboard;

/**
 * Self-update engine for Dashboard v3.
 *
 * Flow:
 *   1. User configures a Manifest URL (JSON file hosted anywhere).
 *   2. App fetches manifest periodically (cached 6 h in app_settings).
 *   3. If manifest.version > current version → show badge + card in Settings.
 *   4. User clicks "Cập nhật ngay" → applyUpdate() downloads zip, swaps files,
 *      restores preserved paths, writes new version.txt.
 *
 * Manifest format:
 *   {
 *     "version":      "1.1.0",
 *     "download_url": "https://example.com/dashboard-v3-1.1.0.zip",
 *     "changelog":    "- Sửa lỗi X\n- Thêm tính năng Y",
 *     "min_php":      "8.1",
 *     "released_at":  "2024-06-01"
 *   }
 */
class Updater
{
    private string $appRoot;
    private string $versionFile;

    public function __construct(string $appRoot)
    {
        $this->appRoot     = rtrim($appRoot, '/\\');
        $this->versionFile = $this->appRoot . '/version.txt';
    }

    // ── Version ───────────────────────────────────────────────────────────────

    public function getCurrentVersion(): string
    {
        if (!file_exists($this->versionFile)) return '0.0.0';
        return trim((string) file_get_contents($this->versionFile));
    }

    public function hasUpdate(string $latestVersion): bool
    {
        return version_compare($latestVersion, $this->getCurrentVersion(), '>');
    }

    // ── Manifest ──────────────────────────────────────────────────────────────

    /**
     * Fetch and validate the update manifest JSON from the given URL.
     *
     * @return array{version:string,download_url:string,changelog?:string,min_php?:string,released_at?:string}
     * @throws \RuntimeException on network error or invalid manifest
     */
    public function fetchManifest(string $manifestUrl): array
    {
        $response = $this->httpGet($manifestUrl, 15);
        $data     = json_decode($response, true);

        if (!is_array($data)) {
            $preview = substr(trim($response), 0, 120);
            throw new \RuntimeException("Manifest không phải JSON hợp lệ. Kiểm tra URL có phải raw URL không. Nhận được: " . $preview);
        }
        if (empty($data['version']) || empty($data['download_url'])) {
            throw new \RuntimeException('Manifest thiếu trường "version" hoặc "download_url".');
        }

        return $data;
    }

    // ── Apply update ──────────────────────────────────────────────────────────

    /**
     * Download zip from $downloadUrl, extract it, and replace app files.
     * Preserved paths (never overwritten): config.php, uploads/, .installed
     *
     * @throws \RuntimeException on any failure — caller should log and bubble up.
     */
    public function applyUpdate(string $downloadUrl, string $version): void
    {
        if (!class_exists(\ZipArchive::class)) {
            throw new \RuntimeException('PHP extension "zip" chưa được cài. Cần bật extension=zip.');
        }

        $tmpBase = $this->writableTemp();
        $tmpZip  = $tmpBase . '/dashboard_upd_' . time() . '.zip';
        $tmpDir  = $tmpBase . '/dashboard_upd_' . time() . '_x';

        try {
            // 1. Download
            $this->downloadFile($downloadUrl, $tmpZip);

            // 2. Verify zip opens
            $zip = new \ZipArchive();
            if ($zip->open($tmpZip) !== true) {
                throw new \RuntimeException('File ZIP tải về bị lỗi hoặc không đọc được.');
            }
            $zip->extractTo($tmpDir);
            $zip->close();

            // 3. Find content root (zip may wrap files in one top-level folder)
            $srcRoot = $this->findContentRoot($tmpDir);

            // 4. Back up config.php (safety net — also in preserved list)
            $configSrc = $this->appRoot . '/config.php';
            $configBak = $this->appRoot . '/config.php.update_bak';
            if (file_exists($configSrc)) {
                copy($configSrc, $configBak);
            }

            // 5. Copy new files, skipping preserved paths at root level
            $this->copyRecursive($srcRoot, $this->appRoot, $this->preservedPaths());

            // 6. Restore config.php unconditionally (in case zip contained one)
            if (file_exists($configBak)) {
                copy($configBak, $configSrc);
                @unlink($configBak);
            }

            // 7. Stamp new version
            file_put_contents($this->versionFile, $version . "\n");

        } finally {
            if (file_exists($tmpZip)) @unlink($tmpZip);
            if (is_dir($tmpDir))     $this->removeDir($tmpDir);
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Paths at app root that are NEVER replaced during an update. */
    private function preservedPaths(): array
    {
        return ['config.php', 'uploads', '.installed', 'config.local.php'];
    }

    /**
     * Recursively copy $src into $dest.
     * $skipNames: basenames to skip (only enforced at the top level call).
     */
    private function copyRecursive(string $src, string $dest, array $skipNames): void
    {
        $items = array_diff((array) scandir($src), ['.', '..']);
        foreach ($items as $item) {
            if (in_array($item, $skipNames, true)) continue;

            $srcPath  = $src  . '/' . $item;
            $destPath = $dest . '/' . $item;

            if (is_dir($srcPath)) {
                if (!is_dir($destPath)) mkdir($destPath, 0755, true);
                $this->copyRecursive($srcPath, $destPath, []);
            } else {
                copy($srcPath, $destPath);
            }
        }
    }

    /**
     * If extracted dir has exactly one sub-directory (common zip layout),
     * return that sub-directory as the real content root.
     */
    private function findContentRoot(string $extractedDir): string
    {
        $items = array_values(array_diff((array) scandir($extractedDir), ['.', '..']));
        if (count($items) === 1 && is_dir($extractedDir . '/' . $items[0])) {
            return $extractedDir . '/' . $items[0];
        }
        return $extractedDir;
    }

    /** Best writable temp dir on shared hosting. */
    private function writableTemp(): string
    {
        $sysTmp = sys_get_temp_dir();
        if (is_writable($sysTmp)) return $sysTmp;

        $uploadsDir = $this->appRoot . '/uploads';
        if (is_writable($uploadsDir)) return $uploadsDir;

        throw new \RuntimeException('Không có thư mục tạm có quyền ghi. Kiểm tra quyền uploads/ hoặc sys_get_temp_dir().');
    }

    /** Stream-download a URL to a local file path. */
    private function downloadFile(string $url, string $dest): void
    {
        $fp = @fopen($dest, 'wb');
        if (!$fp) {
            throw new \RuntimeException("Không thể tạo file tạm: $dest");
        }

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_FILE           => $fp,
            CURLOPT_TIMEOUT        => 120,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT      => 'DashboardV3-Updater/1.0',
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
        ]);
        $ok       = curl_exec($ch);
        $errno    = curl_errno($ch);
        $error    = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        fclose($fp);

        if (!$ok || $errno) {
            @unlink($dest);
            throw new \RuntimeException("Tải file thất bại ($errno): $error");
        }
        if ($httpCode !== 200) {
            @unlink($dest);
            throw new \RuntimeException("HTTP $httpCode khi tải bản cập nhật.");
        }
    }

    /** Fetch a URL and return response body as string. */
    private function httpGet(string $url, int $timeout = 15): string
    {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT      => 'DashboardV3-Updater/1.0',
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
        ]);
        $response = curl_exec($ch);
        $errno    = curl_errno($ch);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($errno) {
            throw new \RuntimeException("Không thể tải manifest: $error");
        }

        return (string) $response;
    }

    private function removeDir(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (array_diff((array) scandir($dir), ['.', '..']) as $item) {
            $path = $dir . '/' . $item;
            is_dir($path) ? $this->removeDir($path) : @unlink($path);
        }
        @rmdir($dir);
    }
}
