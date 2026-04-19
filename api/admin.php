<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_admin();

$method = $_SERVER['REQUEST_METHOD'];

try {
    $pdo = db($config);

    // ── GET: system info ──────────────────────────────────────────────────────
    if ($method === 'GET') {
        $action = $_GET['action'] ?? 'system_info';

        if ($action === 'system_info') {
            json_response(['success' => true, 'info' => buildSystemInfo($pdo, $config)]);
        }

        json_error('Unknown action.', 400);
    }

    // ── POST: reset operations ────────────────────────────────────────────────
    require_method('POST');
    require_csrf();

    $body   = (array) json_decode(file_get_contents('php://input') ?: '{}', true);
    $action = $body['action'] ?? '';

    if ($action === 'reset_orders') {
        $pdo->beginTransaction();
        $pdo->exec("DELETE FROM import_errors");
        $pdo->exec("DELETE FROM upload_history");
        $pdo->exec("DELETE FROM orders");
        $pdo->exec("DELETE FROM traffic_daily");
        $pdo->commit();
        log_activity('warning', 'admin', 'Reset dữ liệu đơn hàng & traffic bởi admin.');
        json_response(['success' => true, 'message' => 'Đã xóa toàn bộ đơn hàng, traffic và lịch sử upload.']);
    }

    if ($action === 'reset_api_connections') {
        $pdo->beginTransaction();
        $pdo->exec("DELETE FROM tiktok_connections");
        $pdo->exec("DELETE FROM lazada_connections");
        $pdo->exec("DELETE FROM shopee_connections");
        $pdo->exec("DELETE FROM app_settings WHERE setting_key IN (
            'tiktok_app_key','tiktok_app_secret',
            'lazada_app_key','lazada_app_secret',
            'shopee_partner_id','shopee_partner_key'
        )");
        $pdo->commit();
        log_activity('warning', 'admin', 'Reset kết nối API (Shopee + TikTok + Lazada) bởi admin.');
        json_response(['success' => true, 'message' => 'Đã xóa toàn bộ kết nối API và thông tin xác thực.']);
    }

    if ($action === 'reset_logs') {
        $pdo->exec("DELETE FROM app_logs");
        log_activity('info', 'admin', 'Xóa nhật ký hệ thống bởi admin.');
        json_response(['success' => true, 'message' => 'Đã xóa toàn bộ nhật ký hệ thống.']);
    }

    if ($action === 'reset_all') {
        $pdo->beginTransaction();
        $pdo->exec("DELETE FROM import_errors");
        $pdo->exec("DELETE FROM upload_history");
        $pdo->exec("DELETE FROM orders");
        $pdo->exec("DELETE FROM traffic_daily");
        $pdo->exec("DELETE FROM tiktok_connections");
        $pdo->exec("DELETE FROM lazada_connections");
        $pdo->exec("DELETE FROM shopee_connections");
        $pdo->exec("DELETE FROM app_settings");
        $pdo->exec("DELETE FROM app_logs");
        $pdo->exec("DELETE FROM users");
        ensure_default_admin_user($pdo, $config);
        $pdo->commit();
        log_activity('warning', 'admin', 'FULL RESET database bởi admin.');
        json_response(['success' => true, 'message' => 'Đã reset toàn bộ database và khôi phục tài khoản admin mặc định.']);
    }

    json_error('Unknown action.', 400);

} catch (\Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_exception($e, 'Thao tác admin thất bại.');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSystemInfo(PDO $pdo, array $config): array
{
    // DB stats
    $orderCount   = (int) $pdo->query("SELECT COUNT(*) FROM orders")->fetchColumn();
    $trafficCount = (int) $pdo->query("SELECT COUNT(*) FROM traffic_daily")->fetchColumn();
    $uploadCount  = (int) $pdo->query("SELECT COUNT(*) FROM upload_history")->fetchColumn();
    $logCount     = (int) $pdo->query("SELECT COUNT(*) FROM app_logs")->fetchColumn();
    $userCount    = (int) $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    $adminCount   = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
    $dbSize       = $pdo->query("
        SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2)
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
    ")->fetchColumn();

    // Platform breakdown
    $platformRows = $pdo->query("SELECT platform, COUNT(*) as cnt FROM orders GROUP BY platform")->fetchAll();
    $byPlatform   = [];
    foreach ($platformRows as $r) {
        $byPlatform[$r['platform']] = (int) $r['cnt'];
    }

    // PHP info
    $memBytes = parseInfoBytes(ini_get('memory_limit'));
    $memUsed  = memory_get_usage(true);
    $memPeak  = memory_get_peak_usage(true);

    // Disk space for upload dir
    $uploadPath = $config['app']['upload_path'] ?? __DIR__ . '/../uploads';
    $diskFree   = disk_free_space($uploadPath) ?: 0;
    $diskTotal  = disk_total_space($uploadPath) ?: 0;

    // Date range of orders
    $dateRange = $pdo->query("SELECT MIN(order_created_at), MAX(order_created_at) FROM orders")->fetch(PDO::FETCH_NUM);

    return [
        'php_version'     => PHP_VERSION,
        'php_sapi'        => PHP_SAPI,
        'memory_limit'    => ini_get('memory_limit'),
        'memory_used_mb'  => round($memUsed / 1024 / 1024, 1),
        'memory_peak_mb'  => round($memPeak / 1024 / 1024, 1),
        'upload_max'      => ini_get('upload_max_filesize'),
        'max_exec_time'   => ini_get('max_execution_time'),
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'unknown',
        'disk_free_gb'    => $diskFree > 0  ? round($diskFree  / 1073741824, 2) : null,
        'disk_total_gb'   => $diskTotal > 0 ? round($diskTotal / 1073741824, 2) : null,
        'db_size_mb'      => (float) ($dbSize ?? 0),
        'db_version'      => $pdo->query('SELECT VERSION()')->fetchColumn(),
        'order_count'     => $orderCount,
        'traffic_count'   => $trafficCount,
        'upload_count'    => $uploadCount,
        'log_count'       => $logCount,
        'user_count'      => $userCount,
        'admin_count'     => $adminCount,
        'by_platform'     => $byPlatform,
        'order_date_min'  => $dateRange[0] ?? null,
        'order_date_max'  => $dateRange[1] ?? null,
        'installed_at'    => file_exists(__DIR__ . '/../.installed')
            ? trim(file_get_contents(__DIR__ . '/../.installed'))
            : null,
        'timezone'        => $config['app']['timezone'] ?? date_default_timezone_get(),
        'server_time'     => date('Y-m-d H:i:s'),
    ];
}

function parseInfoBytes(string $val): int
{
    if ($val === '-1') return PHP_INT_MAX;
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
