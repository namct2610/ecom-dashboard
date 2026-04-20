<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('POST');
require_csrf();

try {
    $pdo = db($config);
    $body = (array) json_decode(file_get_contents('php://input') ?: '{}', true);
    $action = (string) ($body['action'] ?? '');

    if ($action !== 'change_password') {
        json_error('Unknown action.', 400);
    }

    $sessionUser = current_user();
    $username = (string) ($sessionUser['username'] ?? '');
    if ($username === '') {
        json_error('Không tìm thấy tài khoản hiện tại.', 404);
    }

    $currentPassword = (string) ($body['current_password'] ?? '');
    $newPassword = (string) ($body['new_password'] ?? '');
    $confirmPassword = (string) ($body['confirm_password'] ?? '');

    if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
        json_error('Vui lòng nhập đầy đủ các trường mật khẩu.', 422);
    }
    if (strlen($newPassword) < 6) {
        json_error('Mật khẩu mới phải có ít nhất 6 ký tự.', 422);
    }
    if ($newPassword !== $confirmPassword) {
        json_error('Xác nhận mật khẩu mới không khớp.', 422);
    }

    $stmt = $pdo->prepare("
        SELECT id, username, password_hash
        FROM users
        WHERE username = ?
        LIMIT 1
    ");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!is_array($user)) {
        json_error('Không tìm thấy tài khoản hiện tại.', 404);
    }
    if (!password_verify($currentPassword, (string) ($user['password_hash'] ?? ''))) {
        json_error('Mật khẩu hiện tại không đúng.', 422);
    }
    if (password_verify($newPassword, (string) ($user['password_hash'] ?? ''))) {
        json_error('Mật khẩu mới phải khác mật khẩu hiện tại.', 422);
    }

    $pdo->prepare("
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
    ")->execute([
        password_hash($newPassword, PASSWORD_BCRYPT),
        (int) $user['id'],
    ]);

    log_activity('info', 'auth', "Đổi mật khẩu thành công: {$username}");

    json_response(['success' => true]);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể cập nhật mật khẩu.');
}
