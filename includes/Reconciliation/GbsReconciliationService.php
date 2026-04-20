<?php

declare(strict_types=1);

namespace Dashboard\Reconciliation;

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use RuntimeException;

final class GbsReconciliationService
{
    private const PLATFORM_KEYS = ['shopee', 'lazada', 'tiktokshop'];

    private const GBS_COLUMN_MAP = [
        'created_at'        => ['thời gian tạo'],
        'platform'          => ['nền tảng'],
        'product_type'      => ['loại sản phẩm'],
        'sku'               => ['sku'],
        'product_name'      => ['tên sản phẩm'],
        'status'            => ['trạng thái'],
        'order_id'          => ['mã đơn hàng'],
        'quantity'          => ['số lượng'],
        'gross_revenue'     => ['doanh thu'],
        'seller_voucher'    => ['mã giảm giá từ người bán'],
        'seller_discount'   => ['giảm giá từ người bán'],
        'platform_discount' => ['giảm giá từ nền tảng'],
        'other_discount'    => ['giảm giá khác'],
        'nmv'               => ['nmv'],
    ];

    private const SHOPEE_COLUMN_MAP = [
        'order_id'               => ['mã đơn hàng', 'order id'],
        'sku'                    => ['sku sản phẩm', 'mã sku', 'seller sku'],
        'product_name'           => ['tên sản phẩm', 'product name'],
        'quantity'               => ['số lượng'],
        'unit_price'             => ['giá gốc', 'đơn giá'],
        'seller_voucher'         => ['mã giảm giá của shop'],
        'seller_discount_total'  => ['tổng số tiền được người bán trợ giá'],
        'seller_discount_unit'   => ['người bán trợ giá', 'giảm giá người bán'],
        'status'                 => ['trạng thái đơn hàng', 'trạng thái'],
        'created_at'             => ['ngày đặt hàng', 'thời gian tạo đơn'],
    ];

    private const LAZADA_COLUMN_MAP = [
        'order_id'        => ['ordernumber', 'order number'],
        'sku'             => ['sellersku', 'seller sku'],
        'product_name'    => ['itemname', 'item name'],
        'unit_price'      => ['unitprice', 'unit price'],
        'seller_discount' => ['sellerdisctotal', 'seller discount total', 'sellerdiscounttotal'],
        'status'          => ['status'],
        'created_at'      => ['createtime', 'create time'],
    ];

    private const TIKTOK_COLUMN_MAP = [
        'order_id'         => ['order id'],
        'status'           => ['order status'],
        'sku'              => ['seller sku'],
        'product_name'     => ['product name'],
        'quantity'         => ['quantity'],
        'subtotal_before'  => ['sku subtotal before discount'],
        'seller_discount'  => ['sku seller discount'],
        'created_at'       => ['created time'],
    ];

    private string $baseDir;
    private ReconciliationFileStore $fileStore;

    public function __construct(string $baseDir, array $config = [])
    {
        $this->baseDir = rtrim($baseDir, DIRECTORY_SEPARATOR);
        $this->fileStore = new ReconciliationFileStore($this->baseDir, $config);
    }

    public function compare(): array
    {
        $files = $this->discoverFiles();
        if (($files['gbs']['status'] ?? 'missing') !== 'ready') {
            throw new RuntimeException('Không tìm thấy file GBS. Hãy upload vào kho đối soát hoặc đặt file tại thư mục gốc dự án.');
        }

        $gbsRows          = $this->loadGbsRows($files['gbs']['path']);
        $gbsGroupedByPlat = $this->groupGbsOrdersByPlatform($gbsRows);
        $files['gbs']     = $this->withFileStats($files['gbs'], count($gbsRows), $this->countGroupedOrders($gbsGroupedByPlat));

        $platformSummaries = [];
        $totals = [
            'platform_orders'       => 0,
            'gbs_orders'            => $this->countGroupedOrders($gbsGroupedByPlat),
            'common_orders'         => 0,
            'matched_orders'        => 0,
            'bundle_match_orders'   => 0,
            'mismatch_orders'       => 0,
            'missing_in_gbs'        => 0,
            'missing_in_platform'   => 0,
            'qty_mismatch_orders'   => 0,
            'nmv_mismatch_orders'   => 0,
        ];

        foreach (self::PLATFORM_KEYS as $platform) {
            $fileMeta = $files[$platform] ?? ['status' => 'missing'];
            $platformRows = [];

            if (($fileMeta['status'] ?? 'missing') === 'ready') {
                $platformRows = $this->loadPlatformRows($platform, $fileMeta['path']);
                $files[$platform] = $this->withFileStats($fileMeta, count($platformRows), count($this->groupPlatformOrders($platformRows)));
            }

            $comparison = $this->comparePlatform(
                $platform,
                $platformRows,
                $gbsGroupedByPlat[$platform] ?? []
            );

            $platformSummaries[$platform] = $comparison;
            $totals['platform_orders']     += $comparison['summary']['platform_orders'];
            $totals['common_orders']       += $comparison['summary']['common_orders'];
            $totals['matched_orders']      += $comparison['summary']['matched_orders'];
            $totals['bundle_match_orders'] += $comparison['summary']['bundle_match_orders'];
            $totals['mismatch_orders']     += $comparison['summary']['mismatch_orders'];
            $totals['missing_in_gbs']      += $comparison['summary']['missing_in_gbs'];
            $totals['missing_in_platform'] += $comparison['summary']['missing_in_platform'];
            $totals['qty_mismatch_orders'] += $comparison['summary']['qty_mismatch_orders'];
            $totals['nmv_mismatch_orders'] += $comparison['summary']['nmv_mismatch_orders'];
        }

        return [
            'success'      => true,
            'generated_at' => date('Y-m-d H:i:s'),
            'files'        => $this->sanitizeFiles($files),
            'summary'      => $totals,
            'mappings'     => $this->buildMappings(),
            'insights'     => $this->buildInsights($files, $platformSummaries),
            'platforms'    => $platformSummaries,
        ];
    }

    public function inspectSourceFile(string $sourceKey, string $path): array
    {
        if ($sourceKey === 'gbs') {
            $rows = $this->loadGbsRows($path);
            $groupedOrders = $this->groupGbsOrdersByPlatform($rows);

            return [
                'row_count'   => count($rows),
                'order_count' => $this->countGroupedOrders($groupedOrders),
            ];
        }

        if (!in_array($sourceKey, self::PLATFORM_KEYS, true)) {
            throw new RuntimeException('Loại file đối soát không hợp lệ.');
        }

        $rows = $this->loadPlatformRows($sourceKey, $path);

        return [
            'row_count'   => count($rows),
            'order_count' => count($this->groupPlatformOrders($rows)),
        ];
    }

    private function comparePlatform(string $platform, array $platformRows, array $gbsOrders): array
    {
        $platformOrders = $this->groupPlatformOrders($platformRows);
        $allOrderIds = array_values(array_unique(array_merge(array_keys($platformOrders), array_keys($gbsOrders))));

        $results = [];
        $summary = [
            'platform_orders'      => count($platformOrders),
            'gbs_orders'           => count($gbsOrders),
            'common_orders'        => 0,
            'matched_orders'       => 0,
            'bundle_match_orders'  => 0,
            'mismatch_orders'      => 0,
            'missing_in_gbs'       => 0,
            'missing_in_platform'  => 0,
            'qty_mismatch_orders'  => 0,
            'nmv_mismatch_orders'  => 0,
        ];

        foreach ($allOrderIds as $orderId) {
            $platformOrder = $platformOrders[$orderId] ?? null;
            $gbsOrder      = $gbsOrders[$orderId] ?? null;

            if ($platformOrder === null) {
                $summary['missing_in_platform']++;
                $results[] = $this->buildMissingResult($platform, $orderId, $gbsOrder, 'missing_in_platform');
                continue;
            }

            if ($gbsOrder === null) {
                $summary['missing_in_gbs']++;
                $results[] = $this->buildMissingResult($platform, $orderId, $platformOrder, 'missing_in_gbs');
                continue;
            }

            $summary['common_orders']++;

            $qtyDiff = round($gbsOrder['total_qty'] - $platformOrder['total_qty'], 4);
            $nmvDiff = round($gbsOrder['total_nmv'] - $platformOrder['total_nmv'], 2);
            $qtyMatch = abs($qtyDiff) < 0.001;
            $nmvMatch = abs($nmvDiff) < 0.05;
            $skuAligned = $this->skuMapsEqual($gbsOrder['sku_map'], $platformOrder['sku_map']);
            $hasBundle = $platformOrder['has_bundle'];

            if (!$qtyMatch) {
                $summary['qty_mismatch_orders']++;
            }
            if (!$nmvMatch) {
                $summary['nmv_mismatch_orders']++;
            }

            $status = 'mismatch';
            if ($qtyMatch && $nmvMatch && $skuAligned) {
                $status = 'matched';
                $summary['matched_orders']++;
            } elseif ($qtyMatch && $nmvMatch && $hasBundle) {
                $status = 'bundle_match';
                $summary['bundle_match_orders']++;
            } elseif ($qtyMatch && $nmvMatch) {
                $status = 'order_match';
                $summary['matched_orders']++;
            } else {
                $summary['mismatch_orders']++;
            }

            $results[] = [
                'order_id'            => (string) $orderId,
                'platform'            => $platform,
                'status'              => $status,
                'qty_match'           => $qtyMatch,
                'nmv_match'           => $nmvMatch,
                'sku_aligned'         => $skuAligned,
                'has_bundle'          => $hasBundle,
                'gbs_qty'             => $this->roundNumber($gbsOrder['total_qty'], 4),
                'platform_qty'        => $this->roundNumber($platformOrder['total_qty'], 4),
                'qty_diff'            => $qtyDiff,
                'gbs_nmv'             => $this->roundNumber($gbsOrder['total_nmv'], 2),
                'platform_nmv'        => $this->roundNumber($platformOrder['total_nmv'], 2),
                'nmv_diff'            => $nmvDiff,
                'gbs_line_count'      => $gbsOrder['line_count'],
                'platform_line_count' => $platformOrder['line_count'],
                'gbs_statuses'        => $gbsOrder['statuses'],
                'platform_statuses'   => $platformOrder['statuses'],
                'gbs_skus'            => $gbsOrder['sku_items'],
                'platform_skus'       => $platformOrder['sku_items'],
                'note'                => $this->buildMatchNote($status, $qtyMatch, $nmvMatch, $hasBundle),
            ];
        }

        usort($results, function (array $left, array $right): int {
            $weights = [
                'missing_in_gbs'      => 0,
                'missing_in_platform' => 1,
                'mismatch'            => 2,
                'bundle_match'        => 3,
                'order_match'         => 4,
                'matched'             => 5,
            ];

            $leftWeight  = $weights[$left['status']] ?? 99;
            $rightWeight = $weights[$right['status']] ?? 99;
            if ($leftWeight !== $rightWeight) {
                return $leftWeight <=> $rightWeight;
            }

            return strcmp((string) $left['order_id'], (string) $right['order_id']);
        });

        return [
            'summary' => $summary,
            'orders'  => $results,
        ];
    }

    private function buildMissingResult(string $platform, string|int $orderId, ?array $order, string $status): array
    {
        $isMissingInGbs = $status === 'missing_in_gbs';
        $source = $order ?? $this->emptyOrderGroup();
        $orderId = (string) $orderId;

        return [
                'order_id'            => (string) $orderId,
            'platform'            => $platform,
            'status'              => $status,
            'qty_match'           => false,
            'nmv_match'           => false,
            'sku_aligned'         => false,
            'has_bundle'          => $source['has_bundle'] ?? false,
            'gbs_qty'             => $isMissingInGbs ? 0.0 : $this->roundNumber($source['total_qty'], 4),
            'platform_qty'        => $isMissingInGbs ? $this->roundNumber($source['total_qty'], 4) : 0.0,
            'qty_diff'            => $isMissingInGbs ? -$this->roundNumber($source['total_qty'], 4) : $this->roundNumber($source['total_qty'], 4),
            'gbs_nmv'             => $isMissingInGbs ? 0.0 : $this->roundNumber($source['total_nmv'], 2),
            'platform_nmv'        => $isMissingInGbs ? $this->roundNumber($source['total_nmv'], 2) : 0.0,
            'nmv_diff'            => $isMissingInGbs ? -$this->roundNumber($source['total_nmv'], 2) : $this->roundNumber($source['total_nmv'], 2),
            'gbs_line_count'      => $isMissingInGbs ? 0 : ($source['line_count'] ?? 0),
            'platform_line_count' => $isMissingInGbs ? ($source['line_count'] ?? 0) : 0,
            'gbs_statuses'        => $isMissingInGbs ? [] : ($source['statuses'] ?? []),
            'platform_statuses'   => $isMissingInGbs ? ($source['statuses'] ?? []) : [],
            'gbs_skus'            => $isMissingInGbs ? [] : ($source['sku_items'] ?? []),
            'platform_skus'       => $isMissingInGbs ? ($source['sku_items'] ?? []) : [],
            'note'                => $isMissingInGbs
                ? 'Đơn có trong file sàn nhưng không tìm thấy ở GBS.'
                : 'Đơn có trong GBS nhưng không thấy trong file sàn hiện tại.',
        ];
    }

    private function groupGbsOrdersByPlatform(array $rows): array
    {
        $grouped = [];
        foreach ($rows as $row) {
            $platform = $row['platform'];
            $orderId  = $row['order_id'];

            if (!isset($grouped[$platform][$orderId])) {
                $grouped[$platform][$orderId] = $this->emptyOrderGroup();
            }

            $skuKey = $this->normalizeSkuKey($row['sku']);
            $grouped[$platform][$orderId]['total_qty'] += $row['quantity'];
            $grouped[$platform][$orderId]['total_nmv'] += $row['nmv'];
            $grouped[$platform][$orderId]['line_count']++;
            $grouped[$platform][$orderId]['statuses'][$row['status']] = $row['status'];
            $grouped[$platform][$orderId]['sku_map'][$skuKey] = ($grouped[$platform][$orderId]['sku_map'][$skuKey] ?? 0) + $row['quantity'];
            $grouped[$platform][$orderId]['sku_items'][] = [
                'sku'       => $row['sku'],
                'quantity'  => $this->roundNumber($row['quantity'], 4),
                'nmv'       => $this->roundNumber($row['nmv'], 2),
                'type'      => $row['product_type'],
                'name'      => $row['product_name'],
            ];
        }

        return $this->finalizeGroupedOrders($grouped);
    }

    private function groupPlatformOrders(array $rows): array
    {
        $grouped = [];
        foreach ($rows as $row) {
            $orderId = $row['order_id'];
            if (!isset($grouped[$orderId])) {
                $grouped[$orderId] = $this->emptyOrderGroup();
            }

            $skuKey = $this->normalizeSkuKey($row['comparison_sku'], $row['combo_multiplier']);
            $grouped[$orderId]['total_qty'] += $row['comparable_qty'];
            $grouped[$orderId]['total_nmv'] += $row['comparable_nmv'];
            $grouped[$orderId]['line_count']++;
            $grouped[$orderId]['has_bundle'] = $grouped[$orderId]['has_bundle'] || ($row['combo_multiplier'] > 1);
            $grouped[$orderId]['statuses'][$row['status']] = $row['status'];
            $grouped[$orderId]['sku_map'][$skuKey] = ($grouped[$orderId]['sku_map'][$skuKey] ?? 0) + $row['comparable_qty'];
            $grouped[$orderId]['sku_items'][] = [
                'sku'              => $row['sku'],
                'comparison_sku'   => $row['comparison_sku'],
                'quantity'         => $this->roundNumber($row['raw_qty'], 4),
                'comparable_qty'   => $this->roundNumber($row['comparable_qty'], 4),
                'comparable_nmv'   => $this->roundNumber($row['comparable_nmv'], 2),
                'combo_multiplier' => $row['combo_multiplier'],
                'name'             => $row['product_name'],
            ];
        }

        foreach ($grouped as $orderId => &$order) {
            $order['statuses'] = array_values($order['statuses']);
        }
        unset($order);

        return $grouped;
    }

    private function finalizeGroupedOrders(array $grouped): array
    {
        foreach ($grouped as $platform => &$orders) {
            foreach ($orders as &$order) {
                $order['statuses'] = array_values($order['statuses']);
            }
            unset($order);
        }
        unset($orders);

        return $grouped;
    }

    private function emptyOrderGroup(): array
    {
        return [
            'total_qty'  => 0.0,
            'total_nmv'  => 0.0,
            'line_count' => 0,
            'has_bundle' => false,
            'statuses'   => [],
            'sku_map'    => [],
            'sku_items'  => [],
        ];
    }

    private function loadGbsRows(string $path): array
    {
        $sheet   = $this->loadSheet($path, 'Defaut', 1);
        $rows    = $sheet->toArray(null, false, true, false);
        $headers = array_map(static fn($value) => (string) ($value ?? ''), $rows[1] ?? []);
        $col     = $this->resolveColumns($headers, self::GBS_COLUMN_MAP);
        $this->assertRequiredColumns($col, [
            'platform'  => 'Nền tảng',
            'order_id'  => 'Mã đơn hàng',
            'sku'       => 'SKU',
            'quantity'  => 'Số lượng',
            'nmv'       => 'NMV',
        ], 'GBS');
        $result  = [];

        foreach ($rows as $index => $row) {
            if ($index <= 1 || $this->isEmptyRow($row)) {
                continue;
            }

            $orderId  = trim((string) ($row[$col['order_id'] ?? -1] ?? ''));
            $platform = $this->normalizeGbsPlatform((string) ($row[$col['platform'] ?? -1] ?? ''));
            if ($orderId === '' || $platform === null) {
                continue;
            }

            $result[] = [
                'platform'       => $platform,
                'order_id'       => $orderId,
                'sku'            => trim((string) ($row[$col['sku'] ?? -1] ?? '')),
                'product_name'   => trim((string) ($row[$col['product_name'] ?? -1] ?? '')),
                'product_type'   => trim((string) ($row[$col['product_type'] ?? -1] ?? '')),
                'status'         => trim((string) ($row[$col['status'] ?? -1] ?? '')),
                'created_at'     => trim((string) ($row[$col['created_at'] ?? -1] ?? '')),
                'quantity'       => $this->parseNumber($row[$col['quantity'] ?? -1] ?? null),
                'gross_revenue'  => $this->parseNumber($row[$col['gross_revenue'] ?? -1] ?? null),
                'seller_voucher' => $this->parseNumber($row[$col['seller_voucher'] ?? -1] ?? null),
                'seller_discount'=> $this->parseNumber($row[$col['seller_discount'] ?? -1] ?? null),
                'nmv'            => $this->parseNumber($row[$col['nmv'] ?? -1] ?? null),
            ];
        }

        return $result;
    }

    private function loadPlatformRows(string $platform, string $path): array
    {
        return match ($platform) {
            'shopee'     => $this->loadShopeeRows($path),
            'lazada'     => $this->loadLazadaRows($path),
            'tiktokshop' => $this->loadTiktokRows($path),
            default      => throw new RuntimeException("Unsupported platform: {$platform}"),
        };
    }

    private function loadShopeeRows(string $path): array
    {
        $sheet   = $this->loadSheet($path);
        $rows    = $sheet->toArray(null, false, true, false);
        $headers = array_map(static fn($value) => (string) ($value ?? ''), $rows[0] ?? []);
        $col     = $this->resolveColumns($headers, self::SHOPEE_COLUMN_MAP);
        $this->assertRequiredColumns($col, [
            'order_id'   => 'Mã đơn hàng',
            'sku'        => 'SKU sản phẩm',
            'quantity'   => 'Số lượng',
            'unit_price' => 'Giá gốc',
        ], 'Shopee');
        $result  = [];

        foreach ($rows as $index => $row) {
            if ($index === 0 || $this->isEmptyRow($row)) {
                continue;
            }

            $orderId = trim((string) ($row[$col['order_id'] ?? -1] ?? ''));
            $sku     = trim((string) ($row[$col['sku'] ?? -1] ?? ''));
            if ($orderId === '' || $sku === '') {
                continue;
            }

            $qty = max(0.0, $this->parseNumber($row[$col['quantity'] ?? -1] ?? null));
            $unitPrice = $this->parseNumber($row[$col['unit_price'] ?? -1] ?? null);
            $sellerVoucher = $this->parseNumber($row[$col['seller_voucher'] ?? -1] ?? null);
            $sellerDiscountTotal = $this->parseNumber($row[$col['seller_discount_total'] ?? -1] ?? null);
            if ($sellerDiscountTotal === 0.0) {
                $sellerDiscountTotal = $this->parseNumber($row[$col['seller_discount_unit'] ?? -1] ?? null) * $qty;
            }

            $productName = trim((string) ($row[$col['product_name'] ?? -1] ?? ''));
            $comboMultiplier = $this->comboMultiplierFromName($productName);
            $comparableNmv = max(0.0, ($unitPrice * $qty) - $sellerVoucher - $sellerDiscountTotal);

            $result[] = [
                'order_id'         => $orderId,
                'sku'              => $sku,
                'comparison_sku'   => $sku,
                'product_name'     => $productName,
                'status'           => trim((string) ($row[$col['status'] ?? -1] ?? '')),
                'created_at'       => trim((string) ($row[$col['created_at'] ?? -1] ?? '')),
                'raw_qty'          => $qty,
                'comparable_qty'   => $qty * $comboMultiplier,
                'comparable_nmv'   => $comparableNmv,
                'combo_multiplier' => $comboMultiplier,
            ];
        }

        return $result;
    }

    private function loadLazadaRows(string $path): array
    {
        $sheet   = $this->loadSheet($path);
        $rows    = $sheet->toArray(null, false, true, false);
        $headers = array_map(static fn($value) => (string) ($value ?? ''), $rows[0] ?? []);
        $col     = $this->resolveColumns($headers, self::LAZADA_COLUMN_MAP);
        $this->assertRequiredColumns($col, [
            'order_id'     => 'orderNumber',
            'sku'          => 'sellerSku',
            'product_name' => 'itemName',
            'unit_price'   => 'unitPrice',
        ], 'Lazada');
        $result  = [];

        foreach ($rows as $index => $row) {
            if ($index === 0 || $this->isEmptyRow($row)) {
                continue;
            }

            $orderId = trim((string) ($row[$col['order_id'] ?? -1] ?? ''));
            $sku     = trim((string) ($row[$col['sku'] ?? -1] ?? ''));
            if ($orderId === '' || $sku === '') {
                continue;
            }

            $productName = trim((string) ($row[$col['product_name'] ?? -1] ?? ''));
            $comboMultiplier = $this->comboMultiplierFromName($productName);
            $unitPrice = $this->parseNumber($row[$col['unit_price'] ?? -1] ?? null);
            $sellerDiscount = abs($this->parseNumber($row[$col['seller_discount'] ?? -1] ?? null));

            $result[] = [
                'order_id'         => $orderId,
                'sku'              => $sku,
                'comparison_sku'   => $sku,
                'product_name'     => $productName,
                'status'           => trim((string) ($row[$col['status'] ?? -1] ?? '')),
                'created_at'       => trim((string) ($row[$col['created_at'] ?? -1] ?? '')),
                'raw_qty'          => 1.0,
                'comparable_qty'   => (float) $comboMultiplier,
                'comparable_nmv'   => max(0.0, $unitPrice - $sellerDiscount),
                'combo_multiplier' => $comboMultiplier,
            ];
        }

        return $result;
    }

    private function loadTiktokRows(string $path): array
    {
        $sheet   = $this->loadSheet($path);
        $rows    = $sheet->toArray(null, false, true, false);
        $headers = array_map(static fn($value) => (string) ($value ?? ''), $rows[0] ?? []);
        $col     = $this->resolveColumns($headers, self::TIKTOK_COLUMN_MAP);
        $this->assertRequiredColumns($col, [
            'order_id'        => 'Order ID',
            'sku'             => 'Seller SKU',
            'quantity'        => 'Quantity',
            'subtotal_before' => 'SKU Subtotal Before Discount',
        ], 'TikTok Shop');
        $result  = [];

        foreach ($rows as $index => $row) {
            if ($index <= 1 || $this->isEmptyRow($row)) {
                continue;
            }

            $orderId = trim((string) ($row[$col['order_id'] ?? -1] ?? ''));
            $sku     = trim((string) ($row[$col['sku'] ?? -1] ?? ''));
            if ($orderId === '' || $sku === '') {
                continue;
            }

            $productName = trim((string) ($row[$col['product_name'] ?? -1] ?? ''));
            $qty = max(0.0, $this->parseNumber($row[$col['quantity'] ?? -1] ?? null));
            $comboMultiplier = $this->comboMultiplierFromName($productName);
            $subtotalBefore = $this->parseNumber($row[$col['subtotal_before'] ?? -1] ?? null);
            $sellerDiscount = $this->parseNumber($row[$col['seller_discount'] ?? -1] ?? null);

            $result[] = [
                'order_id'         => $orderId,
                'sku'              => $sku,
                'comparison_sku'   => preg_replace('/-[A-Z0-9]+$/', '', $sku) ?? $sku,
                'product_name'     => $productName,
                'status'           => trim((string) ($row[$col['status'] ?? -1] ?? '')),
                'created_at'       => trim((string) ($row[$col['created_at'] ?? -1] ?? '')),
                'raw_qty'          => $qty,
                'comparable_qty'   => $qty * $comboMultiplier,
                'comparable_nmv'   => max(0.0, $subtotalBefore - $sellerDiscount),
                'combo_multiplier' => $comboMultiplier,
            ];
        }

        return $result;
    }

    private function loadSheet(string $path, ?string $preferredName = null, int $fallbackIndex = 0): Worksheet
    {
        $reader = IOFactory::createReaderForFile($path);
        $reader->setReadDataOnly(true);
        if (method_exists($reader, 'setReadEmptyCells')) {
            $reader->setReadEmptyCells(false);
        }

        $spreadsheet = $reader->load($path);
        if ($preferredName !== null) {
            $sheet = $spreadsheet->getSheetByName($preferredName);
            if ($sheet instanceof Worksheet) {
                return $sheet;
            }
        }

        if ($fallbackIndex >= 0 && $fallbackIndex < $spreadsheet->getSheetCount()) {
            return $spreadsheet->getSheet($fallbackIndex);
        }

        return $spreadsheet->getActiveSheet();
    }

    private function discoverFiles(): array
    {
        $managedFiles = $this->fileStore->listFiles();

        return [
            'gbs'        => $this->preferManagedFile($managedFiles['gbs'] ?? ['status' => 'missing'], ['GBS*.xlsx', 'GBS*.xls']),
            'shopee'     => $this->preferManagedFile($managedFiles['shopee'] ?? ['status' => 'missing'], ['Shopee*.xlsx', 'Shopee*.xls', 'shopee*.xlsx', 'shopee*.xls']),
            'lazada'     => $this->preferManagedFile($managedFiles['lazada'] ?? ['status' => 'missing'], ['Lazada*.xlsx', 'Lazada*.xls', 'lazada*.xlsx', 'lazada*.xls']),
            'tiktokshop' => $this->preferManagedFile($managedFiles['tiktokshop'] ?? ['status' => 'missing'], ['TiktokShop*.xlsx', 'TiktokShop*.xls', 'TikTokShop*.xlsx', 'TikTokShop*.xls', 'tiktok*.xlsx', 'tiktok*.xls']),
        ];
    }

    private function preferManagedFile(array $managedFile, array $legacyPatterns): array
    {
        if (($managedFile['status'] ?? 'missing') === 'ready') {
            return $managedFile;
        }

        return $this->discoverLegacyFile($legacyPatterns);
    }

    private function discoverLegacyFile(array $patterns): array
    {
        $candidates = [];
        foreach ($patterns as $pattern) {
            foreach (glob($this->baseDir . DIRECTORY_SEPARATOR . $pattern) ?: [] as $path) {
                if (is_file($path)) {
                    $candidates[$path] = filemtime($path) ?: 0;
                }
            }
        }

        if ($candidates === []) {
            return ['status' => 'missing'];
        }

        arsort($candidates);
        $path = (string) array_key_first($candidates);

        return [
            'status'      => 'ready',
            'path'        => $path,
            'filename'    => basename($path),
            'size_bytes'  => filesize($path) ?: 0,
            'modified_at' => date('Y-m-d H:i:s', filemtime($path) ?: time()),
            'source'      => 'legacy_root',
            'source_label'=> 'Thư mục gốc',
            'deletable'   => false,
        ];
    }

    private function withFileStats(array $file, int $rowCount, int $orderCount): array
    {
        $file['row_count']   = $rowCount;
        $file['order_count'] = $orderCount;
        return $file;
    }

    private function sanitizeFiles(array $files): array
    {
        $result = [];
        foreach ($files as $key => $file) {
            $entry = $file;
            unset($entry['path']);
            $entry['size_label'] = $entry['size_label'] ?? $this->formatBytes((int) ($entry['size_bytes'] ?? 0));
            $result[$key] = $entry;
        }
        return $result;
    }

    private function assertRequiredColumns(array $resolved, array $labels, string $fileLabel): void
    {
        $missing = [];
        foreach ($labels as $field => $label) {
            if (($resolved[$field] ?? null) === null) {
                $missing[] = $label;
            }
        }

        if ($missing !== []) {
            throw new RuntimeException(sprintf(
                'File %s thiếu cột bắt buộc: %s.',
                $fileLabel,
                implode(', ', $missing)
            ));
        }
    }

    private function buildMappings(): array
    {
        return [
            'shopee' => [
                ['field' => 'order_id', 'gbs' => 'Mã đơn hàng', 'platform' => 'Mã đơn hàng', 'rule' => 'Khớp trực tiếp theo đơn.'],
                ['field' => 'sku', 'gbs' => 'sku', 'platform' => 'SKU sản phẩm', 'rule' => 'Dùng để tham chiếu; combo có thể bị GBS tách nhỏ.'],
                ['field' => 'quantity', 'gbs' => 'Số lượng', 'platform' => 'Số lượng', 'rule' => 'So sánh theo tổng số lượng quy đổi của đơn.'],
                ['field' => 'nmv', 'gbs' => 'NMV', 'platform' => 'Giá gốc x Số lượng - Mã giảm giá của Shop - Tổng số tiền được người bán trợ giá', 'rule' => 'Công thức suy ra để khớp logic GBS.'],
            ],
            'lazada' => [
                ['field' => 'order_id', 'gbs' => 'Mã đơn hàng', 'platform' => 'orderNumber', 'rule' => 'Khớp trực tiếp theo đơn.'],
                ['field' => 'sku', 'gbs' => 'sku', 'platform' => 'sellerSku', 'rule' => 'Nhiều SKU combo được GBS tách thành SKU thành phần.'],
                ['field' => 'quantity', 'gbs' => 'Số lượng', 'platform' => '1 dòng = 1 item, nhân thêm hệ số COMBO trong tên sản phẩm', 'rule' => 'Dùng số lượng quy đổi để so sánh.'],
                ['field' => 'nmv', 'gbs' => 'NMV', 'platform' => 'unitPrice - |sellerDiscountTotal|', 'rule' => 'Bỏ qua shipping và platform discount để khớp GBS.'],
            ],
            'tiktokshop' => [
                ['field' => 'order_id', 'gbs' => 'Mã đơn hàng', 'platform' => 'Order ID', 'rule' => 'Khớp trực tiếp theo đơn.'],
                ['field' => 'sku', 'gbs' => 'sku', 'platform' => 'Seller SKU', 'rule' => 'Bỏ suffix vùng; combo có thể bị GBS tách nhỏ.'],
                ['field' => 'quantity', 'gbs' => 'Số lượng', 'platform' => 'Quantity x hệ số COMBO trong tên sản phẩm', 'rule' => 'Dùng số lượng quy đổi để so sánh.'],
                ['field' => 'nmv', 'gbs' => 'NMV', 'platform' => 'SKU Subtotal Before Discount - SKU Seller Discount', 'rule' => 'Giữ platform discount bên ngoài để khớp logic GBS.'],
            ],
        ];
    }

    private function buildInsights(array $files, array $platforms): array
    {
        $insights = [
            'GBS chuẩn hóa giá trị nền tảng từ `shopee_v2`, `lazada`, `tiktok` thành `shopee`, `lazada`, `tiktokshop` để so khớp.',
            'Đối soát ưu tiên cấp đơn hàng (`platform + order_id`) vì GBS thường tách SKU combo thành SKU cơ sở.',
            'NMV quy đổi ở file sàn được tính theo phần giảm giá của người bán; platform discount không trừ thêm để bám cách tính trong GBS.',
        ];

        if (($files['shopee']['row_count'] ?? 0) === 0 && ($files['shopee']['status'] ?? '') === 'ready') {
            $insights[] = 'File Shopee hiện chỉ có header, chưa có dòng dữ liệu đơn hàng nên mọi đơn Shopee trong GBS sẽ được xem là thiếu phía file sàn.';
        }

        foreach (self::PLATFORM_KEYS as $platform) {
            $bundleMatches = (int) ($platforms[$platform]['summary']['bundle_match_orders'] ?? 0);
            if ($bundleMatches > 0) {
                $insights[] = sprintf(
                    '%s có %d đơn khớp ở cấp đơn nhưng cần quy đổi combo trước khi so số lượng và SKU.',
                    $this->platformLabel($platform),
                    $bundleMatches
                );
            }
        }

        return $insights;
    }

    private function resolveColumns(array $headers, array $columnMap): array
    {
        $resolved = [];
        $normalizedHeaders = [];
        foreach ($headers as $index => $header) {
            $normalizedHeaders[$index] = $this->normalizeHeader((string) ($header ?? ''));
        }

        foreach ($columnMap as $field => $candidates) {
            $match = null;

            foreach ($candidates as $candidate) {
                $candidateN = $this->normalizeHeader($candidate);
                foreach ($normalizedHeaders as $index => $headerN) {
                    if ($headerN === $candidateN) {
                        $match = $index;
                        break 2;
                    }
                }
            }

            if ($match === null) {
                foreach ($candidates as $candidate) {
                    $candidateN = $this->normalizeHeader($candidate);
                    foreach ($normalizedHeaders as $index => $headerN) {
                        if ($candidateN !== '' && $headerN !== '' && str_contains($headerN, $candidateN)) {
                            $match = $index;
                            break 2;
                        }
                    }
                }
            }

            $resolved[$field] = $match;
        }

        return $resolved;
    }

    private function normalizeHeader(string $value): string
    {
        $value = trim(mb_strtolower($value));
        if (class_exists('\Normalizer')) {
            $normalized = \Normalizer::normalize($value, \Normalizer::FORM_C);
            if ($normalized !== false) {
                $value = $normalized;
            }
        }
        return preg_replace('/\s+/u', ' ', $value) ?? $value;
    }

    private function normalizeGbsPlatform(string $platform): ?string
    {
        $value = trim(mb_strtolower($platform));
        return match ($value) {
            'shopee', 'shopee_v2' => 'shopee',
            'lazada'              => 'lazada',
            'tiktok', 'tiktokshop' => 'tiktokshop',
            default               => null,
        };
    }

    private function comboMultiplierFromName(string $productName): int
    {
        $normalized = mb_strtolower($productName);
        if (preg_match('/combo[^\d]{0,12}(\d+)/u', $normalized, $matches) === 1) {
            return max(1, (int) ($matches[1] ?? 1));
        }
        return 1;
    }

    private function normalizeSkuKey(string $sku, int $comboMultiplier = 1): string
    {
        $value = strtoupper(trim($sku));
        $value = preg_replace('/-[A-Z0-9]+$/', '', $value) ?? $value;

        if ($comboMultiplier > 1 && preg_match('/^(.*?)(\d{2,3})([A-Z]+)$/', $value, $matches) === 1) {
            $count = (int) $matches[2];
            if ($count > 0 && $count % $comboMultiplier === 0) {
                $baseCount = (string) ($count / $comboMultiplier);
                $value = $matches[1]
                    . str_pad($baseCount, strlen($matches[2]), '0', STR_PAD_LEFT)
                    . $matches[3];
            }
        }

        return $value;
    }

    private function skuMapsEqual(array $left, array $right): bool
    {
        ksort($left);
        ksort($right);

        if (count($left) !== count($right)) {
            return false;
        }

        foreach ($left as $sku => $qty) {
            if (!array_key_exists($sku, $right)) {
                return false;
            }
            if (abs($qty - $right[$sku]) >= 0.001) {
                return false;
            }
        }

        return true;
    }

    private function countGroupedOrders(array $grouped): int
    {
        $count = 0;
        foreach ($grouped as $orders) {
            $count += count($orders);
        }
        return $count;
    }

    private function buildMatchNote(string $status, bool $qtyMatch, bool $nmvMatch, bool $hasBundle): string
    {
        return match ($status) {
            'matched'      => 'Khớp trực tiếp giữa GBS và file sàn.',
            'order_match'  => 'Khớp ở cấp đơn hàng, nhưng cấu trúc SKU khác giữa hai file.',
            'bundle_match' => 'Khớp sau khi quy đổi SKU combo về số lượng cơ sở.',
            default        => $this->buildMismatchNote($qtyMatch, $nmvMatch, $hasBundle),
        };
    }

    private function buildMismatchNote(bool $qtyMatch, bool $nmvMatch, bool $hasBundle): string
    {
        $parts = [];
        if (!$qtyMatch) {
            $parts[] = 'Lệch số lượng sản phẩm.';
        }
        if (!$nmvMatch) {
            $parts[] = 'Lệch NMV.';
        }
        if ($hasBundle) {
            $parts[] = 'Nên kiểm tra lại quy đổi combo.';
        }
        return implode(' ', $parts);
    }

    private function parseNumber(mixed $value): float
    {
        if ($value === null || $value === '') {
            return 0.0;
        }
        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }

        $text = trim((string) $value);
        $text = str_replace(["\xc2\xa0", ' '], '', $text);
        if ($text === '' || $text === '-' || $text === '--') {
            return 0.0;
        }

        if (preg_match('/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/', $text) === 1) {
            $text = str_replace('.', '', $text);
            $text = str_replace(',', '.', $text);
            return (float) $text;
        }

        if (preg_match('/^\d+,\d{1,4}$/', $text) === 1) {
            return (float) str_replace(',', '.', $text);
        }

        $text = str_replace(',', '', $text);
        $cleaned = preg_replace('/[^\d.\-]/', '', $text) ?: '0';
        return (float) $cleaned;
    }

    private function isEmptyRow(array $row): bool
    {
        foreach ($row as $value) {
            if ($value !== null && $value !== '') {
                return false;
            }
        }
        return true;
    }

    private function roundNumber(float $value, int $precision): float
    {
        return round($value, $precision);
    }

    private function platformLabel(string $platform): string
    {
        return match ($platform) {
            'shopee'     => 'Shopee',
            'lazada'     => 'Lazada',
            'tiktokshop' => 'TikTok Shop',
            default      => $platform,
        };
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes <= 0) {
            return '0 B';
        }

        $units = ['B', 'KB', 'MB', 'GB'];
        $value = (float) $bytes;
        $unitIndex = 0;

        while ($value >= 1024 && $unitIndex < count($units) - 1) {
            $value /= 1024;
            $unitIndex++;
        }

        return number_format($value, $unitIndex === 0 ? 0 : 1, '.', '') . ' ' . $units[$unitIndex];
    }
}
