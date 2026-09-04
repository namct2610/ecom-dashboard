<?php

declare(strict_types=1);

require dirname(__DIR__) . '/includes/SkuExpander.php';

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE reconcile_price_items (sku TEXT, product_name TEXT, brand TEXT, unit_price REAL)');
$pdo->exec('CREATE TABLE reconcile_combo_items (platform TEXT, combo_sku TEXT, single_sku TEXT, single_qty REAL)');
$pdo->exec("INSERT INTO reconcile_price_items VALUES
    ('SKU-A', 'Sản phẩm A', '', 100),
    ('SKU-B', 'Sản phẩm B', '', 200)");
$pdo->exec("INSERT INTO reconcile_combo_items VALUES
    ('shopee', 'COMBO-AB', 'SKU-A', 2),
    ('shopee', 'COMBO-AB', 'SKU-B', 1)");

$expanded = (new SkuExpander($pdo))->expandAndAggregate([
    ['sku' => 'COMBO-AB', 'product_name' => 'Combo AB', 'platform' => 'shopee', 'total_qty' => 3, 'total_revenue' => 900, 'order_count' => 2],
    ['sku' => 'SKU-A', 'product_name' => 'Sản phẩm A', 'platform' => 'shopee', 'total_qty' => 1, 'total_revenue' => 50, 'order_count' => 1],
]);
$bySku = array_column($expanded, null, 'sku');

$checks = [
    isset($bySku['SKU-A'], $bySku['SKU-B']),
    $bySku['SKU-A']['total_qty'] === 7,
    $bySku['SKU-B']['total_qty'] === 3,
    abs($bySku['SKU-A']['total_revenue'] - 500) < 0.01,
    abs($bySku['SKU-B']['total_revenue'] - 450) < 0.01,
    abs(array_sum(array_column($expanded, 'total_revenue')) - 950) < 0.01,
];

if (in_array(false, $checks, true)) {
    throw new RuntimeException('Quy đổi COMBO sang SKU lẻ không đúng.');
}

echo "OK — quy đổi COMBO giữ nguyên doanh thu và nhân đúng số lượng SKU lẻ.\n";
