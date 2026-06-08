<?php

declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

start_session();

$user = current_user();
if ($user === null) {
    header('Location: index.php');
    exit;
}
if (($user['role'] ?? '') !== 'admin') {
    http_response_code(403);
    echo '<!doctype html><meta charset="utf-8"><title>403</title><body style="font-family:Inter,sans-serif;padding:40px"><h2>403 — Chỉ quản trị viên mới truy cập được trang này.</h2><p><a href="index.php">Quay lại Dashboard</a></p></body>';
    exit;
}

$action = $_GET['action'] ?? '';

if ($action === 'download') {
    if (!hash_equals($_SESSION['csrf_token'] ?? '', (string) ($_GET['_csrf'] ?? ''))) {
        http_response_code(403);
        echo 'Invalid CSRF token.';
        exit;
    }

    stream_sql_dump($config);
    exit;
}

$csrf = generate_csrf();
$dbName = $config['db']['database'];

try {
    $pdo = db($config);
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

    $tableStats = [];
    foreach ($tables as $t) {
        $count = (int) $pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
        $tableStats[] = ['name' => $t, 'rows' => $count];
    }
} catch (\Throwable $e) {
    $tableStats = [];
    $error = $e->getMessage();
}

function stream_sql_dump(array $config): void
{
    $pdo = db($config);
    $dbName = $config['db']['database'];

    while (ob_get_level() > 0) {
        ob_end_clean();
    }

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
?>
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trích xuất Database — Dashboard v3</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:#f6f7f9;color:#1a1a1a;margin:0;padding:40px 20px;line-height:1.5}
    .wrap{max-width:760px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);padding:32px}
    h1{margin:0 0 8px;font-size:24px;font-weight:700}
    .sub{color:#6b7280;font-size:14px;margin-bottom:24px}
    .meta{display:flex;gap:24px;flex-wrap:wrap;padding:16px;background:#f9fafb;border-radius:8px;margin-bottom:20px;font-size:14px}
    .meta b{color:#111827}
    .meta span{color:#6b7280}
    table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px}
    th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #eef0f3}
    th{font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
    td.num{text-align:right;font-variant-numeric:tabular-nums;color:#374151}
    .actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;border:0;cursor:pointer;transition:.15s}
    .btn-primary{background:#111827;color:#fff}
    .btn-primary:hover{background:#1f2937}
    .btn-ghost{background:transparent;color:#6b7280}
    .btn-ghost:hover{color:#111827}
    .warn{padding:12px 14px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;border-radius:8px;font-size:13px;margin-bottom:20px}
    .err{padding:12px 14px;background:#fee2e2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;font-size:13px;margin-bottom:20px}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Trích xuất Database</h1>
    <div class="sub">Xuất toàn bộ database <code><?= htmlspecialchars($dbName) ?></code> ra file <code>.sql</code> (schema + dữ liệu). File có thể dùng để import lại vào MySQL/MariaDB.</div>

    <?php if (!empty($error)): ?>
      <div class="err">Lỗi kết nối database: <?= htmlspecialchars($error) ?></div>
    <?php else: ?>
      <div class="meta">
        <div><span>Database:</span> <b><?= htmlspecialchars($dbName) ?></b></div>
        <div><span>Số bảng:</span> <b><?= count($tableStats) ?></b></div>
        <div><span>Tổng số dòng:</span> <b><?= number_format(array_sum(array_column($tableStats, 'rows'))) ?></b></div>
      </div>

      <table>
        <thead><tr><th>Tên bảng</th><th style="text-align:right">Số dòng</th></tr></thead>
        <tbody>
          <?php foreach ($tableStats as $t): ?>
            <tr>
              <td><code><?= htmlspecialchars($t['name']) ?></code></td>
              <td class="num"><?= number_format($t['rows']) ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>

      <div class="warn">⚠️ File dump có thể chứa thông tin nhạy cảm (token API, mật khẩu hash, dữ liệu khách hàng). Hãy bảo quản cẩn thận.</div>

      <div class="actions">
        <a class="btn btn-primary" href="db-export.php?action=download&_csrf=<?= urlencode($csrf) ?>">
          ⬇ Tải file dump (.sql)
        </a>
        <a class="btn btn-ghost" href="index.php">← Quay lại Dashboard</a>
      </div>
    <?php endif; ?>
  </div>
</body>
</html>
