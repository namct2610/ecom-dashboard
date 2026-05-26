<?php

declare(strict_types=1);

// Beta v2.0.0 — UI thử nghiệm dùng chung database với production
// Auth gate: yêu cầu login giống production (cùng session)

require dirname(__DIR__) . '/includes/bootstrap.php';

// Cho phép xem nếu đã đăng nhập; nếu chưa thì redirect về login chính
$user = current_user();
if ($user === null) {
    header('Location: ../index.php');
    exit;
}

// Serve the React HTML inline. data.js.php sẽ tự kết nối DB qua bootstrap.
$html = file_get_contents(__DIR__ . '/Dashboard.html');
if ($html === false) {
    http_response_code(500);
    echo 'Beta UI not available.';
    exit;
}

// Inject auth context (username, isAdmin) + đổi script src data.js → data.js.php
$inject = '<script>window.__BETA__ = {username: ' . json_encode((string)($user['username'] ?? ''))
    . ', isAdmin: ' . ($user['role'] === 'admin' ? 'true' : 'false')
    . ', backUrl: "../index.php", versionLabel: "v2.0.0 Beta"};</script>';
$banner = <<<'HTML'
<style>
.beta-top-banner{position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff;
  font:600 12px/1.4 'Plus Jakarta Sans',system-ui,sans-serif;padding:6px 16px;display:flex;align-items:center;gap:12px;
  box-shadow:0 2px 8px rgba(0,0,0,.18);letter-spacing:.02em}
.beta-top-banner .beta-tag{background:rgba(255,255,255,.18);padding:2px 8px;border-radius:999px;font-size:11px}
.beta-top-banner a{color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.45);padding:3px 10px;border-radius:6px;
  font-size:11px;margin-left:auto;transition:background .15s}
.beta-top-banner a:hover{background:rgba(255,255,255,.18)}
body{padding-top:28px !important}
</style>
<div class="beta-top-banner">
  <span class="beta-tag">BETA</span>
  <span>Dashboard v2.0.0 — UI thử nghiệm, dùng chung database với production v1.4.x. Vui lòng phản hồi nếu phát hiện vấn đề.</span>
  <a href="../index.php">← Trở về bản chính thức</a>
</div>
HTML;
$html = str_replace('<script src="data.js"></script>', $inject . "\n" . '<script src="data.php"></script>', $html);
$html = str_replace('<div id="root"></div>', $banner . "\n" . '<div id="root"></div>', $html);

echo $html;
