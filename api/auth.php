<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

start_session();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    json_response([
        'logged_in' => !empty($_SESSION['logged_in']),
        'username'  => $_SESSION['username'] ?? null,
        'csrf'      => generate_csrf(),
    ]);
}

if ($method === 'POST') {
    $body = (array) json_decode(file_get_contents('php://input'), true);
    $action = $body['action'] ?? ($_POST['action'] ?? '');

    if ($action === 'logout') {
        $loggedUser = $_SESSION['username'] ?? 'unknown';
        session_destroy();
        log_activity('info', 'auth', "Đăng xuất: {$loggedUser}");
        json_response(['success' => true]);
    }

    // Login
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');

    if (!$username || !$password) {
        json_error('Vui lòng nhập tên đăng nhập và mật khẩu.', 422);
    }

    $validUser = $config['auth']['username'] ?? 'admin';
    $validPass = $config['auth']['password'] ?? 'admin123';

    if ($username !== $validUser || $password !== $validPass) {
        log_activity('warning', 'auth', "Đăng nhập thất bại: {$username}", [
            'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
        json_error('Tên đăng nhập hoặc mật khẩu không đúng.', 401);
    }

    session_regenerate_id(true);
    $_SESSION['logged_in'] = true;
    $_SESSION['username']  = $username;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

    log_activity('info', 'auth', "Đăng nhập thành công: {$username}");

    json_response([
        'success'  => true,
        'username' => $username,
        'csrf'     => $_SESSION['csrf_token'],
    ]);
}

json_error('Method not allowed.', 405);
