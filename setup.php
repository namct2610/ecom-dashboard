<?php
/**
 * Dashboard v3 — Setup Wizard
 * Chạy một lần khi lần đầu triển khai lên shared host.
 * Sau khi cài đặt xong, file .installed được tạo ra và wizard sẽ bị khóa.
 */
declare(strict_types=1);

define('SETUP_VERSION', '1.0');
define('BASE_PATH', __DIR__);
define('LOCK_FILE', BASE_PATH . '/.installed');
define('CONFIG_FILE', BASE_PATH . '/config.php');

// ── Already installed? ────────────────────────────────────────────────────────
if (file_exists(LOCK_FILE) && ($_GET['force'] ?? '') !== 'yes') {
    showLocked();
    exit;
}

// ── CSRF token (session-based) ────────────────────────────────────────────────
session_start();
if (empty($_SESSION['setup_csrf'])) {
    $_SESSION['setup_csrf'] = bin2hex(random_bytes(32));
}
$csrf = $_SESSION['setup_csrf'];

// ── Handle POST actions ───────────────────────────────────────────────────────
$action = $_POST['action'] ?? '';
$result = null;

if ($action === 'check') {
    header('Content-Type: application/json');
    echo json_encode(runChecks());
    exit;
}

if ($action === 'test_db') {
    verifyCsrf($_POST['_csrf'] ?? '');
    header('Content-Type: application/json');
    echo json_encode(testDbConnection(
        $_POST['db_host'] ?? '127.0.0.1',
        $_POST['db_port'] ?? '3306',
        $_POST['db_name'] ?? '',
        $_POST['db_user'] ?? '',
        $_POST['db_pass'] ?? ''
    ));
    exit;
}

if ($action === 'install') {
    verifyCsrf($_POST['_csrf'] ?? '');
    header('Content-Type: application/json');
    echo json_encode(runInstall($_POST));
    exit;
}

// ── Render HTML ───────────────────────────────────────────────────────────────
renderPage($csrf);
exit;

// ═════════════════════════════════════════════════════════════════════════════
// FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

function verifyCsrf(string $token): void
{
    if (!$token || $token !== ($_SESSION['setup_csrf'] ?? '')) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Invalid CSRF token.']);
        exit;
    }
}

function runChecks(): array
{
    $checks = [];

    // PHP version
    $phpOk = version_compare(PHP_VERSION, '7.4.0', '>=');
    $checks[] = [
        'id'      => 'php_version',
        'label'   => 'PHP phiên bản ≥ 7.4',
        'value'   => PHP_VERSION,
        'status'  => $phpOk ? 'ok' : 'fail',
        'note'    => $phpOk ? '' : 'Cần nâng cấp PHP lên 7.4+',
    ];

    // PHP extensions
    $exts = [
        'pdo'        => 'PDO',
        'pdo_mysql'  => 'PDO MySQL',
        'json'       => 'JSON',
        'mbstring'   => 'Mbstring',
        'curl'       => 'cURL',
        'zip'        => 'ZIP',
        'gd'         => 'GD (ảnh)',
        'openssl'    => 'OpenSSL',
    ];
    foreach ($exts as $ext => $label) {
        $ok = extension_loaded($ext);
        $checks[] = [
            'id'     => "ext_$ext",
            'label'  => "Extension: $label",
            'value'  => $ok ? 'Có' : 'Không có',
            'status' => $ok ? 'ok' : ($ext === 'zip' || $ext === 'gd' ? 'warn' : 'fail'),
            'note'   => $ok ? '' : ($ext === 'zip' || $ext === 'gd' ? 'Không bắt buộc nhưng nên có' : "Bật $ext trong php.ini"),
        ];
    }

    // Memory limit
    $memBytes  = parseIniBytes(ini_get('memory_limit'));
    $memOk     = $memBytes === -1 || $memBytes >= 128 * 1024 * 1024;
    $memWarn   = $memBytes !== -1 && $memBytes < 256 * 1024 * 1024;
    $checks[] = [
        'id'     => 'memory_limit',
        'label'  => 'Memory limit ≥ 128M',
        'value'  => ini_get('memory_limit'),
        'status' => !$memOk ? 'fail' : ($memWarn ? 'warn' : 'ok'),
        'note'   => !$memOk ? 'Tăng memory_limit trong .user.ini hoặc php.ini' : ($memWarn ? 'Khuyến nghị 256M cho file lớn' : ''),
    ];

    // Upload size
    $ulBytes = parseIniBytes(ini_get('upload_max_filesize'));
    $ulOk    = $ulBytes >= 10 * 1024 * 1024;
    $ulBig   = $ulBytes >= 50 * 1024 * 1024;
    $checks[] = [
        'id'     => 'upload_size',
        'label'  => 'upload_max_filesize ≥ 10M',
        'value'  => ini_get('upload_max_filesize'),
        'status' => $ulOk ? ($ulBig ? 'ok' : 'warn') : 'fail',
        'note'   => $ulOk ? ($ulBig ? '' : 'Khuyến nghị 50M') : 'Tăng upload_max_filesize trong .user.ini',
    ];

    // max_execution_time
    $maxExec = (int) ini_get('max_execution_time');
    $checks[] = [
        'id'     => 'max_exec',
        'label'  => 'max_execution_time ≥ 60s',
        'value'  => $maxExec === 0 ? 'Không giới hạn' : "{$maxExec}s",
        'status' => ($maxExec === 0 || $maxExec >= 60) ? 'ok' : 'warn',
        'note'   => ($maxExec > 0 && $maxExec < 60) ? 'Nên đặt ≥ 300 cho import file lớn' : '',
    ];

    // Writable directories
    $dirs = [
        BASE_PATH          => 'Thư mục gốc (ghi config.php)',
        BASE_PATH . '/uploads' => 'uploads/',
    ];
    foreach ($dirs as $dir => $label) {
        if (!file_exists($dir)) {
            $writable = @mkdir($dir, 0755, true);
        } else {
            $writable = is_writable($dir);
        }
        $checks[] = [
            'id'     => 'writable_' . md5($dir),
            'label'  => "Ghi được: $label",
            'value'  => $writable ? 'Có' : 'Không',
            'status' => $writable ? 'ok' : 'fail',
            'note'   => $writable ? '' : "chmod 755 $label trên host",
        ];
    }

    // Vendor / Composer
    $vendorOk = file_exists(BASE_PATH . '/vendor/autoload.php');
    $checks[] = [
        'id'     => 'vendor',
        'label'  => 'vendor/ (Composer dependencies)',
        'value'  => $vendorOk ? 'Có' : 'Không có',
        'status' => $vendorOk ? 'ok' : 'fail',
        'note'   => $vendorOk ? '' : 'Chạy: composer install --no-dev --optimize-autoloader',
    ];

    // mod_rewrite
    $rewriteOk = function_exists('apache_get_modules')
        ? in_array('mod_rewrite', apache_get_modules(), true)
        : true; // can't detect on nginx/lsws — assume ok
    $checks[] = [
        'id'     => 'mod_rewrite',
        'label'  => 'mod_rewrite / URL rewrite',
        'value'  => $rewriteOk ? 'Bật' : 'Không phát hiện',
        'status' => $rewriteOk ? 'ok' : 'warn',
        'note'   => $rewriteOk ? '' : 'Bật mod_rewrite hoặc liên hệ hosting hỗ trợ',
    ];

    // Config file writable
    $cfgWritable = !file_exists(CONFIG_FILE) || is_writable(CONFIG_FILE);
    $checks[] = [
        'id'     => 'config_writable',
        'label'  => 'config.php có thể ghi',
        'value'  => $cfgWritable ? 'Có' : 'Không',
        'status' => $cfgWritable ? 'ok' : 'fail',
        'note'   => $cfgWritable ? '' : 'chmod 644 config.php hoặc xóa để wizard tự tạo',
    ];

    $failCount = count(array_filter($checks, fn($c) => $c['status'] === 'fail'));
    $warnCount = count(array_filter($checks, fn($c) => $c['status'] === 'warn'));

    return [
        'success'    => true,
        'checks'     => $checks,
        'fail_count' => $failCount,
        'warn_count' => $warnCount,
        'can_proceed'=> $failCount === 0,
    ];
}

function testDbConnection(string $host, string $port, string $name, string $user, string $pass): array
{
    if ($name === '' || $user === '') {
        return ['success' => false, 'error' => 'Tên database và username không được để trống.'];
    }
    try {
        $dsn = "mysql:host=$host;port=$port;charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);

        // Try to create database if not exists
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `$name`");

        $version = $pdo->query('SELECT VERSION()')->fetchColumn();
        return ['success' => true, 'version' => $version];
    } catch (\Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

function runInstall(array $post): array
{
    // Collect inputs
    $dbHost   = trim($post['db_host']   ?? '127.0.0.1');
    $dbPort   = trim($post['db_port']   ?? '3306');
    $dbName   = trim($post['db_name']   ?? '');
    $dbUser   = trim($post['db_user']   ?? '');
    $dbPass   = $post['db_pass'] ?? '';
    $adminUser = trim($post['admin_user'] ?? 'admin');
    $adminPass = trim($post['admin_pass'] ?? '');
    $timezone = trim($post['timezone'] ?? 'Asia/Ho_Chi_Minh');

    if ($dbName === '' || $dbUser === '') {
        return ['success' => false, 'error' => 'Thiếu thông tin database.'];
    }
    if ($adminUser === '' || strlen($adminPass) < 6) {
        return ['success' => false, 'error' => 'Mật khẩu admin phải có ít nhất 6 ký tự.'];
    }

    // Test connection
    $test = testDbConnection($dbHost, $dbPort, $dbName, $dbUser, $dbPass);
    if (!$test['success']) {
        return ['success' => false, 'error' => 'Kết nối DB thất bại: ' . $test['error']];
    }

    // Write config.php
    $configContent = generateConfig($dbHost, $dbPort, $dbName, $dbUser, $dbPass, $adminUser, $adminPass, $timezone);
    if (file_put_contents(CONFIG_FILE, $configContent) === false) {
        return ['success' => false, 'error' => 'Không thể ghi config.php. Kiểm tra quyền ghi thư mục.'];
    }

    // Initialize database schema
    try {
        $dsn = "mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4";
        $pdo = new PDO($dsn, $dbUser, $dbPass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            1002 => "SET time_zone='+07:00', sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))",
        ]);
        initSchema($pdo);
        seedAdminUser($pdo, $adminUser, $adminPass);
    } catch (\Exception $e) {
        return ['success' => false, 'error' => 'Khởi tạo database thất bại: ' . $e->getMessage()];
    }

    // Ensure uploads dir + .htaccess
    $uploadsDir = BASE_PATH . '/uploads';
    if (!is_dir($uploadsDir)) {
        @mkdir($uploadsDir, 0755, true);
    }
    @file_put_contents($uploadsDir . '/.htaccess', "Order deny,allow\nDeny from all\n");

    // Write lock file
    file_put_contents(LOCK_FILE, date('Y-m-d H:i:s') . "\n");

    return ['success' => true, 'message' => 'Cài đặt thành công!'];
}

function generateConfig(string $host, string $port, string $db, string $user, string $pass,
                        string $adminUser, string $adminPass, string $tz): string
{
    $host      = addslashes($host);
    $port      = addslashes($port);
    $db        = addslashes($db);
    $user      = addslashes($user);
    $pass      = addslashes($pass);
    $adminUser = addslashes($adminUser);
    $adminPass = addslashes($adminPass);
    $tz        = addslashes($tz);

    return <<<PHP
<?php

declare(strict_types=1);

return [
    'app' => [
        'name'             => 'Business Dashboard',
        'timezone'         => '$tz',
        'base_path'        => __DIR__,
        'upload_path'      => __DIR__ . '/uploads',
        'max_upload_size'  => 50 * 1024 * 1024, // 50 MB
        'allowed_platforms'=> ['shopee', 'lazada', 'tiktokshop'],
    ],
    'db' => [
        'host'     => '$host',
        'port'     => '$port',
        'database' => '$db',
        'username' => '$user',
        'password' => '$pass',
        'charset'  => 'utf8mb4',
    ],
    'auth' => [
        'username' => '$adminUser',
        'password' => '$adminPass',
    ],
];
PHP;
}

function initSchema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS upload_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        platform ENUM('shopee','lazada','tiktokshop') NOT NULL,
        data_type ENUM('orders','traffic') NOT NULL DEFAULT 'orders',
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        total_rows INT DEFAULT 0,
        imported_rows INT DEFAULT 0,
        skipped_rows INT DEFAULT 0,
        status ENUM('pending','processing','completed','failed') DEFAULT 'pending',
        error_message TEXT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME NULL,
        INDEX idx_platform (platform),
        INDEX idx_data_type (data_type),
        INDEX idx_status (status),
        INDEX idx_uploaded_at (uploaded_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        platform ENUM('shopee','lazada','tiktokshop') NOT NULL,
        order_id VARCHAR(100) NOT NULL,
        buyer_name VARCHAR(255) NULL,
        buyer_username VARCHAR(255) NULL,
        shipping_address VARCHAR(500) NULL,
        shipping_district VARCHAR(100) NULL,
        shipping_city VARCHAR(100) NULL,
        payment_method VARCHAR(100) NULL,
        sku VARCHAR(100) NOT NULL,
        product_name VARCHAR(500),
        variation VARCHAR(255) NULL,
        quantity INT DEFAULT 1,
        unit_price DECIMAL(15,2) DEFAULT 0,
        subtotal_before_discount DECIMAL(15,2) DEFAULT 0,
        platform_discount DECIMAL(15,2) DEFAULT 0,
        seller_discount DECIMAL(15,2) DEFAULT 0,
        subtotal_after_discount DECIMAL(15,2) DEFAULT 0,
        order_total DECIMAL(15,2) DEFAULT 0,
        shipping_fee DECIMAL(15,2) DEFAULT 0,
        platform_fee_fixed DECIMAL(15,2) DEFAULT 0,
        platform_fee_service DECIMAL(15,2) DEFAULT 0,
        platform_fee_payment DECIMAL(15,2) DEFAULT 0,
        normalized_status ENUM('completed','delivered','cancelled','pending') NOT NULL,
        original_status VARCHAR(500),
        order_created_at DATETIME NOT NULL,
        order_paid_at DATETIME NULL,
        order_completed_at DATETIME NULL,
        upload_id INT NULL,
        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_platform_order_sku (platform, order_id, sku),
        INDEX idx_platform_status_date (platform, normalized_status, order_created_at),
        INDEX idx_order_created_at (order_created_at),
        INDEX idx_sku (sku),
        INDEX idx_shipping_city (shipping_city)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    addIndexIfMissing($pdo, 'orders', 'idx_buyer_status_date', "CREATE INDEX idx_buyer_status_date ON orders (buyer_username, normalized_status, order_created_at)");
    addIndexIfMissing($pdo, 'orders', 'idx_city_district_status', "CREATE INDEX idx_city_district_status ON orders (shipping_city, shipping_district, normalized_status)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS traffic_daily (
        id INT AUTO_INCREMENT PRIMARY KEY,
        platform ENUM('shopee','lazada','tiktokshop') NOT NULL,
        traffic_date DATE NOT NULL,
        device_type ENUM('all','desktop','mobile') NOT NULL DEFAULT 'all',
        page_views INT DEFAULT 0,
        avg_page_views DECIMAL(10,2) DEFAULT 0,
        avg_session_duration INT DEFAULT 0,
        bounce_rate DECIMAL(5,2) DEFAULT 0,
        visits INT DEFAULT 0,
        new_visitors INT DEFAULT 0,
        returning_visitors INT DEFAULT 0,
        new_followers INT DEFAULT 0,
        upload_id INT NULL,
        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_traffic_date (platform, traffic_date, device_type),
        INDEX idx_traffic_date (traffic_date),
        INDEX idx_traffic_platform (platform)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS import_errors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_id INT NOT NULL,
        `row_number` INT NOT NULL,
        raw_order_id VARCHAR(100) NULL,
        raw_sku VARCHAR(100) NULL,
        error_code VARCHAR(100) NOT NULL,
        error_message VARCHAR(500) NOT NULL,
        raw_payload LONGTEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_upload_id (upload_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS app_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        level ENUM('debug','info','warning','error','critical') NOT NULL DEFAULT 'info',
        category VARCHAR(50) NOT NULL DEFAULT 'app',
        message VARCHAR(1000) NOT NULL,
        context LONGTEXT NULL COMMENT 'JSON',
        request_uri VARCHAR(500) NULL,
        ip_address VARCHAR(45) NULL,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_level (level),
        INDEX idx_category (category),
        INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS tiktok_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shop_id VARCHAR(100) NOT NULL,
        shop_name VARCHAR(255) NULL,
        shop_cipher VARCHAR(500) NULL,
        region VARCHAR(20) NULL,
        access_token TEXT NULL,
        refresh_token TEXT NULL,
        access_token_expire_at DATETIME NULL,
        refresh_token_expire_at DATETIME NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        authorized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_synced_at DATETIME NULL,
        sync_from_date DATE NULL,
        UNIQUE KEY uk_shop_id (shop_id),
        INDEX idx_is_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS lazada_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id VARCHAR(100) NOT NULL,
        account_name VARCHAR(255) NULL,
        country VARCHAR(10) NOT NULL DEFAULT 'vn',
        access_token TEXT NULL,
        refresh_token TEXT NULL,
        access_token_expire_at DATETIME NULL,
        refresh_token_expire_at DATETIME NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        authorized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_synced_at DATETIME NULL,
        sync_from_date DATE NULL,
        UNIQUE KEY uk_account_id (account_id),
        INDEX idx_is_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        full_name VARCHAR(255) NULL,
        avatar_path VARCHAR(500) NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','staff') NOT NULL DEFAULT 'staff',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_login_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_username (username),
        INDEX idx_role_active (role, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function seedAdminUser(PDO $pdo, string $username, string $password): void
{
    $count = (int) $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    if ($count > 0) {
        return;
    }

    $stmt = $pdo->prepare("
        INSERT INTO users (username, full_name, password_hash, role, is_active)
        VALUES (?, ?, ?, 'admin', 1)
    ");
    $stmt->execute([
        $username,
        'Administrator',
        password_hash($password, PASSWORD_BCRYPT),
    ]);
}

function addIndexIfMissing(PDO $pdo, string $table, string $indexName, string $sql): void
{
    $stmt = $pdo->query("SHOW INDEX FROM `{$table}` WHERE Key_name = " . $pdo->quote($indexName));
    if ($stmt->fetch()) {
        return;
    }

    $pdo->exec($sql);
}

function parseIniBytes(string $val): int
{
    if ($val === '-1') return -1;
    $val  = trim($val);
    $last = strtolower($val[strlen($val) - 1]);
    $num  = (int) $val;
    return match ($last) {
        'g' => $num * 1024 * 1024 * 1024,
        'm' => $num * 1024 * 1024,
        'k' => $num * 1024,
        default => $num,
    };
}

function showLocked(): void
{
    $installedAt = file_exists(LOCK_FILE) ? trim(file_get_contents(LOCK_FILE)) : '—';
    http_response_code(403);
    echo <<<HTML
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Đã cài đặt — Dashboard v3</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;color:#334155}
.card{background:#fff;border-radius:16px;padding:40px;max-width:440px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.icon{font-size:48px;margin-bottom:16px}
h1{font-size:20px;font-weight:700;margin-bottom:8px}
p{color:#64748b;font-size:14px;line-height:1.6;margin-bottom:20px}
a{display:inline-block;background:#4f46e5;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px}
small{display:block;margin-top:12px;color:#94a3b8;font-size:12px}
</style>
</head>
<body>
<div class="card">
  <div class="icon">🔒</div>
  <h1>Đã cài đặt xong</h1>
  <p>Dashboard đã được cài đặt thành công. Setup wizard đã bị khóa để bảo mật.</p>
  <a href="index.php">Vào Dashboard</a>
  <small>Cài đặt lúc: $installedAt</small>
  <small style="margin-top:8px">Để chạy lại: xóa file <code>.installed</code> trên server</small>
</div>
</body>
</html>
HTML;
}

// ═════════════════════════════════════════════════════════════════════════════
// RENDER HTML PAGE
// ═════════════════════════════════════════════════════════════════════════════

function renderPage(string $csrf): void
{
    $alreadyInstalled = file_exists(LOCK_FILE);
    $reinstall        = ($alreadyInstalled && ($_GET['force'] ?? '') === 'yes') ? 'true' : 'false';
    $timezones        = ['Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Jakarta', 'UTC'];
    $tzOptions        = implode('', array_map(
        fn($tz) => "<option value=\"$tz\"" . ($tz === 'Asia/Ho_Chi_Minh' ? ' selected' : '') . ">$tz</option>",
        $timezones
    ));

    echo <<<HTML
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cài đặt — Dashboard v3</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;color:#1e293b;min-height:100vh}
.wrap{max-width:740px;margin:0 auto;padding:40px 20px 80px}
.logo{text-align:center;margin-bottom:32px}
.logo h1{font-size:24px;font-weight:800;color:#1e293b}
.logo p{color:#64748b;font-size:14px;margin-top:4px}

/* Steps */
.steps{display:flex;gap:0;margin-bottom:32px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0}
.step{flex:1;padding:14px 12px;text-align:center;font-size:13px;font-weight:600;color:#94a3b8;border-right:1px solid #e2e8f0;cursor:default;transition:all .2s}
.step:last-child{border-right:none}
.step.active{background:#4f46e5;color:#fff}
.step.done{background:#f0fdf4;color:#16a34a}
.step-num{display:inline-block;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.1);line-height:22px;font-size:11px;margin-right:6px}
.step.active .step-num{background:rgba(255,255,255,.25)}
.step.done .step-num{background:#dcfce7;color:#16a34a}

/* Cards */
.card{background:#fff;border-radius:16px;padding:28px 32px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #e2e8f0;margin-bottom:20px}
.card-title{font-size:17px;font-weight:700;margin-bottom:4px;color:#0f172a}
.card-sub{font-size:13px;color:#64748b;margin-bottom:20px;line-height:1.5}

/* Check items */
.check-list{display:flex;flex-direction:column;gap:8px}
.check-item{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;font-size:13px}
.check-item.ok{background:#f0fdf4}
.check-item.warn{background:#fffbeb}
.check-item.fail{background:#fef2f2}
.check-icon{font-size:16px;flex-shrink:0;width:20px;text-align:center}
.check-label{flex:1;font-weight:500}
.check-value{color:#64748b;font-size:12px;margin-left:auto;white-space:nowrap}
.check-note{display:block;font-size:11px;color:#ef4444;margin-top:2px;font-weight:400}
.check-note.warn{color:#d97706}

/* Form */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.form-grid.single{grid-template-columns:1fr}
label{display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:5px}
input[type=text],input[type=password],input[type=number],select{
  width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;
  color:#1e293b;background:#fff;transition:border .15s;outline:none
}
input:focus,select:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.1)}
.input-hint{font-size:11px;color:#94a3b8;margin-top:4px}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 22px;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
.btn-primary{background:#4f46e5;color:#fff}
.btn-primary:hover{background:#4338ca}
.btn-primary:disabled{background:#a5b4fc;cursor:not-allowed}
.btn-secondary{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0}
.btn-secondary:hover{background:#e2e8f0}
.btn-actions{display:flex;gap:10px;margin-top:20px;justify-content:flex-end}

/* Status badges */
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
.badge-ok{background:#dcfce7;color:#16a34a}
.badge-warn{background:#fef9c3;color:#a16207}
.badge-fail{background:#fee2e2;color:#dc2626}

/* Alert boxes */
.alert{padding:12px 16px;border-radius:10px;font-size:13px;margin-bottom:16px;display:flex;gap:10px;align-items:flex-start}
.alert-warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
.alert-error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
.alert-success{background:#f0fdf4;border:1px solid #bbf7d0;color:#14532d}
.alert-info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}

/* Progress/spinner */
.spinner{display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}

/* Hidden */
.hidden{display:none!important}

/* Password strength */
.pw-strength{height:4px;border-radius:2px;margin-top:6px;transition:all .3s;background:#e2e8f0}
.pw-strength-bar{height:100%;border-radius:2px;transition:all .3s;width:0}

/* Summary */
.summary-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
.summary-row:last-child{border-bottom:none}
.summary-key{color:#64748b}
.summary-val{font-weight:600}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <h1>⚡ Dashboard v3 — Cài đặt</h1>
    <p>Wizard thiết lập lần đầu cho shared hosting</p>
  </div>

  <!-- Steps bar -->
  <div class="steps" id="stepsBar">
    <div class="step active" id="step-tab-1"><span class="step-num">1</span>Kiểm tra hệ thống</div>
    <div class="step"        id="step-tab-2"><span class="step-num">2</span>Cơ sở dữ liệu</div>
    <div class="step"        id="step-tab-3"><span class="step-num">3</span>Tài khoản Admin</div>
    <div class="step"        id="step-tab-4"><span class="step-num">4</span>Hoàn tất</div>
  </div>

  <!-- ─── STEP 1: System checks ─────────────────────────────────────── -->
  <div id="page-1">
    <div class="card">
      <div class="card-title">Kiểm tra yêu cầu hệ thống</div>
      <div class="card-sub">Wizard đang kiểm tra môi trường server. Các lỗi cần được sửa trước khi cài đặt.</div>
      <div id="checksContainer">
        <div style="text-align:center;padding:32px;color:#94a3b8">
          <div class="spinner" style="border-color:rgba(79,70,229,.3);border-top-color:#4f46e5;width:28px;height:28px"></div>
          <div style="margin-top:12px;font-size:13px">Đang kiểm tra...</div>
        </div>
      </div>
      <div id="checksSummary" class="hidden" style="margin-top:16px"></div>
    </div>
    <div class="btn-actions">
      <button class="btn btn-secondary" onclick="runChecks()">🔄 Chạy lại</button>
      <button class="btn btn-primary hidden" id="btn1Next" onclick="goStep(2)">Tiếp theo →</button>
    </div>
  </div>

  <!-- ─── STEP 2: Database ───────────────────────────────────────────── -->
  <div id="page-2" class="hidden">
    <div class="card">
      <div class="card-title">Cấu hình cơ sở dữ liệu</div>
      <div class="card-sub">Nhập thông tin kết nối MySQL. Wizard sẽ tự tạo database nếu chưa có.</div>
      <div class="form-grid">
        <div>
          <label for="db_host">Host</label>
          <input type="text" id="db_host" value="127.0.0.1" placeholder="127.0.0.1 hoặc localhost">
          <div class="input-hint">Thường là localhost hoặc 127.0.0.1</div>
        </div>
        <div>
          <label for="db_port">Port</label>
          <input type="number" id="db_port" value="3306" placeholder="3306">
        </div>
        <div>
          <label for="db_name">Tên Database</label>
          <input type="text" id="db_name" placeholder="dashboard_v3">
          <div class="input-hint">Tự tạo nếu chưa tồn tại</div>
        </div>
        <div>
          <label for="db_user">Username</label>
          <input type="text" id="db_user" placeholder="root">
        </div>
        <div class="form-grid single" style="grid-column:1/-1">
          <div>
            <label for="db_pass">Password</label>
            <input type="password" id="db_pass" placeholder="Để trống nếu không có mật khẩu">
          </div>
        </div>
      </div>
      <div id="dbTestResult" style="margin-top:14px"></div>
    </div>
    <div class="btn-actions">
      <button class="btn btn-secondary" onclick="goStep(1)">← Quay lại</button>
      <button class="btn btn-secondary" id="btnTestDb" onclick="testDb()">🔌 Kiểm tra kết nối</button>
      <button class="btn btn-primary hidden" id="btn2Next" onclick="goStep(3)">Tiếp theo →</button>
    </div>
  </div>

  <!-- ─── STEP 3: Admin account ─────────────────────────────────────── -->
  <div id="page-3" class="hidden">
    <div class="card">
      <div class="card-title">Tài khoản quản trị</div>
      <div class="card-sub">Thiết lập thông tin đăng nhập cho dashboard. Lưu lại ở nơi an toàn.</div>
      <div class="form-grid">
        <div>
          <label for="admin_user">Tên đăng nhập</label>
          <input type="text" id="admin_user" value="admin" placeholder="admin">
        </div>
        <div>
          <label for="timezone">Múi giờ</label>
          <select id="timezone">$tzOptions</select>
        </div>
        <div style="grid-column:1/-1">
          <label for="admin_pass">Mật khẩu (tối thiểu 6 ký tự)</label>
          <input type="password" id="admin_pass" placeholder="Nhập mật khẩu mạnh..." oninput="checkPwStrength(this.value)">
          <div class="pw-strength"><div class="pw-strength-bar" id="pwBar"></div></div>
          <div id="pwLabel" style="font-size:11px;color:#94a3b8;margin-top:4px"></div>
        </div>
        <div style="grid-column:1/-1">
          <label for="admin_pass2">Xác nhận mật khẩu</label>
          <input type="password" id="admin_pass2" placeholder="Nhập lại mật khẩu...">
        </div>
      </div>
      <div id="adminFormError" style="margin-top:14px"></div>
    </div>

    <!-- Summary -->
    <div class="card" style="background:#f8fafc">
      <div class="card-title" style="font-size:14px;margin-bottom:12px">Xem lại trước khi cài đặt</div>
      <div id="summaryContent"></div>
    </div>

    <div class="btn-actions">
      <button class="btn btn-secondary" onclick="goStep(2)">← Quay lại</button>
      <button class="btn btn-primary" id="btnInstall" onclick="doInstall()">
        🚀 Cài đặt ngay
      </button>
    </div>
  </div>

  <!-- ─── STEP 4: Done ──────────────────────────────────────────────── -->
  <div id="page-4" class="hidden">
    <div class="card" style="text-align:center">
      <div style="font-size:56px;margin-bottom:16px">🎉</div>
      <div class="card-title" style="font-size:22px;margin-bottom:8px">Cài đặt thành công!</div>
      <p style="color:#64748b;font-size:14px;line-height:1.7;margin-bottom:24px">
        Database đã được khởi tạo, config.php đã được ghi.<br>
        File <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">.installed</code> đã được tạo để khóa wizard này.
      </p>
      <div class="alert alert-warn" style="text-align:left;margin-bottom:20px">
        <span>⚠️</span>
        <div>
          <strong>Bảo mật:</strong> Khuyến nghị xóa hoặc đổi tên <code>setup.php</code> trên server sau khi cài đặt xong.
        </div>
      </div>
      <a href="index.php" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">
        → Vào Dashboard
      </a>
    </div>
  </div>

</div><!-- /.wrap -->

<script>
const CSRF = '$csrf';
const REINSTALL = $reinstall;

// ── Step navigation ──────────────────────────────────────────────────────────
let currentStep = 1;
let checksOk    = false;
let dbOk        = false;

function goStep(n) {
  document.getElementById('page-' + currentStep).classList.add('hidden');
  document.getElementById('page-' + n).classList.remove('hidden');
  // update tabs
  for (let i = 1; i <= 4; i++) {
    const tab = document.getElementById('step-tab-' + i);
    tab.classList.remove('active', 'done');
    if (i < n)      tab.classList.add('done');
    else if (i === n) tab.classList.add('active');
  }
  currentStep = n;
  if (n === 3) buildSummary();
}

// ── Step 1: System checks ────────────────────────────────────────────────────
async function runChecks() {
  const container = document.getElementById('checksContainer');
  const summary   = document.getElementById('checksSummary');
  const btn       = document.getElementById('btn1Next');
  container.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8"><div class="spinner" style="border-color:rgba(79,70,229,.3);border-top-color:#4f46e5;width:28px;height:28px"></div><div style="margin-top:12px;font-size:13px">Đang kiểm tra...</div></div>';
  summary.classList.add('hidden');
  btn.classList.add('hidden');

  const res = await fetch('setup.php', { method: 'POST', body: new URLSearchParams({ action: 'check' }) });
  const data = await res.json();

  const icons = { ok: '✅', warn: '⚠️', fail: '❌' };
  container.innerHTML = '<div class="check-list">' + data.checks.map(c => `
    <div class="check-item \${c.status}">
      <span class="check-icon">\${icons[c.status]}</span>
      <span class="check-label">\${esc(c.label)}
        \${c.note ? '<span class="check-note ' + (c.status === 'warn' ? 'warn' : '') + '">' + esc(c.note) + '</span>' : ''}
      </span>
      <span class="check-value">\${esc(c.value)}</span>
      <span class="badge badge-\${c.status}">\${c.status.toUpperCase()}</span>
    </div>`).join('') + '</div>';

  const fc = data.fail_count, wc = data.warn_count;
  let summaryHtml = '';
  if (fc === 0 && wc === 0) {
    summaryHtml = '<div class="alert alert-success">✅ Tất cả điều kiện đều đạt. Bạn có thể tiếp tục cài đặt.</div>';
  } else if (fc === 0) {
    summaryHtml = '<div class="alert alert-warn">⚠️ Có ' + wc + ' cảnh báo nhưng không ngăn cài đặt. Kiểm tra sau khi cài xong.</div>';
  } else {
    summaryHtml = '<div class="alert alert-error">❌ Có ' + fc + ' lỗi cần sửa trước khi cài đặt.</div>';
  }
  summary.innerHTML = summaryHtml;
  summary.classList.remove('hidden');

  checksOk = data.can_proceed;
  if (checksOk) btn.classList.remove('hidden');
}

// ── Step 2: DB test ──────────────────────────────────────────────────────────
async function testDb() {
  const btn    = document.getElementById('btnTestDb');
  const result = document.getElementById('dbTestResult');
  const nextBtn = document.getElementById('btn2Next');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Đang kiểm tra...';
  result.innerHTML = '';
  nextBtn.classList.add('hidden');
  dbOk = false;

  const body = new URLSearchParams({
    action: 'test_db', _csrf: CSRF,
    db_host: v('db_host'), db_port: v('db_port'),
    db_name: v('db_name'), db_user: v('db_user'), db_pass: v('db_pass'),
  });
  const res  = await fetch('setup.php', { method: 'POST', body });
  const data = await res.json();

  btn.disabled = false;
  btn.innerHTML = '🔌 Kiểm tra kết nối';

  if (data.success) {
    result.innerHTML = '<div class="alert alert-success">✅ Kết nối thành công! MySQL ' + esc(data.version) + '</div>';
    nextBtn.classList.remove('hidden');
    dbOk = true;
  } else {
    result.innerHTML = '<div class="alert alert-error">❌ ' + esc(data.error) + '</div>';
  }
}

// ── Step 3: Summary + Install ────────────────────────────────────────────────
function buildSummary() {
  document.getElementById('summaryContent').innerHTML =
    '<div class="summary-row"><span class="summary-key">DB Host</span><span class="summary-val">' + esc(v('db_host')) + ':' + esc(v('db_port')) + '</span></div>' +
    '<div class="summary-row"><span class="summary-key">Database</span><span class="summary-val">' + esc(v('db_name')) + '</span></div>' +
    '<div class="summary-row"><span class="summary-key">DB User</span><span class="summary-val">' + esc(v('db_user')) + '</span></div>' +
    '<div class="summary-row"><span class="summary-key">Admin user</span><span class="summary-val">' + esc(v('admin_user')) + '</span></div>' +
    '<div class="summary-row"><span class="summary-key">Timezone</span><span class="summary-val">' + esc(v('timezone')) + '</span></div>';
}

function checkPwStrength(pw) {
  const bar = document.getElementById('pwBar');
  const lbl = document.getElementById('pwLabel');
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { w: '0%',   color: '#e2e8f0', text: '' },
    { w: '25%',  color: '#ef4444', text: 'Quá yếu' },
    { w: '50%',  color: '#f97316', text: 'Yếu' },
    { w: '75%',  color: '#eab308', text: 'Trung bình' },
    { w: '90%',  color: '#22c55e', text: 'Tốt' },
    { w: '100%', color: '#16a34a', text: 'Rất mạnh' },
  ];
  const l = levels[score] || levels[0];
  bar.style.width = l.w; bar.style.background = l.color;
  lbl.textContent = l.text; lbl.style.color = l.color;
}

async function doInstall() {
  const errEl = document.getElementById('adminFormError');
  errEl.innerHTML = '';

  const user  = v('admin_user').trim();
  const pass  = v('admin_pass');
  const pass2 = v('admin_pass2');

  if (!user) { errEl.innerHTML = '<div class="alert alert-error">Tên đăng nhập không được để trống.</div>'; return; }
  if (pass.length < 6) { errEl.innerHTML = '<div class="alert alert-error">Mật khẩu phải có ít nhất 6 ký tự.</div>'; return; }
  if (pass !== pass2)  { errEl.innerHTML = '<div class="alert alert-error">Hai mật khẩu không khớp.</div>'; return; }

  const btn = document.getElementById('btnInstall');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Đang cài đặt...';

  const body = new URLSearchParams({
    action: 'install', _csrf: CSRF,
    db_host: v('db_host'), db_port: v('db_port'),
    db_name: v('db_name'), db_user: v('db_user'), db_pass: v('db_pass'),
    admin_user: user, admin_pass: pass,
    timezone: v('timezone'),
  });

  const res  = await fetch('setup.php', { method: 'POST', body });
  const data = await res.json();

  btn.disabled = false;
  btn.innerHTML = '🚀 Cài đặt ngay';

  if (data.success) {
    goStep(4);
  } else {
    errEl.innerHTML = '<div class="alert alert-error">❌ ' + esc(data.error) + '</div>';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function v(id) { return (document.getElementById(id) || {}).value || ''; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Auto-run checks on load ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', runChecks);
</script>
</body>
</html>
HTML;
}
