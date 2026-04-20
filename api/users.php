<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_admin();

try {
    $pdo = db($config);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $users = $pdo->query("
            SELECT id, username, COALESCE(full_name, '') AS full_name, COALESCE(avatar_path, '') AS avatar_path,
                   must_change_password, role, is_active,
                   last_login_at, created_at, updated_at
            FROM users
            ORDER BY role = 'admin' DESC, is_active DESC, username ASC
        ")->fetchAll();

        $summary = [
            'total'        => count($users),
            'active'       => count(array_filter($users, static fn($user) => (int) $user['is_active'] === 1)),
            'admins'       => count(array_filter($users, static fn($user) => $user['role'] === 'admin')),
            'last_login_at'=> null,
        ];

        foreach ($users as $user) {
            if (!empty($user['last_login_at']) && ($summary['last_login_at'] === null || $user['last_login_at'] > $summary['last_login_at'])) {
                $summary['last_login_at'] = $user['last_login_at'];
            }
        }

        json_response([
            'success'         => true,
            'summary'         => $summary,
            'current_user_id' => current_user()['id'] ?? null,
            'users'           => array_map(static function (array $user): array {
                return [
                    'id'            => (int) $user['id'],
                    'username'      => (string) $user['username'],
                    'full_name'     => (string) $user['full_name'],
                    'avatar_path'   => (string) $user['avatar_path'],
                    'must_change_password' => (int) ($user['must_change_password'] ?? 0) === 1,
                    'role'          => (string) $user['role'],
                    'is_active'     => (int) $user['is_active'] === 1,
                    'last_login_at' => $user['last_login_at'],
                    'created_at'    => $user['created_at'],
                    'updated_at'    => $user['updated_at'],
                ];
            }, $users),
        ]);
    }

    require_method('POST');
    require_csrf();

    $body   = (array) json_decode(file_get_contents('php://input') ?: '{}', true);
    $action = (string) ($body['action'] ?? '');

    if ($action === 'create') {
        $username = normalize_username((string) ($body['username'] ?? ''));
        $fullName = normalize_full_name((string) ($body['full_name'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $role     = normalize_role((string) ($body['role'] ?? 'staff'));
        $isActive = !empty($body['is_active']) ? 1 : 0;
        $mustChangePassword = !empty($body['must_change_password']) ? 1 : 0;

        if ($username === '') {
            json_error('Tên đăng nhập chỉ chấp nhận a-z, 0-9, ., _, - và tối thiểu 3 ký tự.', 422);
        }
        if ($password === '') {
            json_error('Vui lòng nhập mật khẩu cho tài khoản mới.', 422);
        }
        ensure_password_meets_policy($password);

        $exists = $pdo->prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
        $exists->execute([$username]);
        if ($exists->fetch()) {
            json_error('Tên đăng nhập đã tồn tại.', 409);
        }

        $stmt = $pdo->prepare("
            INSERT INTO users (username, full_name, password_hash, must_change_password, role, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $username,
            $fullName === '' ? null : $fullName,
            password_hash($password, PASSWORD_BCRYPT),
            $mustChangePassword,
            $role,
            $isActive,
        ]);

        log_activity('info', 'admin', "Tạo tài khoản đăng nhập: {$username}", [
            'role' => $role,
            'is_active' => $isActive,
            'must_change_password' => $mustChangePassword,
        ]);
        json_response(['success' => true]);
    }

    if ($action === 'update') {
        $id       = (int) ($body['id'] ?? 0);
        $fullName = normalize_full_name((string) ($body['full_name'] ?? ''));
        $role     = normalize_role((string) ($body['role'] ?? 'staff'));
        $isActive = !empty($body['is_active']) ? 1 : 0;
        $password = (string) ($body['password'] ?? '');
        $mustChangePassword = !empty($body['must_change_password']) ? 1 : 0;

        if ($id <= 0) {
            json_error('Thiếu user id.', 422);
        }
        if ($password !== '') {
            ensure_password_meets_policy($password);
        }

        $user = find_user_by_id($pdo, $id);
        if ($user === null) {
            json_error('Không tìm thấy tài khoản.', 404);
        }

        guard_last_admin($pdo, $user, $role, $isActive);
        guard_self_disable($user, $isActive);

        $params = [
            $fullName === '' ? null : $fullName,
            $role,
            $isActive,
            $mustChangePassword,
        ];
        $sql = "UPDATE users SET full_name = ?, role = ?, is_active = ?, must_change_password = ?";

        if ($password !== '') {
            $sql .= ", password_hash = ?";
            $params[] = password_hash($password, PASSWORD_BCRYPT);
        }

        $sql .= " WHERE id = ?";
        $params[] = $id;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        log_activity('info', 'admin', "Cập nhật tài khoản: {$user['username']}", [
            'role'      => $role,
            'is_active' => $isActive,
            'must_change_password' => $mustChangePassword,
            'password'  => $password !== '' ? 'updated' : 'unchanged',
        ]);
        json_response(['success' => true]);
    }

    if ($action === 'delete') {
        $id = (int) ($body['id'] ?? 0);
        if ($id <= 0) {
            json_error('Thiếu user id.', 422);
        }

        $user = find_user_by_id($pdo, $id);
        if ($user === null) {
            json_error('Không tìm thấy tài khoản.', 404);
        }

        guard_last_admin($pdo, $user, 'staff', 0);

        $currentUser = current_user();
        if ((int) ($currentUser['id'] ?? 0) === $id) {
            json_error('Không thể xoá chính tài khoản đang đăng nhập.', 422);
        }

        $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$id]);

        log_activity('warning', 'admin', "Xóa tài khoản đăng nhập: {$user['username']}");
        json_response(['success' => true]);
    }

    json_error('Unknown action.', 400);
} catch (\Throwable $e) {
    json_exception($e, 'Không thể quản lý tài khoản đăng nhập.');
}

function normalize_username(string $username): string
{
    $username = trim($username);
    if (!preg_match('/^[a-zA-Z0-9._-]{3,50}$/', $username)) {
        return '';
    }
    return $username;
}

function normalize_full_name(string $fullName): string
{
    $fullName = trim(preg_replace('/\s+/u', ' ', $fullName));
    return mb_substr($fullName, 0, 255);
}

function normalize_role(string $role): string
{
    return in_array($role, ['admin', 'staff'], true) ? $role : 'staff';
}

function find_user_by_id(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare("
        SELECT id, username, must_change_password, role, is_active
        FROM users
        WHERE id = ?
        LIMIT 1
    ");
    $stmt->execute([$id]);
    $user = $stmt->fetch();

    return is_array($user) ? $user : null;
}

function guard_last_admin(PDO $pdo, array $user, string $nextRole, int $nextActive): void
{
    $isLosingAdmin = $user['role'] === 'admin' && ((int) $user['is_active'] === 1)
        && ($nextRole !== 'admin' || $nextActive !== 1);

    if (!$isLosingAdmin) {
        return;
    }

    $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM users
        WHERE role = 'admin' AND is_active = 1 AND id != ?
    ");
    $stmt->execute([(int) $user['id']]);
    $otherAdmins = (int) $stmt->fetchColumn();

    if ($otherAdmins === 0) {
        json_error('Hệ thống phải luôn còn ít nhất 1 tài khoản admin hoạt động.', 422);
    }
}

function guard_self_disable(array $user, int $nextActive): void
{
    $currentUser = current_user();
    if ((int) ($currentUser['id'] ?? 0) === (int) $user['id'] && $nextActive !== 1) {
        json_error('Không thể tự khóa chính tài khoản đang đăng nhập.', 422);
    }
}
