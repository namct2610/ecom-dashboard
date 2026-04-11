<?php

declare(strict_types=1);

use PhpOffice\PhpSpreadsheet\IOFactory;
use Dashboard\Parsers\ShopeeParser;
use Dashboard\Parsers\LazadaParser;
use Dashboard\Parsers\TiktokShopParser;
use Dashboard\Parsers\TrafficParser;

function db(array $config): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        try { $pdo->query('SELECT 1'); return $pdo; }
        catch (\PDOException $e) { $pdo = null; }
    }
    $db  = $config['db'];
    $dsn = "mysql:host={$db['host']};port={$db['port']};dbname={$db['database']};charset={$db['charset']}";
    $opts = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        1002 /* MYSQL_ATTR_INIT_COMMAND */ => "SET wait_timeout=28800, time_zone='+07:00', sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))",
    ];
    $pdo = new PDO($dsn, $db['username'], $db['password'], $opts);
    ensure_schema($pdo);
    return $pdo;
}

function ensure_schema(PDO $pdo): void
{
    $tables  = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $needed  = ['upload_history', 'orders', 'traffic_daily', 'import_errors', 'app_settings', 'app_logs', 'tiktok_connections', 'lazada_connections'];
    $missing = array_diff($needed, $tables);

    // Add data_type column if missing (migration)
    if (in_array('upload_history', $tables, true)) {
        $col = $pdo->query("SHOW COLUMNS FROM upload_history LIKE 'data_type'")->fetchAll();
        if (empty($col)) {
            $pdo->exec("ALTER TABLE upload_history ADD COLUMN data_type ENUM('orders','traffic') NOT NULL DEFAULT 'orders' AFTER platform");
        }
    }

    // Create tiktok_connections if missing
    if (!in_array('tiktok_connections', $tables, true)) {
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
    }

    // Create app_logs if missing (can happen on existing installs upgrading)
    if (!in_array('app_logs', $tables, true)) {
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
    }

    // Create lazada_connections if missing
    if (!in_array('lazada_connections', $tables, true)) {
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
    }

    $missing = array_diff($missing, ['app_logs', 'tiktok_connections', 'lazada_connections']); // already handled above
    if (empty($missing)) {
        return;
    }

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
}

// ── Upsert helpers ──────────────────────────────────────────────────────────

function upsert_order(PDO $pdo, array $row): void
{
    static $stmt;
    if (!$stmt) {
        $stmt = $pdo->prepare("
            INSERT INTO orders
                (platform, order_id, buyer_name, buyer_username, shipping_address,
                 shipping_district, shipping_city, payment_method, sku, product_name,
                 variation, quantity, unit_price, subtotal_before_discount, platform_discount,
                 seller_discount, subtotal_after_discount, order_total, shipping_fee,
                 platform_fee_fixed, platform_fee_service, platform_fee_payment,
                 normalized_status, original_status, order_created_at, order_paid_at,
                 order_completed_at, upload_id)
            VALUES
                (:platform, :order_id, :buyer_name, :buyer_username, :shipping_address,
                 :shipping_district, :shipping_city, :payment_method, :sku, :product_name,
                 :variation, :quantity, :unit_price, :subtotal_before_discount, :platform_discount,
                 :seller_discount, :subtotal_after_discount, :order_total, :shipping_fee,
                 :platform_fee_fixed, :platform_fee_service, :platform_fee_payment,
                 :normalized_status, :original_status, :order_created_at, :order_paid_at,
                 :order_completed_at, :upload_id)
            ON DUPLICATE KEY UPDATE
                buyer_name               = VALUES(buyer_name),
                shipping_address         = VALUES(shipping_address),
                shipping_district        = VALUES(shipping_district),
                shipping_city            = VALUES(shipping_city),
                payment_method           = VALUES(payment_method),
                product_name             = VALUES(product_name),
                variation                = VALUES(variation),
                quantity                 = VALUES(quantity),
                unit_price               = VALUES(unit_price),
                subtotal_before_discount = VALUES(subtotal_before_discount),
                platform_discount        = VALUES(platform_discount),
                seller_discount          = VALUES(seller_discount),
                subtotal_after_discount  = VALUES(subtotal_after_discount),
                order_total              = VALUES(order_total),
                shipping_fee             = VALUES(shipping_fee),
                platform_fee_fixed       = VALUES(platform_fee_fixed),
                platform_fee_service     = VALUES(platform_fee_service),
                platform_fee_payment     = VALUES(platform_fee_payment),
                normalized_status        = VALUES(normalized_status),
                original_status          = VALUES(original_status),
                order_paid_at            = VALUES(order_paid_at),
                order_completed_at       = VALUES(order_completed_at),
                upload_id                = VALUES(upload_id)
        ");
    }
    $stmt->execute([
        ':platform'                => $row['platform'],
        ':order_id'                => $row['order_id'],
        ':buyer_name'              => $row['buyer_name'] ?? null,
        ':buyer_username'          => $row['buyer_username'] ?? null,
        ':shipping_address'        => $row['shipping_address'] ?? null,
        ':shipping_district'       => $row['shipping_district'] ?? null,
        ':shipping_city'           => $row['shipping_city'] ?? null,
        ':payment_method'          => $row['payment_method'] ?? null,
        ':sku'                     => $row['sku'],
        ':product_name'            => $row['product_name'] ?? '',
        ':variation'               => $row['variation'] ?? null,
        ':quantity'                => $row['quantity'] ?? 1,
        ':unit_price'              => $row['unit_price'] ?? 0,
        ':subtotal_before_discount'=> $row['subtotal_before_discount'] ?? 0,
        ':platform_discount'       => $row['platform_discount'] ?? 0,
        ':seller_discount'         => $row['seller_discount'] ?? 0,
        ':subtotal_after_discount' => $row['subtotal_after_discount'] ?? 0,
        ':order_total'             => $row['order_total'] ?? 0,
        ':shipping_fee'            => $row['shipping_fee'] ?? 0,
        ':platform_fee_fixed'      => $row['platform_fee_fixed'] ?? 0,
        ':platform_fee_service'    => $row['platform_fee_service'] ?? 0,
        ':platform_fee_payment'    => $row['platform_fee_payment'] ?? 0,
        ':normalized_status'       => $row['normalized_status'],
        ':original_status'         => $row['original_status'] ?? '',
        ':order_created_at'        => $row['order_created_at'],
        ':order_paid_at'           => $row['order_paid_at'] ?? null,
        ':order_completed_at'      => $row['order_completed_at'] ?? null,
        ':upload_id'               => $row['upload_id'] ?? null,
    ]);
}

function upsert_traffic_daily(PDO $pdo, array $row): void
{
    static $stmt;
    if (!$stmt) {
        $stmt = $pdo->prepare("
            INSERT INTO traffic_daily
                (platform, traffic_date, device_type, page_views, avg_page_views,
                 avg_session_duration, bounce_rate, visits, new_visitors,
                 returning_visitors, new_followers, upload_id)
            VALUES
                (:platform, :traffic_date, :device_type, :page_views, :avg_page_views,
                 :avg_session_duration, :bounce_rate, :visits, :new_visitors,
                 :returning_visitors, :new_followers, :upload_id)
            ON DUPLICATE KEY UPDATE
                page_views            = VALUES(page_views),
                avg_page_views        = VALUES(avg_page_views),
                avg_session_duration  = VALUES(avg_session_duration),
                bounce_rate           = VALUES(bounce_rate),
                visits                = VALUES(visits),
                new_visitors          = VALUES(new_visitors),
                returning_visitors    = VALUES(returning_visitors),
                new_followers         = VALUES(new_followers),
                upload_id             = VALUES(upload_id)
        ");
    }
    $stmt->execute([
        ':platform'            => $row['platform'],
        ':traffic_date'        => $row['traffic_date'],
        ':device_type'         => $row['device_type'] ?? 'all',
        ':page_views'          => $row['page_views'] ?? 0,
        ':avg_page_views'      => $row['avg_page_views'] ?? 0,
        ':avg_session_duration'=> $row['avg_session_duration'] ?? 0,
        ':bounce_rate'         => $row['bounce_rate'] ?? 0,
        ':visits'              => $row['visits'] ?? 0,
        ':new_visitors'        => $row['new_visitors'] ?? 0,
        ':returning_visitors'  => $row['returning_visitors'] ?? 0,
        ':new_followers'       => $row['new_followers'] ?? 0,
        ':upload_id'           => $row['upload_id'] ?? null,
    ]);
}

function log_import_error(PDO $pdo, int $uploadId, int $rowNum, ?string $orderId, ?string $sku, string $code, string $msg, array $payload): void
{
    $stmt = $pdo->prepare("
        INSERT INTO import_errors (upload_id, `row_number`, raw_order_id, raw_sku, error_code, error_message, raw_payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$uploadId, $rowNum, $orderId, $sku, $code, $msg, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
}

function update_upload_history(PDO $pdo, int $id, string $status, array $stats = []): void
{
    $pdo->prepare("
        UPDATE upload_history
        SET status        = :status,
            total_rows    = :total,
            imported_rows = :imported,
            skipped_rows  = :skipped,
            error_message = :error,
            processed_at  = NOW()
        WHERE id = :id
    ")->execute([
        ':status'   => $status,
        ':total'    => $stats['total_rows'] ?? 0,
        ':imported' => $stats['imported_rows'] ?? 0,
        ':skipped'  => $stats['skipped_rows'] ?? 0,
        ':error'    => $stats['error_message'] ?? null,
        ':id'       => $id,
    ]);
}

function log_activity(string $level, string $category, string $message, array $context = []): void
{
    try {
        global $config;
        if (empty($config)) return;
        $pdo = db($config);
        $pdo->prepare(
            "INSERT INTO app_logs (level, category, message, context, request_uri, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)"
        )->execute([
            $level,
            $category,
            mb_substr($message, 0, 1000),
            empty($context) ? null : json_encode($context, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR),
            mb_substr($_SERVER['REQUEST_URI'] ?? '', 0, 500),
            $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    } catch (\Throwable $e) {
        // Never let logging break the main flow
    }
}

// ── Platform / Parser factory ───────────────────────────────────────────────

function detect_platform_from_file(string $filePath): string
{
    if (!class_exists(IOFactory::class)) {
        throw new \RuntimeException('PhpSpreadsheet not installed. Run: composer install');
    }
    $reader = IOFactory::createReaderForFile($filePath);
    $reader->setReadDataOnly(true);
    if (method_exists($reader, 'setReadEmptyCells')) {
        $reader->setReadEmptyCells(false);
    }
    $rows = $reader->load($filePath)->getSheet(0)->toArray(null, false, true, false);

    if (empty($rows)) {
        throw new \RuntimeException('File trống.');
    }

    // Collect first 3 rows as lowercase for matching
    $sample = [];
    for ($i = 0; $i < min(3, count($rows)); $i++) {
        $sample[$i] = array_map(
            static fn($v) => mb_strtolower(trim((string)($v ?? ''))),
            $rows[$i]
        );
    }

    $keywords = [
        'shopee'     => ['mã đơn hàng', 'ngày đặt hàng', 'phí cố định', 'mã giảm giá của shopee', 'người bán trợ giá'],
        'lazada'     => ['orderitemid', 'lazadaid', 'paidprice', 'orderNumber', 'ordernumber', 'sellerdisctotal'],
        'tiktokshop' => ['order id', 'order status', 'seller sku', 'sku unit original price', 'order substatus'],
    ];

    $scores = ['shopee' => 0, 'lazada' => 0, 'tiktokshop' => 0];
    foreach ($keywords as $platform => $kws) {
        $checkRows = $platform === 'tiktokshop' ? [0, 1] : [0];
        foreach ($kws as $kw) {
            foreach ($checkRows as $ri) {
                if (isset($sample[$ri])) {
                    foreach ($sample[$ri] as $h) {
                        if ($h !== '' && str_contains($h, $kw)) {
                            $scores[$platform]++;
                            break 2;
                        }
                    }
                }
            }
        }
    }

    arsort($scores);
    $best = (string) array_key_first($scores);
    if ($scores[$best] < 2) {
        throw new \RuntimeException('Không nhận diện được sàn. File phải chứa header của Shopee, Lazada hoặc TikTok Shop.');
    }
    return $best;
}

function is_traffic_file(string $filePath): bool
{
    try {
        $reader = IOFactory::createReaderForFile($filePath);
        $reader->setReadDataOnly(true);
        if (method_exists($reader, 'setReadEmptyCells')) {
            $reader->setReadEmptyCells(false);
        }
        $rows   = $reader->load($filePath)->getSheet(0)->toArray(null, false, true, false);
        $trafficSignals = ['lượt xem', 'lượt truy cập', 'tỉ lệ thoát', 'page views', 'visits', 'visitors', 'bounce rate', 'tổng quan dữ liệu', 'khách truy cập'];
        // Scan first 10 rows — Lazada places headers in row 5
        for ($i = 0; $i < min(10, count($rows)); $i++) {
            $line = implode(' ', array_map(
                static fn($v) => mb_strtolower(trim((string)($v ?? ''))),
                $rows[$i]
            ));
            foreach ($trafficSignals as $s) {
                if (str_contains($line, $s)) {
                    return true;
                }
            }
        }
    } catch (\Throwable $e) {
        // ignore
    }
    return false;
}

function create_order_parser(string $platform, string $filePath): object
{
    return match ($platform) {
        'shopee'     => new ShopeeParser($filePath),
        'lazada'     => new LazadaParser($filePath),
        'tiktokshop' => new TiktokShopParser($filePath),
        default      => throw new \RuntimeException("Unknown platform: $platform"),
    };
}

function create_traffic_parser(string $platform, string $filePath): object
{
    return new TrafficParser($filePath, $platform);
}
