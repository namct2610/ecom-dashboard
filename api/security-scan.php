<?php

declare(strict_types=1);

/**
 * Housekeeping scanner: finds files that should not be sitting in a production
 * install — database dumps, editor backups, dev tooling, VCS metadata — and
 * lets an admin remove them.
 *
 * Two rules make this safe to expose:
 *
 *  1. PROTECTED names are never reported and never deleted, whatever else
 *     matches. They are the app itself plus the data the updater preserves.
 *  2. The delete action re-runs the classifier on every path it is given. The
 *     client's list is treated as a selection, never as authority — a caller
 *     asking to delete config.php is refused even though it exists.
 *
 * Why this exists: Updater::copyRecursive only ever copies. A file dropped from
 * the project stays on every server that has ever installed it, so old dumps
 * and dev folders accumulate where the web root can serve them.
 */

require dirname(__DIR__) . '/includes/bootstrap.php';

require_admin();

const SCAN_MAX_DEPTH = 5;
const SCAN_MAX_FINDINGS = 500;

/** Never reported, never deleted — the running app and the data it owns. */
function scan_protected_names(): array
{
    return [
        'config.php', 'config.local.php', '.installed', 'version.txt', 'manifest.json',
        'index.html', 'login.html', '.htaccess',
        'uploads', 'api', 'includes', 'assets', 'vendor',
    ];
}

/**
 * Classify one entry. Returns null when the entry is fine to keep.
 * risk: high (leaks data or credentials) | medium (exposes source) | low (clutter)
 */
function scan_classify(string $rel, string $name, bool $isDir, bool $installed): ?array
{
    $lower = strtolower($name);

    if ($isDir) {
        $dirs = [
            '.git'         => ['high',   'Toàn bộ mã nguồn và lịch sử thay đổi có thể bị tải về'],
            'node_modules' => ['low',    'Thư viện phát triển, không cần cho bản chạy'],
            '.github'      => ['low',    'Cấu hình CI, không cần cho bản chạy'],
            '.vscode'      => ['low',    'Cấu hình trình soạn thảo'],
            '.idea'        => ['low',    'Cấu hình trình soạn thảo'],
            'dev'          => ['medium', 'Công cụ và ghi chú nội bộ'],
            'others'       => ['medium', 'Dữ liệu mẫu và tài liệu nội bộ'],
            '__macosx'     => ['low',    'Rác do macOS tạo khi giải nén'],
            'release'      => ['medium', 'Chứa file nén toàn bộ mã nguồn các bản phát hành'],
        ];
        if (isset($dirs[$lower])) {
            return ['risk' => $dirs[$lower][0], 'reason' => $dirs[$lower][1]];
        }
        return null;
    }

    // Installer: harmless while .installed locks it, but it still exposes a
    // database-configuration form, so flag it once the app is set up.
    if ($lower === 'setup.php' && $installed) {
        return ['risk' => 'medium', 'reason' => 'Trình cài đặt không còn cần sau khi đã cài xong'];
    }

    if (preg_match('/\.(sql|dump|mwb)$/i', $name) || preg_match('/\.sql\.gz$/i', $name)) {
        return ['risk' => 'high', 'reason' => 'Bản sao lưu cơ sở dữ liệu — chứa toàn bộ dữ liệu kinh doanh'];
    }
    // .env.example / .env.sample ship placeholders on purpose — they are clutter,
    // not a leak. Only a real .env carries credentials.
    if (preg_match('/^\.env(\.(example|sample|template|dist))$/i', $name)) {
        return ['risk' => 'low', 'reason' => 'File cấu hình mẫu, không cần trên bản chạy'];
    }
    if ($lower === '.env' || str_starts_with($lower, '.env.')) {
        return ['risk' => 'high', 'reason' => 'Có thể chứa mật khẩu và khoá bí mật'];
    }
    if (preg_match('/(\.bak|\.backup|\.orig|\.save|\.old|~)$/i', $name)) {
        return ['risk' => 'high', 'reason' => 'Bản sao lưu mã nguồn — máy chủ trả về dạng văn bản thuần, lộ cấu hình'];
    }
    if (preg_match('/\.(zip|tar|tgz|rar|7z)$/i', $name) || preg_match('/\.tar\.gz$/i', $name)) {
        return ['risk' => 'medium', 'reason' => 'File nén có thể chứa mã nguồn hoặc dữ liệu'];
    }
    if (preg_match('/\.log$/i', $name)) {
        return ['risk' => 'medium', 'reason' => 'Nhật ký có thể chứa thông tin nội bộ'];
    }
    if (in_array($lower, ['.ds_store', 'thumbs.db', 'desktop.ini'], true)) {
        return ['risk' => 'low', 'reason' => 'Rác do hệ điều hành tạo'];
    }
    if (preg_match('/\.map$/i', $name)) {
        return ['risk' => 'low', 'reason' => 'Source map giúp dựng lại mã nguồn gốc'];
    }

    return null;
}

function scan_dir_size(string $path, int &$budget): int
{
    $total = 0;
    $items = @scandir($path);
    if (!is_array($items)) return 0;
    foreach ($items as $it) {
        if ($it === '.' || $it === '..' || $budget <= 0) continue;
        $budget--;
        $p = $path . DIRECTORY_SEPARATOR . $it;
        if (is_link($p)) continue;
        $total += is_dir($p) ? scan_dir_size($p, $budget) : (int) @filesize($p);
    }
    return $total;
}

function scan_walk(string $root, string $rel, int $depth, bool $installed, array &$out): void
{
    if ($depth > SCAN_MAX_DEPTH || count($out) >= SCAN_MAX_FINDINGS) return;

    $abs = $rel === '' ? $root : $root . DIRECTORY_SEPARATOR . $rel;
    $items = @scandir($abs);
    if (!is_array($items)) return;

    $protected = array_map('strtolower', scan_protected_names());

    foreach ($items as $name) {
        if ($name === '.' || $name === '..') continue;
        if (count($out) >= SCAN_MAX_FINDINGS) return;

        $childRel = $rel === '' ? $name : $rel . '/' . $name;
        $childAbs = $root . DIRECTORY_SEPARATOR . $childRel;

        // Protection applies at the top level, where the app's own folders live.
        if ($rel === '' && in_array(strtolower($name), $protected, true)) continue;
        if (is_link($childAbs)) continue;

        $isDir = is_dir($childAbs);
        $hit = scan_classify($childRel, $name, $isDir, $installed);

        if ($hit !== null) {
            $budget = 4000;
            $out[] = [
                'path'   => $childRel,
                'is_dir' => $isDir,
                'size'   => $isDir ? scan_dir_size($childAbs, $budget) : (int) @filesize($childAbs),
                'risk'   => $hit['risk'],
                'reason' => $hit['reason'],
            ];
            continue; // a flagged directory is reported whole; don't descend into it
        }

        if ($isDir) scan_walk($root, $childRel, $depth + 1, $installed, $out);
    }
}

/**
 * Resolve a client-supplied relative path and confirm it is still something the
 * classifier flags. Returns the absolute path, or null when it must be refused.
 */
function scan_resolve_deletable(string $root, string $rel, bool $installed): ?string
{
    $rel = trim(str_replace('\\', '/', $rel), '/');
    if ($rel === '' || str_contains($rel, "\0")) return null;

    // Reject traversal before touching the filesystem.
    foreach (explode('/', $rel) as $seg) {
        if ($seg === '' || $seg === '.' || $seg === '..') return null;
    }

    $realRoot = realpath($root);
    $real = realpath($root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel));
    if ($real === false || $realRoot === false) return null;
    // Must stay inside the app root even after symlink resolution.
    if (!str_starts_with($real, $realRoot . DIRECTORY_SEPARATOR)) return null;

    $parts = explode('/', $rel);
    if (in_array(strtolower($parts[0]), array_map('strtolower', scan_protected_names()), true)) return null;

    // The decisive check: the client's selection is only honoured if this path
    // is something the scanner itself would have offered.
    if (scan_classify($rel, basename($rel), is_dir($real), $installed) === null) return null;

    return $real;
}

function scan_rm(string $path): bool
{
    if (is_link($path) || is_file($path)) return @unlink($path);
    if (!is_dir($path)) return false;
    foreach (array_diff((array) @scandir($path), ['.', '..']) as $item) {
        if (!scan_rm($path . DIRECTORY_SEPARATOR . $item)) return false;
    }
    return @rmdir($path);
}

try {
    $root = dirname(__DIR__);
    $installed = file_exists($root . '/.installed');

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $findings = [];
        scan_walk($root, '', 0, $installed, $findings);
        $order = ['high' => 0, 'medium' => 1, 'low' => 2];
        usort($findings, static function (array $a, array $b) use ($order): int {
            return [$order[$a['risk']], -$a['size']] <=> [$order[$b['risk']], -$b['size']];
        });
        json_response([
            'success'   => true,
            'findings'  => $findings,
            'total'     => count($findings),
            'bytes'     => array_sum(array_column($findings, 'size')),
            'truncated' => count($findings) >= SCAN_MAX_FINDINGS,
        ]);
    }

    require_method('POST');
    require_csrf();

    $body  = (array) json_decode((string) file_get_contents('php://input'), true);
    $paths = $body['paths'] ?? null;
    if (!is_array($paths) || !$paths) json_error('Chưa chọn mục nào để xoá.', 422);
    if (count($paths) > SCAN_MAX_FINDINGS) json_error('Chọn quá nhiều mục trong một lần.', 422);

    $deleted = [];
    $refused = [];
    $freed   = 0;

    foreach ($paths as $p) {
        $rel = (string) $p;
        $abs = scan_resolve_deletable($root, $rel, $installed);
        if ($abs === null) { $refused[] = $rel; continue; }
        $budget = 4000;
        $size = is_dir($abs) ? scan_dir_size($abs, $budget) : (int) @filesize($abs);
        if (scan_rm($abs)) { $deleted[] = $rel; $freed += $size; }
        else { $refused[] = $rel; }
    }

    log_activity('warn', 'system', 'Dọn file không cần thiết trên máy chủ', [
        'deleted' => $deleted,
        'refused' => $refused,
    ]);

    json_response([
        'success' => true,
        'deleted' => $deleted,
        'refused' => $refused,
        'bytes'   => $freed,
    ]);
} catch (\Throwable $e) {
    json_exception($e, 'Lỗi khi quét file trên máy chủ.');
}
