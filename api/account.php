<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();
require_method('POST');
require_csrf();

try {
    $pdo = db($config);
    $current = current_user();
    $username = (string) ($current['username'] ?? '');
    if ($username === '') {
        json_error('Không tìm thấy tài khoản hiện tại.', 404);
    }

    $isJson = str_contains((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json');
    $body = $isJson
        ? (array) json_decode(file_get_contents('php://input') ?: '{}', true)
        : $_POST;
    $action = (string) ($body['action'] ?? '');

    $user = find_account_user($pdo, $username);
    if ($user === null) {
        json_error('Không tìm thấy tài khoản hiện tại.', 404);
    }

    if ($action === 'change_password') {
        change_password($pdo, $user, $body);
    }

    if ($action === 'update_profile') {
        update_profile($pdo, $user, $body);
    }

    json_error('Unknown action.', 400);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể cập nhật tài khoản.');
}

function find_account_user(PDO $pdo, string $username): ?array
{
    $stmt = $pdo->prepare("
        SELECT id, username, COALESCE(full_name, '') AS full_name, COALESCE(avatar_path, '') AS avatar_path,
               password_hash, role, is_active
        FROM users
        WHERE username = ?
        LIMIT 1
    ");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    return is_array($user) ? $user : null;
}

function change_password(PDO $pdo, array $user, array $body): void
{
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

    log_activity('info', 'auth', "Đổi mật khẩu thành công: {$user['username']}");
    json_response(['success' => true]);
}

function update_profile(PDO $pdo, array $user, array $body): void
{
    $fullName = normalize_account_full_name((string) ($body['full_name'] ?? ''));
    $removeAvatar = !empty($body['remove_avatar']);
    $avatarPath = (string) ($user['avatar_path'] ?? '');

    if (!empty($_FILES['avatar_file']['tmp_name'])) {
        $avatarPath = store_uploaded_avatar((int) $user['id'], (array) $_FILES['avatar_file'], $avatarPath);
    } elseif ($removeAvatar) {
        delete_avatar_file($avatarPath);
        $avatarPath = '';
    }

    $pdo->prepare("
        UPDATE users
        SET full_name = ?, avatar_path = ?
        WHERE id = ?
    ")->execute([
        $fullName === '' ? null : $fullName,
        $avatarPath === '' ? null : $avatarPath,
        (int) $user['id'],
    ]);

    $updatedUser = [
        'id' => (int) $user['id'],
        'username' => (string) $user['username'],
        'full_name' => $fullName,
        'avatar_path' => $avatarPath,
        'role' => (string) ($user['role'] ?? 'staff'),
    ];
    store_user_session($updatedUser, false);

    log_activity('info', 'auth', "Cập nhật hồ sơ cá nhân: {$user['username']}", [
        'avatar' => $avatarPath !== '' ? 'set' : 'empty',
    ]);

    json_response([
        'success' => true,
        'user' => $updatedUser,
    ]);
}

function normalize_account_full_name(string $fullName): string
{
    $fullName = trim((string) preg_replace('/\s+/u', ' ', $fullName));
    return mb_substr($fullName, 0, 255);
}

function store_uploaded_avatar(int $userId, array $file, string $previousPath): string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_error('Không thể tải avatar lên.', 422);
    }

    $tmpPath = (string) ($file['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
        json_error('File avatar không hợp lệ.', 422);
    }

    if ((int) ($file['size'] ?? 0) > 2 * 1024 * 1024) {
        json_error('Avatar tối đa 2MB.', 422);
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? (string) finfo_file($finfo, $tmpPath) : '';
    if ($finfo) {
        finfo_close($finfo);
    }

    $ext = match ($mime) {
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        default => '',
    };

    if ($ext === '') {
        json_error('Avatar chỉ hỗ trợ JPG, PNG hoặc WEBP.', 422);
    }

    $imageSize = @getimagesize($tmpPath);
    if ($imageSize === false) {
        json_error('File avatar không phải ảnh hợp lệ.', 422);
    }

    $dir = dirname(__DIR__) . '/uploads/avatars';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new \RuntimeException('Không thể tạo thư mục avatars.');
    }

    $filename = sprintf('user-%d-%s.%s', $userId, bin2hex(random_bytes(6)), $ext);
    $relativePath = 'uploads/avatars/' . $filename;
    $destPath = dirname(__DIR__) . '/' . $relativePath;

    if (!move_uploaded_file($tmpPath, $destPath)) {
        throw new \RuntimeException('Không thể lưu avatar.');
    }

    delete_avatar_file($previousPath);
    return $relativePath;
}

function delete_avatar_file(string $path): void
{
    if ($path === '' || !str_starts_with($path, 'uploads/avatars/')) {
        return;
    }

    $fullPath = dirname(__DIR__) . '/' . $path;
    if (is_file($fullPath)) {
        @unlink($fullPath);
    }
}
