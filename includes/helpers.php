<?php

declare(strict_types=1);

// ── Auth ────────────────────────────────────────────────────────────────────

function start_session(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'lifetime' => 86400 * 7,
            'path'     => '/',
            'secure'   => isset($_SERVER['HTTPS']),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function session_user_payload(): ?array
{
    if (empty($_SESSION['logged_in']) || empty($_SESSION['username'])) {
        return null;
    }

    return [
        'id'        => isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null,
        'username'  => (string) ($_SESSION['username'] ?? ''),
        'full_name' => (string) ($_SESSION['full_name'] ?? ''),
        'role'      => (string) ($_SESSION['role'] ?? 'staff'),
    ];
}

function store_user_session(array $user, bool $regenerate = true): void
{
    start_session();

    if ($regenerate) {
        session_regenerate_id(true);
    }

    $_SESSION['logged_in'] = true;
    $_SESSION['user_id']   = isset($user['id']) ? (int) $user['id'] : null;
    $_SESSION['username']  = (string) ($user['username'] ?? '');
    $_SESSION['full_name'] = (string) ($user['full_name'] ?? '');
    $_SESSION['role']      = (string) ($user['role'] ?? 'staff');
    $_SESSION['csrf_token'] ??= bin2hex(random_bytes(32));
}

function clear_auth_session(): void
{
    start_session();

    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, [
            'path'     => $params['path'] ?? '/',
            'domain'   => $params['domain'] ?? '',
            'secure'   => (bool) ($params['secure'] ?? false),
            'httponly' => (bool) ($params['httponly'] ?? true),
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }

    session_destroy();
}

function current_user(): ?array
{
    start_session();

    $sessionUser = session_user_payload();
    if ($sessionUser === null) {
        return null;
    }

    if (!function_exists('db')) {
        return $sessionUser;
    }

    global $config;
    if (!isset($config) || !is_array($config)) {
        return $sessionUser;
    }

    try {
        $pdo  = db($config);
        $stmt = $pdo->prepare("
            SELECT id, username, COALESCE(full_name, '') AS full_name, role, is_active
            FROM users
            WHERE username = ?
            LIMIT 1
        ");
        $stmt->execute([$sessionUser['username']]);
        $user = $stmt->fetch();

        if (is_array($user)) {
            if ((int) ($user['is_active'] ?? 0) !== 1) {
                clear_auth_session();
                return null;
            }

            store_user_session($user, false);
            return session_user_payload();
        }

        clear_auth_session();
        return null;
    } catch (\Throwable $e) {
        // Fall back to session data if user refresh fails temporarily.
    }

    if (($sessionUser['role'] ?? '') === '') {
        $legacyUser = (string) ($config['auth']['username'] ?? 'admin');
        if ($sessionUser['username'] === $legacyUser) {
            $_SESSION['role'] = 'admin';
        }
    }

    return session_user_payload();
}

function require_auth(): void
{
    if (current_user() === null) {
        json_error('Unauthenticated.', 401);
    }
}

function require_admin(): void
{
    $user = current_user();
    if ($user === null) {
        json_error('Unauthenticated.', 401);
    }
    if (($user['role'] ?? '') !== 'admin') {
        json_error('Forbidden.', 403);
    }
}

function require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== strtoupper($method)) {
        json_error('Method not allowed.', 405);
    }
}

function require_csrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['_csrf'] ?? '');
    if (!$token || $token !== ($_SESSION['csrf_token'] ?? '')) {
        json_error('Invalid CSRF token.', 403);
    }
}

function generate_csrf(): string
{
    start_session();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function is_local(): bool
{
    return in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
}

// ── JSON responses ──────────────────────────────────────────────────────────

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $message, int $status = 400, array $extra = []): void
{
    json_response(array_merge(['success' => false, 'error' => $message], $extra), $status);
}

function json_exception(\Throwable $e, string $fallback = 'Server error.'): void
{
    $msg = is_local() ? $e->getMessage() : $fallback;
    log_activity('error', 'api', $e->getMessage(), [
        'exception' => get_class($e),
        'file'      => $e->getFile() . ':' . $e->getLine(),
        'trace'     => array_slice(explode("\n", $e->getTraceAsString()), 0, 8),
    ]);
    json_error($msg, 500, is_local() ? ['trace' => array_slice(explode("\n", $e->getTraceAsString()), 0, 5)] : []);
}

// ── Time filter & granularity ───────────────────────────────────────────────

/**
 * Build WHERE clause and params array from $_GET filter params.
 * Supports:
 *   date_from + date_to  → YYYY-MM-DD range (highest priority)
 *   mode=(month|year) + period=YYYY-MM or YYYY
 *   platform=shopee|lazada|tiktokshop|all
 */
function request_date_range(): ?array
{
    $dateFrom = trim((string) ($_GET['date_from'] ?? ''));
    $dateTo   = trim((string) ($_GET['date_to'] ?? ''));

    if ($dateFrom === '' || $dateTo === '') {
        return null;
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
        return null;
    }
    if ($dateFrom > $dateTo) {
        [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
    }

    return [$dateFrom, $dateTo];
}

function sql_filters(array &$params, string $dateCol = 'order_created_at', bool $includeAllStatuses = false): string
{
    $conditions = $includeAllStatuses
        ? ['1=1']
        : ['normalized_status IN (\'completed\',\'delivered\',\'cancelled\',\'pending\')'];

    $mode     = $_GET['mode']      ?? 'month';
    $period   = $_GET['period']    ?? '';
    $platform = $_GET['platform']  ?? 'all';
    $dateRange = request_date_range();

    // Date range takes priority over mode/period
    if ($dateRange !== null) {
        [$dateFrom, $dateTo] = $dateRange;
        $conditions[] = "DATE($dateCol) BETWEEN :date_from AND :date_to";
        $params[':date_from'] = $dateFrom;
        $params[':date_to']   = $dateTo;
    } elseif ($period !== '') {
        if ($mode === 'year' && preg_match('/^\d{4}$/', $period)) {
            $conditions[] = "YEAR($dateCol) = :year";
            $params[':year'] = (int) $period;
        } elseif ($mode === 'month' && preg_match('/^\d{4}-\d{2}$/', $period)) {
            $conditions[] = "DATE_FORMAT($dateCol, '%Y-%m') = :month";
            $params[':month'] = $period;
        }
    }

    if ($platform !== 'all' && in_array($platform, ['shopee', 'lazada', 'tiktokshop'], true)) {
        $conditions[] = "platform = :platform";
        $params[':platform'] = $platform;
    }

    return 'WHERE ' . implode(' AND ', $conditions);
}

function sql_filters_traffic(array &$params): string
{
    $conditions = ['1=1'];

    $mode     = $_GET['mode']      ?? 'month';
    $period   = $_GET['period']    ?? '';
    $platform = $_GET['platform']  ?? 'all';
    $dateRange = request_date_range();

    if ($dateRange !== null) {
        [$dateFrom, $dateTo] = $dateRange;
        $conditions[] = "traffic_date BETWEEN :date_from AND :date_to";
        $params[':date_from'] = $dateFrom;
        $params[':date_to']   = $dateTo;
    } elseif ($period !== '') {
        if ($mode === 'year' && preg_match('/^\d{4}$/', $period)) {
            $conditions[] = 'YEAR(traffic_date) = :year';
            $params[':year'] = (int) $period;
        } elseif ($mode === 'month' && preg_match('/^\d{4}-\d{2}$/', $period)) {
            $conditions[] = "DATE_FORMAT(traffic_date, '%Y-%m') = :month";
            $params[':month'] = $period;
        }
    }

    if ($platform !== 'all' && in_array($platform, ['shopee', 'lazada', 'tiktokshop'], true)) {
        $conditions[] = 'platform = :platform';
        $params[':platform'] = $platform;
    }

    $conditions[] = "device_type = 'all'";

    return 'WHERE ' . implode(' AND ', $conditions);
}

/**
 * Resolve SQL granularity.
 * date_from/date_to → always daily buckets
 * mode=year         → monthly buckets
 * mode=month        → daily buckets
 */
function resolve_granularity(string $dateCol = 'order_created_at'): array
{
    $mode     = $_GET['mode']      ?? 'month';

    if (request_date_range() !== null || $mode !== 'year') {
        return [
            'name'   => 'day',
            'label'  => "DATE_FORMAT($dateCol, '%Y-%m-%d')",
            'bucket' => "DATE($dateCol)",
        ];
    }
    return [
        'name'   => 'month',
        'label'  => "DATE_FORMAT($dateCol, '%Y-%m')",
        'bucket' => "DATE_FORMAT($dateCol, '%Y-%m')",
    ];
}

function resolve_granularity_traffic(): array
{
    $mode     = $_GET['mode']      ?? 'month';

    if (request_date_range() !== null || $mode !== 'year') {
        return [
            'name'   => 'day',
            'label'  => "DATE_FORMAT(traffic_date, '%Y-%m-%d')",
            'bucket' => 'traffic_date',
        ];
    }
    return [
        'name'   => 'month',
        'label'  => "DATE_FORMAT(traffic_date, '%Y-%m')",
        'bucket' => "DATE_FORMAT(traffic_date, '%Y-%m')",
    ];
}

// ── Data parsing helpers ────────────────────────────────────────────────────

function parse_amount(?string $value): float
{
    if ($value === null || $value === '') {
        return 0.0;
    }
    // Remove thousand separators (periods in VN format or commas in EN)
    // Keep minus sign and the decimal separator
    $cleaned = preg_replace('/[^\d\.\-]/', '', str_replace(',', '', $value));
    return (float) ($cleaned ?: 0);
}

function parse_datetime_value(?string $value, array $formats = []): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $value = trim($value);

    $defaultFormats = [
        'Y-m-d H:i:s',
        'Y-m-d H:i',
        'Y-m-d',
        'd/m/Y H:i:s',
        'd/m/Y H:i',
        'd/m/Y',
        'd-m-Y H:i:s',
        'd-m-Y H:i',
        'd-m-Y',
        'd M Y H:i',
        'd M Y',
        'n/j/Y H:i',
    ];

    foreach (array_merge($formats, $defaultFormats) as $fmt) {
        $dt = \DateTime::createFromFormat($fmt, $value);
        if ($dt !== false) {
            return $dt->format('Y-m-d H:i:s');
        }
    }
    return null;
}

function parse_date_value(?string $value): ?string
{
    $dt = parse_datetime_value($value);
    return $dt ? substr($dt, 0, 10) : null;
}

/**
 * Parse a number that may use VN/European locale formatting:
 *   30.349   → 30349   (dot = thousands separator)
 *   7,42     → 7.42    (comma = decimal separator)
 *   13,54%   → 13.54
 * Also handles standard EN format: 1,234.56 → 1234.56
 */
/**
 * Parse a number that may use VN/European locale formatting:
 *   30.349   → 30349   (dot = thousands separator, 3-digit groups)
 *   1.034,56 → 1034.56 (dot = thousands, comma = decimal)
 *   7,42     → 7.42    (comma = decimal, ≤2 decimal digits)
 *   13,54%   → 13.54
 *   1244000.00 → 1244000.00 (standard EN format)
 */
function parse_traffic_number(?string $value): float
{
    if ($value === null || $value === '') return 0.0;
    $v = trim((string) $value);
    $v = str_replace(['%', "\xc2\xa0", ' '], '', $v); // strip %, NBSP, spaces
    if ($v === '' || $v === '-' || $v === '--') return 0.0;

    // Pattern 1: VN thousands with optional comma-decimal  e.g. 30.349 or 1.034,56
    if (preg_match('/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/', $v)) {
        $v = str_replace('.', '', $v);
        $v = str_replace(',', '.', $v);
        return (float) $v;
    }
    // Pattern 2: Comma as decimal separator, no dot  e.g. 7,42 or 13,54
    if (preg_match('/^\d+,\d{1,2}$/', $v)) {
        return (float) str_replace(',', '.', $v);
    }
    // Pattern 3: Standard EN or plain integer  e.g. 1,234.56 or 322 or 0.00
    $v = str_replace(',', '', $v);
    return (float) preg_replace('/[^\d.\-]/', '', $v) ?: 0.0;
}

function parse_bounce_rate(?string $value): float
{
    return parse_traffic_number($value);
}

function parse_duration(?string $value): int
{
    // format "HH:MM:SS" or "MM:SS"
    if (!$value) return 0;
    $parts = explode(':', $value);
    if (count($parts) === 3) {
        return (int)$parts[0] * 3600 + (int)$parts[1] * 60 + (int)$parts[2];
    }
    if (count($parts) === 2) {
        return (int)$parts[0] * 60 + (int)$parts[1];
    }
    return 0;
}

// ── City normalization ──────────────────────────────────────────────────────

function normalize_city(?string $city): ?string
{
    if (!$city) return null;
    $city = trim($city);
    // Remove prefixes
    $city = preg_replace('/^(Tỉnh|TP\.|Thành phố)\s+/u', '', $city);
    // Normalize common names
    $map = [
        'Hồ Chí Minh' => 'TP. Hồ Chí Minh',
        'Ho Chi Minh'  => 'TP. Hồ Chí Minh',
        'HCM'          => 'TP. Hồ Chí Minh',
        'Hà Nội'       => 'Hà Nội',
        'Ha Noi'       => 'Hà Nội',
        'Đà Nẵng'      => 'Đà Nẵng',
        'Da Nang'      => 'Đà Nẵng',
    ];
    return $map[$city] ?? $city;
}

// ── Upload helpers ──────────────────────────────────────────────────────────

function ensure_upload_dir(array $config): void
{
    $path = $config['app']['upload_path'];
    if (!is_dir($path)) {
        mkdir($path, 0755, true);
    }
    // Write .htaccess to block direct access
    $htaccess = $path . '/.htaccess';
    if (!file_exists($htaccess)) {
        file_put_contents($htaccess, "Order deny,allow\nDeny from all\n");
    }
}
