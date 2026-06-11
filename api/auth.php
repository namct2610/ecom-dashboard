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

function sync_legacy_config_user(PDO $pdo, array $config, string $username, string $password): ?array
{
    $legacyUsername = trim((string) ($config['auth']['username'] ?? ''));
    $legacyPassword = (string) ($config['auth']['password'] ?? '');

    if ($legacyUsername === '' || $legacyPassword === '') {
        return null;
    }

    if ($username !== $legacyUsername || !hash_equals($legacyPassword, $password)) {
        return null;
    }

    $user = find_user_by_username($pdo, $username);
    if ($user !== null && (int) ($user['is_active'] ?? 0) !== 1) {
        return null;
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);

    if ($user === null) {
        $stmt = $pdo->prepare("
            INSERT INTO users (username, full_name, password_hash, must_change_password, role, is_active)
            VALUES (?, ?, ?, 0, 'admin', 1)
        ");
        $stmt->execute([$username, 'Administrator', $passwordHash]);
    } else {
        $stmt = $pdo->prepare("
            UPDATE users
            SET password_hash = ?, updated_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([$passwordHash, (int) $user['id']]);
    }

    return find_user_by_username($pdo, $username);
}

start_session();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    // Auth is disabled app-wide (require_auth() is a no-op). Report a
    // synthetic admin user so any cached older frontend JS that checks
    // `logged_in` doesn't redirect to /old/index.php?legacy=1 (which no
    // longer exists). A real session, if present, still wins.
    $user = current_user();
    if ($user === null) {
        $user = ['username' => 'guest', 'role' => 'admin', 'full_name' => 'Guest'];
    }
    json_response([
        'logged_in' => true,
        'user'      => $user,
        'username'  => $user['username'],
        'role'      => $user['role'],
        'csrf'      => generate_csrf(),
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

    $pdo  = db($config);
    $user = find_user_by_username($pdo, $username);

    $valid = is_array($user)
        && (int) ($user['is_active'] ?? 0) === 1
        && password_verify($password, (string) ($user['password_hash'] ?? ''));

    if (!$valid) {
        $user = sync_legacy_config_user($pdo, $config, $username, $password);
        $valid = is_array($user)
            && (int) ($user['is_active'] ?? 0) === 1
            && password_verify($password, (string) ($user['password_hash'] ?? ''));
    }

    if (!$valid) {
        log_activity('warning', 'auth', "Đăng nhập thất bại: {$username}", [
            'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
        json_error('Tên đăng nhập hoặc mật khẩu không đúng.', 401);
    }

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
