<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

require_auth();

try {
    $pdo = db($config);
    $method = $_SERVER['REQUEST_METHOD'];

    // POST action=clear
    if ($method === 'POST') {
        require_csrf();
        $body   = (array) json_decode(file_get_contents('php://input'), true);
        $action = $body['action'] ?? '';

        if ($action === 'clear') {
            $level    = $body['level']    ?? '';
            $category = $body['category'] ?? '';

            $where  = 'WHERE 1=1';
            $params = [];
            if ($level && in_array($level, ['debug','info','warning','error','critical'], true)) {
                $where .= ' AND level = :level';
                $params[':level'] = $level;
            }
            if ($category) {
                $where .= ' AND category = :category';
                $params[':category'] = $category;
            }

            $pdo->prepare("DELETE FROM app_logs {$where}")->execute($params);
            log_activity('info', 'admin', 'Đã xoá log' . ($level ? " level={$level}" : '') . ($category ? " category={$category}" : ''));
            json_response(['success' => true]);
        }

        json_error('Unknown action.', 400);
    }

    require_method('GET');

    $page     = max(1, (int)($_GET['page']     ?? 1));
    $perPage  = min(200, max(10, (int)($_GET['per_page'] ?? 50)));
    $level    = $_GET['level']    ?? '';
    $category = $_GET['category'] ?? '';
    $search   = trim($_GET['search'] ?? '');

    $where  = 'WHERE 1=1';
    $params = [];

    if ($level && in_array($level, ['debug','info','warning','error','critical'], true)) {
        $where .= ' AND level = :level';
        $params[':level'] = $level;
    }
    if ($category && in_array($category, ['auth','upload','api','admin','app'], true)) {
        $where .= ' AND category = :category';
        $params[':category'] = $category;
    }
    if ($search !== '') {
        $where .= ' AND (message LIKE :search OR context LIKE :search2)';
        $params[':search']  = '%' . $search . '%';
        $params[':search2'] = '%' . $search . '%';
    }

    // Total count
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM app_logs {$where}");
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    // Stats by level
    $statsStmt = $pdo->query("SELECT level, COUNT(*) AS cnt FROM app_logs GROUP BY level");
    $stats = array_fill_keys(['debug','info','warning','error','critical'], 0);
    foreach ($statsStmt->fetchAll() as $r) {
        $stats[$r['level']] = (int)$r['cnt'];
    }

    // Rows
    $offset   = ($page - 1) * $perPage;
    $rowsStmt = $pdo->prepare(
        "SELECT id, level, category, message, context, request_uri, ip_address, created_at
         FROM app_logs {$where}
         ORDER BY id DESC
         LIMIT :limit OFFSET :offset"
    );
    foreach ($params as $k => $v) {
        $rowsStmt->bindValue($k, $v);
    }
    $rowsStmt->bindValue(':limit',  $perPage, PDO::PARAM_INT);
    $rowsStmt->bindValue(':offset', $offset,  PDO::PARAM_INT);
    $rowsStmt->execute();

    $rows = [];
    foreach ($rowsStmt->fetchAll() as $r) {
        $ctx = null;
        if ($r['context']) {
            $ctx = json_decode($r['context'], true);
        }
        $rows[] = [
            'id'          => (int)$r['id'],
            'level'       => $r['level'],
            'category'    => $r['category'],
            'message'     => $r['message'],
            'context'     => $ctx,
            'request_uri' => $r['request_uri'],
            'ip_address'  => $r['ip_address'],
            'created_at'  => $r['created_at'],
        ];
    }

    json_response([
        'success'  => true,
        'total'    => $total,
        'page'     => $page,
        'per_page' => $perPage,
        'pages'    => (int) ceil($total / $perPage),
        'stats'    => $stats,
        'rows'     => $rows,
    ]);

} catch (\Throwable $e) {
    json_exception($e, 'Không thể tải nhật ký.');
}
