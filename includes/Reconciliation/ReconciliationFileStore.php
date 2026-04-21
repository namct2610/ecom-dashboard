<?php

declare(strict_types=1);

namespace Dashboard\Reconciliation;

use InvalidArgumentException;
use RuntimeException;

final class ReconciliationFileStore
{
    public const SOURCE_KEYS = ['gbs'];

    private string $storageDir;

    public function __construct(string $baseDir, array $config = [])
    {
        $uploadPath = (string) ($config['app']['upload_path'] ?? ($baseDir . DIRECTORY_SEPARATOR . 'uploads'));
        $this->storageDir = rtrim($uploadPath, '/\\') . DIRECTORY_SEPARATOR . 'reconciliation';
    }

    public static function isValidSourceKey(string $sourceKey): bool
    {
        return in_array($sourceKey, self::SOURCE_KEYS, true);
    }

    public function ensureDirectory(): void
    {
        \ensure_protected_dir($this->storageDir);
    }

    public function listFiles(): array
    {
        return [
            'gbs' => $this->findFile('gbs'),
        ];
    }

    public function listGbsFiles(): array
    {
        $files = [];
        foreach (array_keys($this->discoverCandidates('gbs')) as $path) {
            $files[] = $this->buildMeta('gbs', $path);
        }

        usort($files, static fn(array $left, array $right): int =>
            strcmp((string) ($right['modified_at'] ?? ''), (string) ($left['modified_at'] ?? ''))
        );

        return $files;
    }

    public function findFile(string $sourceKey): array
    {
        $this->assertSourceKey($sourceKey);

        $candidates = $this->discoverCandidates($sourceKey);
        if ($candidates === []) {
            return [
                'status'     => 'missing',
                'source_key' => $sourceKey,
                'source'     => 'managed_upload',
                'deletable'  => true,
            ];
        }

        arsort($candidates);
        $path = (string) array_key_first($candidates);

        return $this->buildMeta($sourceKey, $path);
    }

    public function storeUploadedFile(string $sourceKey, array $file): array
    {
        $this->assertSourceKey($sourceKey);
        $this->ensureDirectory();

        $tmpPath = (string) ($file['tmp_name'] ?? '');
        $originalName = trim((string) ($file['name'] ?? ''));
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            throw new RuntimeException('File upload không hợp lệ.');
        }
        if ($originalName === '') {
            throw new RuntimeException('Thiếu tên file gốc.');
        }

        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!in_array($ext, ['xlsx', 'xls'], true)) {
            throw new RuntimeException('Chỉ chấp nhận file .xlsx hoặc .xls.');
        }

        $storedFilename = $this->buildStoredFilename($sourceKey, $originalName, $ext);
        $destPath = $this->storageDir . DIRECTORY_SEPARATOR . $storedFilename;

        if (!move_uploaded_file($tmpPath, $destPath)) {
            throw new RuntimeException('Không thể lưu file đối soát lên server.');
        }

        return $this->buildMeta($sourceKey, $destPath);
    }

    public function deleteFile(string $sourceKeyOrFilename): bool
    {
        if (self::isValidSourceKey($sourceKeyOrFilename)) {
            $deleted = false;
            foreach (array_keys($this->discoverCandidates($sourceKeyOrFilename)) as $path) {
                if (is_file($path) && @unlink($path)) {
                    $deleted = true;
                }
            }

            return $deleted;
        }

        $path = $this->resolveManagedFilePath($sourceKeyOrFilename);
        return is_file($path) ? (bool) @unlink($path) : false;
    }

    private function assertSourceKey(string $sourceKey): void
    {
        if (!self::isValidSourceKey($sourceKey)) {
            throw new InvalidArgumentException('Loại file đối soát không hợp lệ.');
        }
    }

    private function discoverCandidates(string $sourceKey): array
    {
        $pattern = $this->storageDir . DIRECTORY_SEPARATOR . $sourceKey . '_*';
        $candidates = [];

        foreach (glob($pattern) ?: [] as $path) {
            if (is_file($path)) {
                $candidates[$path] = filemtime($path) ?: 0;
            }
        }

        return $candidates;
    }

    private function buildStoredFilename(string $sourceKey, string $originalName, string $ext): string
    {
        $baseName = pathinfo($originalName, PATHINFO_FILENAME);
        $safeBase = preg_replace('/[^A-Za-z0-9._-]+/', '-', $baseName) ?? $sourceKey;
        $safeBase = trim($safeBase, '-_.');
        if ($safeBase === '') {
            $safeBase = $sourceKey;
        }

        $safeBase = substr($safeBase, 0, 80);

        return sprintf(
            '%s_%s_%s_%s.%s',
            $sourceKey,
            date('Ymd_His'),
            bin2hex(random_bytes(3)),
            $safeBase,
            $ext
        );
    }

    private function buildMeta(string $sourceKey, string $path): array
    {
        $modifiedAt = filemtime($path) ?: time();
        $sizeBytes = filesize($path) ?: 0;

        return [
            'status'       => 'ready',
            'source_key'   => $sourceKey,
            'source'       => 'managed_upload',
            'source_label' => 'Kho đối soát',
            'deletable'    => true,
            'path'         => $path,
            'filename'     => basename($path),
            'size_bytes'   => $sizeBytes,
            'modified_at'  => date('Y-m-d H:i:s', $modifiedAt),
            'size_label'   => $this->formatBytes($sizeBytes),
        ];
    }

    private function resolveManagedFilePath(string $filename): string
    {
        $safeName = basename($filename);
        if ($safeName === '' || !str_starts_with($safeName, 'gbs_')) {
            throw new InvalidArgumentException('Tên file đối soát không hợp lệ.');
        }

        return $this->storageDir . DIRECTORY_SEPARATOR . $safeName;
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes < 1024) {
            return $bytes . ' B';
        }
        if ($bytes < 1024 * 1024) {
            return number_format($bytes / 1024, 1) . ' KB';
        }

        return number_format($bytes / (1024 * 1024), 1) . ' MB';
    }
}
