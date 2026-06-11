<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

function find_user_by_username(PDO $pdo, string $username): ?array
{
    $stmt = $pdo->prepare("
        SELECT id, username, COALESCE(full_name, '') AS full_name, COALESCE(avatar_path, '') AS avatar_path,
               password_hash, must_change_password, role, is_active
        FROM users
        WHERE username = ?
        LIMIT 1
    ");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    return is_array($user) ? $user : null;
}


// ── Rate limiting ──────────────────────────────────────────────────────────
// DB-based: no Redis required. Cleans up stale records automatically.
function login_rate_limit_check(PDO $pdo, string $ip): void
{
    $window  = 900;  // 15 minutes
    $maxTries = 10;  // attempts before lockout

    // Create table on first use — no migration needed.
    $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (
        ip         VARCHAR(45) NOT NULL,
        attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ip_time (ip, attempted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Count recent failures for this IP.
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM login_attempts
        WHERE ip = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
    ");
    $stmt->execute([$ip, $window]);
    $count = (int) $stmt->fetchColumn();

    if ($count >= $maxTries) {
        json_error("Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.", 429);
    }
}

function login_rate_limit_record(PDO $pdo, string $ip): void
{
    $pdo->prepare("INSERT INTO login_attempts (ip) VALUES (?)")->execute([$ip]);
    // Purge old records (> 1 hour) to keep table small.
    $pdo->prepare("DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)")->execute();
}

function login_rate_limit_clear(PDO $pdo, string $ip): void
{
    $pdo->prepare("DELETE FROM login_attempts WHERE ip = ?")->execute([$ip]);
}

// ─────────────────────────────────────────────────────────────────────────────

start_session();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $authEnabled = auth_is_enabled();
    $user = current_user();

    if ($authEnabled) {
        // When auth is enabled, return actual session state.
        // Frontend login page uses this to check if already authenticated.
        $loggedIn = $user !== null;
    } else {
        // Auth disabled (open access): report synthetic admin so cached
        // older frontend JS that checks logged_in doesn't misbehave.
        if ($user === null) {
            $user = ['username' => 'guest', 'role' => 'admin', 'full_name' => 'Guest'];
        }
        $loggedIn = true;
    }

    json_response([
        'logged_in'    => $loggedIn,
        'auth_enabled' => $authEnabled,
        'user'         => $loggedIn ? $user : null,
        'username'     => $loggedIn ? ($user['username'] ?? '') : null,
        'role'         => $loggedIn ? ($user['role'] ?? '') : null,
        'csrf'         => generate_csrf(),
    ]);
}

if ($method === 'POST') {
    $body = (array) json_decode(file_get_contents('php://input'), true);
    $action = $body['action'] ?? ($_POST['action'] ?? '');

    if ($action === 'logout') {
        $loggedUser = $_SESSION['username'] ?? 'unknown';
        clear_auth_session();
        log_activity('info', 'auth', "Đăng xuất: {$loggedUser}");
        json_response(['success' => true]);
    }

    // Login
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');

    if (!$username || !$password) {
        json_error('Vui lòng nhập tên đăng nhập và mật khẩu.', 422);
    }

    $pdo    = db($config);
    $ip     = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

    login_rate_limit_check($pdo, $ip);

    $user  = find_user_by_username($pdo, $username);
    $valid = is_array($user)
        && (int) ($user['is_active'] ?? 0) === 1
        && password_verify($password, (string) ($user['password_hash'] ?? ''));

    if (!$valid) {
        login_rate_limit_record($pdo, $ip);
        log_activity('warning', 'auth', "Đăng nhập thất bại: {$username}", [
            'ip' => $ip,
        ]);
        json_error('Tên đăng nhập hoặc mật khẩu không đúng.', 401);
    }

    // On success, clear the failure counter for this IP.
    login_rate_limit_clear($pdo, $ip);

    $pdo->prepare("UPDATE users SET last_login_at = NOW() WHERE id = ?")->execute([(int) $user['id']]);
    store_user_session($user, true);

    log_activity('info', 'auth', "Đăng nhập thành công: {$username}");

    json_response([
        'success'  => true,
        'user'     => [
            'id'        => (int) $user['id'],
            'username'  => (string) $user['username'],
            'full_name' => (string) ($user['full_name'] ?? ''),
            'avatar_path' => (string) ($user['avatar_path'] ?? ''),
            'must_change_password' => (int) ($user['must_change_password'] ?? 0) === 1,
            'role'      => (string) ($user['role'] ?? 'staff'),
        ],
        'username' => $username,
        'role'     => (string) ($user['role'] ?? 'staff'),
        'csrf'     => $_SESSION['csrf_token'],
    ]);
}

json_error('Method not allowed.', 405);
