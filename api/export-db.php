<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_admin();

// Data tables only — skip OAuth tokens, rate-limit, logs (can be huge)
const EXPORT_TABLES = [
    'orders',
    'traffic_daily',
    'upload_history',
    'app_settings',
    'users',
    'reconcile_price_items',
    'reconcile_combo_items',
    'sku_brand_rules',
];

// Stats-only GET request: return row counts without streaming a file
if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($_GET['action'] ?? '') === 'stats') {
    try {
        $pdo    = db($config);
        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $stats  = [];
        foreach (EXPORT_TABLES as $t) {
            if (in_array($t, $tables, true)) {
                $stats[$t] = (int) $pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
            }
        }
        json_response(['success' => true, 'stats' => $stats]);
    } catch (\Throwable $e) {
        json_exception($e, 'Không thể đọc thông tin database.');
    }
}

require_csrf();
require_method('POST');

@set_time_limit(300);
@ini_set('memory_limit', '512M');

try {
    $pdo     = db($config);
    $version = trim((string) @file_get_contents(dirname(__DIR__) . '/version.txt'));
    $dbName  = $config['db']['database'] ?? 'dashboard';
    $ts      = date('Y-m-d-His');
    $filename = "dashboard-db-{$ts}.sql";

    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    header('X-Export-Filename: ' . $filename);

    // Flush any output buffers so the stream starts immediately
    while (ob_get_level()) {
        ob_end_flush();
    }

    $line = static function (string $s = ''): void { echo $s . "\n"; };

    $line('-- ============================================================');
    $line('-- Dashboard DB Export');
    $line('-- Generated : ' . date('Y-m-d H:i:s'));
    $line('-- App       : ' . ($version ?: '—'));
    $line('-- Database  : ' . $dbName);
    $line('-- Tables    : ' . implode(', ', EXPORT_TABLES));
    $line('-- ============================================================');
    $line();
    $line('SET NAMES utf8mb4;');
    $line("SET time_zone = '+07:00';");
    $line('SET foreign_key_checks = 0;');
    $line("SET sql_mode = '';");
    $line();

    $existingTables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $toExport = array_values(array_intersect(EXPORT_TABLES, $existingTables));

    foreach ($toExport as $table) {
        $createRow = $pdo->query("SHOW CREATE TABLE `{$table}`")->fetch();
        $createSql = (string) ($createRow['Create Table'] ?? '');
        $rowCount  = (int) $pdo->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();

        $line('-- --------------------------------------------------------');
        $line("-- Table: `{$table}` ({$rowCount} rows)");
        $line('-- --------------------------------------------------------');
        $line();
        $line("DROP TABLE IF EXISTS `{$table}`;");
        $line($createSql . ';');
        $line();

        if ($rowCount === 0) {
            flush();
            continue;
        }

        $chunkSize = 500;
        $offset    = 0;

        while (true) {
            $stmt = $pdo->prepare("SELECT * FROM `{$table}` LIMIT :lim OFFSET :off");
            $stmt->bindValue(':lim', $chunkSize, PDO::PARAM_INT);
            $stmt->bindValue(':off', $offset,    PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll();

            if (!$rows) {
                break;
            }

            $cols     = array_map(static fn(string $c): string => "`{$c}`", array_keys($rows[0]));
            $colsList = implode(', ', $cols);

            $valueLines = [];
            foreach ($rows as $row) {
                $vals = array_map(static function ($val) use ($pdo): string {
                    return $val === null ? 'NULL' : $pdo->quote((string) $val);
                }, array_values($row));
                $valueLines[] = '  (' . implode(', ', $vals) . ')';
            }

            echo "INSERT INTO `{$table}` ({$colsList}) VALUES\n";
            echo implode(",\n", $valueLines) . ";\n";

            $offset += $chunkSize;
            flush();

            if (count($rows) < $chunkSize) {
                break;
            }
        }

        $line();
    }

    $line();
    $line('SET foreign_key_checks = 1;');
    $line('-- Export complete: ' . date('Y-m-d H:i:s'));
    flush();

    log_activity('info', 'admin', 'DB export downloaded', ['filename' => $filename]);
    exit;

} catch (\Throwable $e) {
    if (!headers_sent()) {
        json_exception($e, 'Không thể xuất database.');
    }
}
