<?php

declare(strict_types=1);

// Shared backend lives at repo root, /old/db-export.php → ../includes/...
require_once __DIR__ . '/../includes/bootstrap.php';

start_session();

$action = $_GET['action'] ?? 'stats';

if ($action === 'stats') {
    require_admin();

    $pdo = db($config);
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

    $stats = [];
    $totalRows = 0;
    foreach ($tables as $t) {
        $count = (int) $pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
        $totalRows += $count;
        $stats[] = ['name' => $t, 'rows' => $count];
    }

    json_response([
        'success'    => true,
        'database'   => $config['db']['database'],
        'tables'     => $stats,
        'total_rows' => $totalRows,
        'csrf'       => generate_csrf(),
    ]);
}

if ($action === 'download') {
    $user = current_user();
    if ($user === null || ($user['role'] ?? '') !== 'admin') {
        http_response_code(403);
        echo 'Forbidden.';
        exit;
    }

    $token = $_GET['_csrf'] ?? '';
    if (!is_string($token) || !hash_equals((string) ($_SESSION['csrf_token'] ?? ''), $token)) {
        http_response_code(403);
        echo 'Invalid CSRF token.';
        exit;
    }

    stream_sql_dump($config);
    exit;
}

json_error('Unknown action.', 400);

function stream_sql_dump(array $config): void
{
    $pdo = db($config);
    $dbName = $config['db']['database'];

    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    @set_time_limit(0);

    $filename = sprintf('%s_%s.sql', $dbName, date('Ymd_His'));
    header('Content-Type: application/sql; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');

    echo "-- ---------------------------------------------------------------\n";
    echo "-- Dashboard v3 — Database dump\n";
    echo "-- Database: {$dbName}\n";
    echo "-- Generated: " . date('Y-m-d H:i:s') . "\n";
    echo "-- ---------------------------------------------------------------\n\n";
    echo "SET NAMES utf8mb4;\n";
    echo "SET FOREIGN_KEY_CHECKS = 0;\n";
    echo "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n";
    echo "SET time_zone = '+07:00';\n\n";

    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

    foreach ($tables as $table) {
        echo "-- ------------------------------------\n";
        echo "-- Table structure for `{$table}`\n";
        echo "-- ------------------------------------\n";
        echo "DROP TABLE IF EXISTS `{$table}`;\n";

        $createRow = $pdo->query("SHOW CREATE TABLE `{$table}`")->fetch(PDO::FETCH_ASSOC);
        $createSql = $createRow['Create Table'] ?? $createRow['Create View'] ?? '';
        echo $createSql . ";\n\n";

        $rowCount = (int) $pdo->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();
        if ($rowCount === 0) {
            flush();
            continue;
        }

        echo "-- Data for `{$table}` ({$rowCount} rows)\n";

        $cols = $pdo->query("SELECT * FROM `{$table}` LIMIT 0");
        $colCount = $cols->columnCount();
        $colNames = [];
        for ($i = 0; $i < $colCount; $i++) {
            $meta = $cols->getColumnMeta($i);
            $colNames[] = '`' . $meta['name'] . '`';
        }
        $colList = implode(', ', $colNames);

        $stmt = $pdo->query("SELECT * FROM `{$table}`");
        $batchSize = 200;
        $batch = [];

        while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
            $vals = [];
            foreach ($row as $v) {
                if ($v === null) {
                    $vals[] = 'NULL';
                } elseif (is_int($v) || is_float($v)) {
                    $vals[] = (string) $v;
                } else {
                    $vals[] = $pdo->quote((string) $v);
                }
            }
            $batch[] = '(' . implode(',', $vals) . ')';

            if (count($batch) >= $batchSize) {
                echo "INSERT INTO `{$table}` ({$colList}) VALUES\n" . implode(",\n", $batch) . ";\n";
                $batch = [];
                flush();
            }
        }

        if ($batch !== []) {
            echo "INSERT INTO `{$table}` ({$colList}) VALUES\n" . implode(",\n", $batch) . ";\n";
        }

        echo "\n";
        flush();
    }

    echo "SET FOREIGN_KEY_CHECKS = 1;\n";
    echo "-- Dump completed at " . date('Y-m-d H:i:s') . "\n";

    log_activity('info', 'admin', 'Database dump exported', [
        'database' => $dbName,
        'tables'   => count($tables),
    ]);
}
