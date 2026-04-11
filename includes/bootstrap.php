<?php

declare(strict_types=1);

// Timezone
date_default_timezone_set('Asia/Ho_Chi_Minh');

// Error reporting (disable in production)
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// Autoloader
$autoload = __DIR__ . '/../vendor/autoload.php';
if (!file_exists($autoload)) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Dependencies not installed. Run: composer install']);
    exit;
}
require $autoload;

// Config
$config = require __DIR__ . '/../config.php';

// Helpers
require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';

// CORS for local dev
if (isset($_SERVER['HTTP_ORIGIN'])) {
    $origin = $_SERVER['HTTP_ORIGIN'];
    if (str_contains($origin, 'localhost') || str_contains($origin, '127.0.0.1')) {
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    }
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
