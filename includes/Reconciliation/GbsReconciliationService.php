<?php

declare(strict_types=1);

namespace Dashboard\Reconciliation;

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use RuntimeException;

final class GbsReconciliationService
{
    private const PLATFORM_KEYS = ['shopee', 'lazada', 'tiktokshop'];
    private const PRICE_SETTING_KEY = 'reconcile_price_table';
    private const COMBO_SETTING_KEY = 'reconcile_combo_to_single';
    private const CONFIRMED_MONTHS_SETTING_KEY = 'reconcile_gbs_confirmed_months';

    private const GBS_COLUMN_MAP = [
        'created_at'        => ['thời gian tạo'],
        'reconciliation_at' => ['thời gian đối soát'],
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
    private array $config;
    private ReconciliationFileStore $fileStore;
    private ?array $managedPriceTable = null;
    private ?array $managedComboRules = null;

    public function __construct(string $baseDir, array $config = [])
    {
        $this->baseDir = rtrim($baseDir, DIRECTORY_SEPARATOR);
        $this->config = $config;
        $this->fileStore = new ReconciliationFileStore($this->baseDir, $config);
    }

    public function compare(?string $month = null): array
    {
        $catalog = $this->buildGbsCatalog();
        $confirmedMonths = $this->loadConfirmedMonths();
        $monthSummaries = $this->buildMonthSummaryList($catalog['months'], $confirmedMonths);
        $selectedMonth = $this->resolveSelectedMonth($month, array_column($monthSummaries, 'month'));

        if ($selectedMonth === null) {
            return [
                'success' => true,
                'generated_at' => date('Y-m-d H:i:s'),
                'selected_month' => null,
                'selected_month_meta' => null,
                'gbs_files' => $this->sanitizeFileList($catalog['files']),
                'months' => $monthSummaries,
                'summary' => $this->emptySummary(),
                'mappings' => $this->buildMappings(),
                'insights' => $this->buildInsights(null, $catalog['files'], []),
                'platforms' => $this->emptyPlatformSummaries(),
                'unmatched_platform_orders' => [],
            ];
        }

        $gbsRows = $this->loadGbsRowsForMonth($catalog['sources'], $selectedMonth);
        $gbsGroupedByPlat = $this->groupGbsOrdersByPlatform($gbsRows);

        $platformSummaries = [];
        $totals = $this->emptySummary();
        $totals['gbs_orders'] = $this->countGroupedOrders($gbsGroupedByPlat);

        foreach (self::PLATFORM_KEYS as $platform) {
            $gbsOrders = $gbsGroupedByPlat[$platform] ?? [];
            $platformRows = $this->loadSharedPlatformRows(
                $platform,
                $selectedMonth,
                array_keys($gbsOrders)
            );
            $comparison = $this->comparePlatform($platform, $platformRows, $gbsOrders);
            $comparison['scope_note'] = $this->platformScopeNote($platform);

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

        $selectedMonthMeta = null;
        foreach ($monthSummaries as $summary) {
            if (($summary['month'] ?? '') === $selectedMonth) {
                $selectedMonthMeta = $summary;
                break;
            }
        }

        $unmatchedPlatformOrders = $this->collectUnmatchedPlatformOrders($platformSummaries);

        return [
            'success'      => true,
            'generated_at' => date('Y-m-d H:i:s'),
            'selected_month' => $selectedMonth,
            'selected_month_meta' => $selectedMonthMeta,
            'gbs_files'    => $this->sanitizeFileList($catalog['files']),
            'months'       => $monthSummaries,
            'summary'      => $totals,
            'mappings'     => $this->buildMappings(),
            'insights'     => $this->buildInsights($selectedMonth, $catalog['files'], $platformSummaries),
            'platforms'    => $platformSummaries,
            'unmatched_platform_orders' => $unmatchedPlatformOrders,
        ];
    }

    public function inspectSourceFile(string $sourceKey, string $path): array
    {
        if ($sourceKey !== 'gbs') {
            throw new RuntimeException('Loại file đối soát không hợp lệ.');
        }

        $rows = $this->loadGbsRows($path);
        $groupedOrders = $this->groupGbsOrdersByPlatform($rows);
        $months = [];
        foreach ($rows as $row) {
            $monthKey = (string) ($row['reconcile_month'] ?? '');
            if ($monthKey === '') {
                continue;
            }
            $months[$monthKey] = $monthKey;
        }

        return [
            'row_count'   => count($rows),
            'order_count' => $this->countGroupedOrders($groupedOrders),
            'months'      => array_values($months),
        ];
    }

    public function setMonthConfirmation(string $month, bool $confirmed, ?string $username = null): array
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            throw new RuntimeException('Tháng đối soát không hợp lệ.');
        }

        $state = $this->loadConfirmedMonths();
        if ($confirmed) {
            $state[$month] = [
                'month' => $month,
                'confirmed' => true,
                'confirmed_at' => date('Y-m-d H:i:s'),
                'confirmed_by' => trim((string) ($username ?? '')) ?: null,
            ];
        } else {
            unset($state[$month]);
        }

        $this->saveConfirmedMonths($state);
        return $state[$month] ?? [
            'month' => $month,
            'confirmed' => false,
            'confirmed_at' => null,
            'confirmed_by' => null,
        ];
    }

    public function exportUnmatchedPlatformOrders(?string $month = null, ?string $platform = null): array
    {
        $data = $this->compare($month);
        $rows = array_values(array_filter(
            $data['unmatched_platform_orders'] ?? [],
            static fn(array $row): bool => $platform === null || $platform === '' || ($row['platform'] ?? '') === $platform
        ));

        return [
            'month' => $data['selected_month'] ?? null,
            'rows' => $rows,
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
                'gbs_reconcile_at'    => $gbsOrder['reconcile_at'] ?? '',
                'platform_reconcile_at' => $platformOrder['reconcile_at'] ?? '',
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
            'gbs_reconcile_at'    => $isMissingInGbs ? '' : (string) ($source['reconcile_at'] ?? ''),
            'platform_reconcile_at' => $isMissingInGbs ? (string) ($source['reconcile_at'] ?? '') : '',
            'gbs_skus'            => $isMissingInGbs ? [] : ($source['sku_items'] ?? []),
            'platform_skus'       => $isMissingInGbs ? ($source['sku_items'] ?? []) : [],
            'note'                => $isMissingInGbs
                ? 'Đơn có trong dữ liệu sàn chung nhưng không tìm thấy ở GBS tháng đang chọn.'
                : 'Đơn có trong GBS nhưng chưa thấy trong dữ liệu sàn chung.',
        ];
    }

    private function emptySummary(): array
    {
        return [
            'platform_orders'      => 0,
            'gbs_orders'           => 0,
            'common_orders'        => 0,
            'matched_orders'       => 0,
            'bundle_match_orders'  => 0,
            'mismatch_orders'      => 0,
            'missing_in_gbs'       => 0,
            'missing_in_platform'  => 0,
            'qty_mismatch_orders'  => 0,
            'nmv_mismatch_orders'  => 0,
        ];
    }

    private function emptyPlatformSummaries(): array
    {
        $empty = [];
        foreach (self::PLATFORM_KEYS as $platform) {
            $empty[$platform] = [
                'summary' => $this->emptySummary(),
                'orders' => [],
                'scope_note' => $this->platformScopeNote($platform),
            ];
        }

        return $empty;
    }

    private function collectUnmatchedPlatformOrders(array $platformSummaries): array
    {
        $rows = [];
        foreach (self::PLATFORM_KEYS as $platform) {
            foreach (($platformSummaries[$platform]['orders'] ?? []) as $order) {
                $status = (string) ($order['status'] ?? '');
                if (!in_array($status, ['missing_in_gbs', 'mismatch'], true)) {
                    continue;
                }

                $rows[] = [
                    'platform' => $platform,
                    'order_id' => (string) ($order['order_id'] ?? ''),
                    'status' => $status,
                    'platform_reconcile_at' => (string) ($order['platform_reconcile_at'] ?? ''),
                    'platform_statuses' => $order['platform_statuses'] ?? [],
                    'platform_qty' => (float) ($order['platform_qty'] ?? 0),
                    'platform_nmv' => (float) ($order['platform_nmv'] ?? 0),
                    'gbs_qty' => (float) ($order['gbs_qty'] ?? 0),
                    'gbs_nmv' => (float) ($order['gbs_nmv'] ?? 0),
                    'qty_diff' => (float) ($order['qty_diff'] ?? 0),
                    'nmv_diff' => (float) ($order['nmv_diff'] ?? 0),
                    'platform_skus' => $order['platform_skus'] ?? [],
                    'gbs_skus' => $order['gbs_skus'] ?? [],
                    'note' => (string) ($order['note'] ?? ''),
                ];
            }
        }

        usort($rows, function (array $left, array $right): int {
            $statusWeight = [
                'missing_in_gbs' => 0,
                'mismatch' => 1,
            ];

            $leftWeight = $statusWeight[$left['status']] ?? 99;
            $rightWeight = $statusWeight[$right['status']] ?? 99;
            if ($leftWeight !== $rightWeight) {
                return $leftWeight <=> $rightWeight;
            }

            $leftAt = (string) ($left['platform_reconcile_at'] ?? '');
            $rightAt = (string) ($right['platform_reconcile_at'] ?? '');
            if ($leftAt !== $rightAt) {
                return strcmp($rightAt, $leftAt);
            }

            return strcmp((string) ($left['order_id'] ?? ''), (string) ($right['order_id'] ?? ''));
        });

        return $rows;
    }

    private function sanitizeFileList(array $files): array
    {
        return array_map(function (array $file): array {
            unset($file['path']);
            return $file;
        }, $files);
    }

    private function buildGbsCatalog(): array
    {
        $files = $this->fileStore->listGbsFiles();
        if ($files === []) {
            $files = $this->discoverLegacyGbsFiles();
        }

        $catalog = [
            'files' => [],
            'months' => [],
            'sources' => [],
        ];

        foreach ($files as $file) {
            if (($file['status'] ?? 'missing') !== 'ready' || empty($file['path'])) {
                continue;
            }

            $rows = $this->loadGbsRows((string) $file['path']);
            $groupedOrders = $this->groupGbsOrdersByPlatform($rows);
            $months = [];

            foreach ($rows as $row) {
                $monthKey = (string) ($row['reconcile_month'] ?? '');
                if ($monthKey === '') {
                    continue;
                }
                if (!isset($months[$monthKey])) {
                    $months[$monthKey] = [
                        'row_count' => 0,
                        'order_keys' => [],
                    ];
                }
                $months[$monthKey]['row_count']++;
                $months[$monthKey]['order_keys'][$row['platform'] . '|' . $row['order_id']] = true;
            }

            $fileMeta = $file;
            $fileMeta['row_count'] = count($rows);
            $fileMeta['order_count'] = $this->countGroupedOrders($groupedOrders);
            $fileMeta['months'] = array_keys($months);

            $catalog['files'][] = $fileMeta;
            $catalog['sources'][] = [
                'file' => $fileMeta,
                'rows' => $rows,
                'months' => $months,
            ];

            foreach ($months as $monthKey => $monthInfo) {
                if (!isset($catalog['months'][$monthKey])) {
                    $catalog['months'][$monthKey] = [
                        'month' => $monthKey,
                        'label' => $this->formatMonthLabel($monthKey),
                        'row_count' => 0,
                        'order_keys' => [],
                        'file_count' => 0,
                        'files' => [],
                        'latest_modified_at' => '',
                    ];
                }

                $catalog['months'][$monthKey]['row_count'] += (int) ($monthInfo['row_count'] ?? 0);
                $catalog['months'][$monthKey]['file_count']++;
                $catalog['months'][$monthKey]['files'][] = [
                    'filename' => $fileMeta['filename'] ?? '',
                    'modified_at' => $fileMeta['modified_at'] ?? '',
                    'source_label' => $fileMeta['source_label'] ?? 'Kho đối soát',
                    'deletable' => (bool) ($fileMeta['deletable'] ?? false),
                ];
                if (($fileMeta['modified_at'] ?? '') > ($catalog['months'][$monthKey]['latest_modified_at'] ?? '')) {
                    $catalog['months'][$monthKey]['latest_modified_at'] = (string) ($fileMeta['modified_at'] ?? '');
                }

                foreach (array_keys($monthInfo['order_keys'] ?? []) as $orderKey) {
                    $catalog['months'][$monthKey]['order_keys'][$orderKey] = true;
                }
            }
        }

        usort($catalog['files'], static fn(array $left, array $right): int =>
            strcmp((string) ($right['modified_at'] ?? ''), (string) ($left['modified_at'] ?? ''))
        );
        krsort($catalog['months']);

        return $catalog;
    }

    private function discoverLegacyGbsFiles(): array
    {
        $candidates = [];
        foreach (['GBS*.xlsx', 'GBS*.xls', 'gbs*.xlsx', 'gbs*.xls'] as $pattern) {
            foreach (glob($this->baseDir . DIRECTORY_SEPARATOR . $pattern) ?: [] as $path) {
                if (is_file($path)) {
                    $candidates[$path] = filemtime($path) ?: 0;
                }
            }
        }

        arsort($candidates);
        $files = [];
        foreach (array_keys($candidates) as $path) {
            $files[] = [
                'status' => 'ready',
                'source_key' => 'gbs',
                'source' => 'legacy_root',
                'source_label' => 'Thư mục gốc',
                'deletable' => false,
                'path' => $path,
                'filename' => basename($path),
                'size_bytes' => filesize($path) ?: 0,
                'modified_at' => date('Y-m-d H:i:s', filemtime($path) ?: time()),
                'size_label' => $this->formatBytes((int) (filesize($path) ?: 0)),
            ];
        }

        return $files;
    }

    private function loadGbsRowsForMonth(array $sources, string $month): array
    {
        $rows = [];
        foreach ($sources as $source) {
            foreach (($source['rows'] ?? []) as $row) {
                if (($row['reconcile_month'] ?? '') === $month) {
                    $rows[] = $row;
                }
            }
        }

        return $rows;
    }

    private function buildMonthSummaryList(array $months, array $confirmedMonths): array
    {
        $result = [];
        foreach ($months as $monthKey => $month) {
            $confirmed = $confirmedMonths[$monthKey] ?? null;
            $result[] = [
                'month' => $monthKey,
                'label' => $month['label'] ?? $this->formatMonthLabel($monthKey),
                'row_count' => (int) ($month['row_count'] ?? 0),
                'gbs_orders' => count($month['order_keys'] ?? []),
                'file_count' => (int) ($month['file_count'] ?? 0),
                'latest_modified_at' => $month['latest_modified_at'] ?? '',
                'files' => array_values($month['files'] ?? []),
                'confirmed' => $confirmed !== null,
                'confirmed_at' => $confirmed['confirmed_at'] ?? null,
                'confirmed_by' => $confirmed['confirmed_by'] ?? null,
            ];
        }

        usort($result, static fn(array $left, array $right): int =>
            strcmp((string) ($right['month'] ?? ''), (string) ($left['month'] ?? ''))
        );

        return $result;
    }

    private function resolveSelectedMonth(?string $requestedMonth, array $availableMonths): ?string
    {
        if ($requestedMonth !== null && in_array($requestedMonth, $availableMonths, true)) {
            return $requestedMonth;
        }

        return $availableMonths[0] ?? null;
    }

    private function platformScopeNote(string $platform): string
    {
        return match ($platform) {
            'shopee' => 'Đơn Shopee lấy từ bảng orders chung và lọc theo thời gian hoàn thành đơn hàng.',
            'lazada' => 'Đơn Lazada lấy từ bảng orders chung và lọc theo TTS SLA để khớp tháng đối soát GBS.',
            'tiktokshop' => 'TikTok Shop chưa có mốc thời gian ổn định, nên tháng hiện tại chỉ kiểm tra các mã đơn xuất hiện trong GBS.',
            default => '',
        };
    }

    private function loadSharedPlatformRows(string $platform, string $month, array $gbsOrderIds): array
    {
        if ($this->config === [] || !\function_exists('db')) {
            throw new RuntimeException('Chưa cấu hình kết nối dữ liệu đơn hàng để đối soát.');
        }

        $pdo = \db($this->config);
        $rows = $platform === 'tiktokshop'
            ? $this->queryOrdersByIds($pdo, $platform, $gbsOrderIds)
            : $this->queryOrdersByMonth($pdo, $platform, $month);

        return array_map(fn(array $row): array => $this->mapSharedOrderRow($platform, $row), $rows);
    }

    private function queryOrdersByMonth(\PDO $pdo, string $platform, string $month): array
    {
        [$startAt, $endAt] = $this->monthBounds($month);
        $stmt = $pdo->prepare("
            SELECT platform, order_id, sku, product_name, quantity, unit_price,
                   subtotal_before_discount, platform_discount, seller_voucher, seller_discount,
                   subtotal_after_discount, normalized_status, original_status,
                   order_created_at, order_completed_at
            FROM orders
            WHERE platform = :platform
              AND order_completed_at >= :start_at
              AND order_completed_at < :end_at
            ORDER BY order_completed_at DESC, order_id ASC, sku ASC
        ");
        $stmt->execute([
            ':platform' => $platform,
            ':start_at' => $startAt,
            ':end_at' => $endAt,
        ]);

        return $stmt->fetchAll() ?: [];
    }

    private function queryOrdersByIds(\PDO $pdo, string $platform, array $orderIds): array
    {
        $orderIds = array_values(array_filter(array_map(
            static fn(mixed $value): string => trim((string) $value),
            $orderIds
        )));
        if ($orderIds === []) {
            return [];
        }

        $rows = [];
        foreach (array_chunk($orderIds, 500) as $chunk) {
            $placeholders = implode(',', array_fill(0, count($chunk), '?'));
            $sql = "
                SELECT platform, order_id, sku, product_name, quantity, unit_price,
                       subtotal_before_discount, platform_discount, seller_voucher, seller_discount,
                       subtotal_after_discount, normalized_status, original_status,
                       order_created_at, order_completed_at
                FROM orders
                WHERE platform = ?
                  AND order_id IN ({$placeholders})
                ORDER BY order_completed_at DESC, order_id ASC, sku ASC
            ";

            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_merge([$platform], $chunk));
            $rows = array_merge($rows, $stmt->fetchAll() ?: []);
        }

        return $rows;
    }

    private function mapSharedOrderRow(string $platform, array $row): array
    {
        $orderId = trim((string) ($row['order_id'] ?? ''));
        $sku = trim((string) ($row['sku'] ?? ''));
        $productName = trim((string) ($row['product_name'] ?? ''));
        $qty = max(0.0, (float) ($row['quantity'] ?? 0));
        $gross = (float) ($row['subtotal_before_discount'] ?? 0);
        $subtotalAfterDiscount = (float) ($row['subtotal_after_discount'] ?? 0);
        $sellerVoucher = abs((float) ($row['seller_voucher'] ?? 0));
        $sellerDiscount = abs((float) ($row['seller_discount'] ?? 0));
        $platformDiscount = abs((float) ($row['platform_discount'] ?? 0));
        if ($platform === 'shopee') {
            $comparableNmv = $subtotalAfterDiscount > 0
                ? $subtotalAfterDiscount
                : max(0.0, $gross - $sellerDiscount - $platformDiscount);
        } else {
            $comparableNmv = max(0.0, $gross - $sellerVoucher - $sellerDiscount);
            if ($comparableNmv <= 0 && $gross <= 0 && $sellerVoucher <= 0 && $sellerDiscount <= 0) {
                $comparableNmv = max(0.0, $subtotalAfterDiscount + $platformDiscount);
            }
        }

        $comparisonSku = $platform === 'tiktokshop'
            ? (preg_replace('/-[A-Z0-9]+$/', '', $sku) ?? $sku)
            : $sku;
        $comboMultiplier = $this->comboMultiplierFromName($productName);
        $expandedItems = $this->buildExpandedItems(
            $platform,
            $sku,
            $comparisonSku,
            $productName,
            $qty,
            $qty * $comboMultiplier,
            $comparableNmv,
            $comboMultiplier
        );

        return [
            'order_id' => $orderId,
            'sku' => $sku,
            'comparison_sku' => $comparisonSku,
            'product_name' => $productName,
            'status' => trim((string) (($row['original_status'] ?? '') !== '' ? $row['original_status'] : ($row['normalized_status'] ?? ''))),
            'created_at' => (string) ($row['order_created_at'] ?? ''),
            'reconcile_at' => (string) ($row['order_completed_at'] ?? ''),
            'raw_qty' => $qty,
            'comparable_qty' => $qty * $comboMultiplier,
            'comparable_nmv' => $comparableNmv,
            'order_level_seller_voucher' => $platform === 'shopee' ? $sellerVoucher : 0.0,
            'combo_multiplier' => $comboMultiplier,
            'expanded_items' => $expandedItems,
            'has_bundle' => count($expandedItems) > 1 || $comboMultiplier > 1,
        ];
    }

    private function monthBounds(string $month): array
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            throw new RuntimeException('Tháng đối soát không hợp lệ.');
        }

        [$year, $monthNumber] = array_map('intval', explode('-', $month, 2));
        $startAt = sprintf('%04d-%02d-01 00:00:00', $year, $monthNumber);
        $nextYear = $monthNumber === 12 ? $year + 1 : $year;
        $nextMonth = $monthNumber === 12 ? 1 : $monthNumber + 1;
        $endAt = sprintf('%04d-%02d-01 00:00:00', $nextYear, $nextMonth);

        return [$startAt, $endAt];
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
            $grouped[$platform][$orderId]['total_nmv'] += $this->roundCurrency((float) ($row['nmv'] ?? 0));
            $grouped[$platform][$orderId]['line_count']++;
            $grouped[$platform][$orderId]['statuses'][$row['status']] = $row['status'];
            if (($row['reconcile_at'] ?? '') > ($grouped[$platform][$orderId]['reconcile_at'] ?? '')) {
                $grouped[$platform][$orderId]['reconcile_at'] = (string) ($row['reconcile_at'] ?? '');
            }
            $grouped[$platform][$orderId]['sku_map'][$skuKey] = ($grouped[$platform][$orderId]['sku_map'][$skuKey] ?? 0) + $row['quantity'];
            $grouped[$platform][$orderId]['sku_items'][] = [
                'sku'       => $row['sku'],
                'quantity'  => $this->roundNumber($row['quantity'], 4),
                'nmv'       => $this->roundCurrency((float) ($row['nmv'] ?? 0)),
                'type'      => $row['product_type'],
                'name'      => $row['product_name'],
            ];
        }

        foreach ($grouped as &$platformOrders) {
            foreach ($platformOrders as &$order) {
                $order['total_nmv'] = $this->roundCurrency((float) ($order['total_nmv'] ?? 0));
                $order['statuses'] = array_values($order['statuses']);
            }
            unset($order);
        }
        unset($platformOrders);

        return $grouped;
    }

    private function groupPlatformOrders(array $rows): array
    {
        $grouped = [];
        foreach ($rows as $row) {
            $orderId = $row['order_id'];
            if (!isset($grouped[$orderId])) {
                $grouped[$orderId] = $this->emptyOrderGroup();
            }

            $grouped[$orderId]['line_count']++;
            $grouped[$orderId]['statuses'][$row['status']] = $row['status'];
            if (($row['reconcile_at'] ?? '') > ($grouped[$orderId]['reconcile_at'] ?? '')) {
                $grouped[$orderId]['reconcile_at'] = (string) ($row['reconcile_at'] ?? '');
            }
            $grouped[$orderId]['order_level_seller_voucher'] = max(
                (float) ($grouped[$orderId]['order_level_seller_voucher'] ?? 0.0),
                max(0.0, (float) ($row['order_level_seller_voucher'] ?? 0.0))
            );

            $items = $row['expanded_items'] ?? [[
                'sku'              => $row['sku'],
                'comparison_sku'   => $row['comparison_sku'],
                'quantity'         => $row['raw_qty'],
                'comparable_qty'   => $row['comparable_qty'],
                'comparable_nmv'   => $row['comparable_nmv'],
                'combo_multiplier' => $row['combo_multiplier'],
                'name'             => $row['product_name'],
            ]];

            foreach ($items as $item) {
                $skuMultiplier = !empty($item['is_combo_mapping'])
                    ? 1
                    : (int) round((float) ($item['combo_multiplier'] ?? 1));
                $skuKey = $this->normalizeSkuKey(
                    (string) ($item['comparison_sku'] ?? ''),
                    $skuMultiplier
                );
                $grouped[$orderId]['total_qty'] += (float) ($item['comparable_qty'] ?? 0);
                $grouped[$orderId]['total_nmv'] += (float) ($item['comparable_nmv'] ?? 0);
                $grouped[$orderId]['has_bundle'] = $grouped[$orderId]['has_bundle']
                    || ((float) ($item['combo_multiplier'] ?? 1) > 1)
                    || !empty($item['is_combo_mapping']);
                $grouped[$orderId]['sku_map'][$skuKey] = ($grouped[$orderId]['sku_map'][$skuKey] ?? 0)
                    + (float) ($item['comparable_qty'] ?? 0);
                $grouped[$orderId]['sku_items'][] = [
                    'sku'              => $item['sku'] ?? '',
                    'comparison_sku'   => $item['comparison_sku'] ?? '',
                    'quantity'         => $this->roundNumber((float) ($item['quantity'] ?? 0), 4),
                    'comparable_qty'   => $this->roundNumber((float) ($item['comparable_qty'] ?? 0), 4),
                    'comparable_nmv'   => $this->roundNumber((float) ($item['comparable_nmv'] ?? 0), 2),
                    'combo_multiplier' => (float) ($item['combo_multiplier'] ?? 1),
                    'name'             => $item['name'] ?? ($row['product_name'] ?? ''),
                ];
            }
        }

        foreach ($grouped as $orderId => &$order) {
            $order['total_nmv'] = max(0.0, (float) ($order['total_nmv'] ?? 0) - (float) ($order['order_level_seller_voucher'] ?? 0));
            $order['total_nmv'] = $this->roundNumber((float) $order['total_nmv'], 2);
            $order['statuses'] = array_values($order['statuses']);
            unset($order['order_level_seller_voucher']);
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
            'reconcile_at' => '',
            'sku_map'    => [],
            'sku_items'  => [],
            'order_level_seller_voucher' => 0.0,
        ];
    }

    private function loadGbsRows(string $path): array
    {
        $sheet   = $this->loadSheet($path, 'Defaut', 1);
        $rows    = $sheet->toArray(null, false, true, false);
        $headers = array_map(static fn($value) => (string) ($value ?? ''), $rows[1] ?? []);
        $col     = $this->resolveColumns($headers, self::GBS_COLUMN_MAP);
        $this->assertRequiredColumns($col, [
            'reconciliation_at' => 'Thời gian đối soát',
            'platform'  => 'Nền tảng',
            'order_id'  => 'Mã đơn hàng',
            'sku'       => 'SKU',
            'quantity'  => 'Số lượng',
            'gross_revenue' => 'Doanh thu',
        ], 'GBS');
        $result  = [];

        foreach ($rows as $index => $row) {
            if ($index <= 1 || $this->isEmptyRow($row)) {
                continue;
            }

            $orderId  = trim((string) ($row[$col['order_id'] ?? -1] ?? ''));
            $platform = $this->normalizeGbsPlatform((string) ($row[$col['platform'] ?? -1] ?? ''));
            $reconcileAt = $this->parseDateTimeCell($row[$col['reconciliation_at'] ?? -1] ?? null)
                ?? $this->parseDateTimeCell($row[$col['created_at'] ?? -1] ?? null);
            if ($orderId === '' || $platform === null) {
                continue;
            }

            $grossRevenue = $this->parseNumber($row[$col['gross_revenue'] ?? -1] ?? null);
            $sellerVoucher = $this->parseNumber($row[$col['seller_voucher'] ?? -1] ?? null);
            $sellerDiscount = $this->parseNumber($row[$col['seller_discount'] ?? -1] ?? null);
            $fallbackNmv = $this->parseNumber($row[$col['nmv'] ?? -1] ?? null);
            $nmv = ($grossRevenue !== 0.0 || $sellerVoucher !== 0.0 || $sellerDiscount !== 0.0)
                ? max(0.0, $grossRevenue - $sellerVoucher - $sellerDiscount)
                : $fallbackNmv;
            $nmv = $this->roundCurrency($nmv);

            $result[] = [
                'platform'       => $platform,
                'order_id'       => $orderId,
                'sku'            => trim((string) ($row[$col['sku'] ?? -1] ?? '')),
                'product_name'   => trim((string) ($row[$col['product_name'] ?? -1] ?? '')),
                'product_type'   => trim((string) ($row[$col['product_type'] ?? -1] ?? '')),
                'status'         => trim((string) ($row[$col['status'] ?? -1] ?? '')),
                'created_at'     => $this->parseDateTimeCell($row[$col['created_at'] ?? -1] ?? null) ?? '',
                'reconcile_at'   => $reconcileAt ?? '',
                'reconcile_month'=> $reconcileAt ? substr($reconcileAt, 0, 7) : '',
                'quantity'       => $this->parseNumber($row[$col['quantity'] ?? -1] ?? null),
                'gross_revenue'  => $grossRevenue,
                'seller_voucher' => $sellerVoucher,
                'seller_discount'=> $sellerDiscount,
                'nmv'            => $nmv,
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
            $platformDiscount = abs($this->parseNumber($row[$col['platform_discount'] ?? -1] ?? null));
            $promoPrice = $this->parseNumber($row[$col['promo_price'] ?? -1] ?? null);
            $sellerVoucher = $this->parseNumber($row[$col['seller_voucher'] ?? -1] ?? null);
            $sellerDiscountTotal = $this->parseNumber($row[$col['seller_discount_total'] ?? -1] ?? null);
            if ($sellerDiscountTotal === 0.0) {
                $sellerDiscountTotal = $this->parseNumber($row[$col['seller_discount_unit'] ?? -1] ?? null) * $qty;
            }

            $productName = trim((string) ($row[$col['product_name'] ?? -1] ?? ''));
            $comboMultiplier = $this->comboMultiplierFromName($productName);
            $comparableNmv = $promoPrice > 0
                ? max(0.0, $promoPrice * $qty)
                : max(0.0, ($unitPrice * $qty) - $sellerDiscountTotal - $platformDiscount);
            $expandedItems = $this->buildExpandedItems(
                'shopee',
                $sku,
                $sku,
                $productName,
                $qty,
                $qty * $comboMultiplier,
                $comparableNmv,
                $comboMultiplier
            );

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
                'order_level_seller_voucher' => $sellerVoucher,
                'combo_multiplier' => $comboMultiplier,
                'expanded_items'   => $expandedItems,
                'has_bundle'       => count($expandedItems) > 1 || $comboMultiplier > 1,
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
            $comparableNmv = max(0.0, $unitPrice - $sellerDiscount);
            $expandedItems = $this->buildExpandedItems(
                'lazada',
                $sku,
                $sku,
                $productName,
                1.0,
                (float) $comboMultiplier,
                $comparableNmv,
                $comboMultiplier
            );

            $result[] = [
                'order_id'         => $orderId,
                'sku'              => $sku,
                'comparison_sku'   => $sku,
                'product_name'     => $productName,
                'status'           => trim((string) ($row[$col['status'] ?? -1] ?? '')),
                'created_at'       => trim((string) ($row[$col['created_at'] ?? -1] ?? '')),
                'raw_qty'          => 1.0,
                'comparable_qty'   => (float) $comboMultiplier,
                'comparable_nmv'   => $comparableNmv,
                'combo_multiplier' => $comboMultiplier,
                'expanded_items'   => $expandedItems,
                'has_bundle'       => count($expandedItems) > 1 || $comboMultiplier > 1,
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
            $comparisonSku = preg_replace('/-[A-Z0-9]+$/', '', $sku) ?? $sku;
            $comparableNmv = max(0.0, $subtotalBefore - $sellerDiscount);
            $expandedItems = $this->buildExpandedItems(
                'tiktokshop',
                $sku,
                $comparisonSku,
                $productName,
                $qty,
                $qty * $comboMultiplier,
                $comparableNmv,
                $comboMultiplier
            );

            $result[] = [
                'order_id'         => $orderId,
                'sku'              => $sku,
                'comparison_sku'   => $comparisonSku,
                'product_name'     => $productName,
                'status'           => trim((string) ($row[$col['status'] ?? -1] ?? '')),
                'created_at'       => trim((string) ($row[$col['created_at'] ?? -1] ?? '')),
                'raw_qty'          => $qty,
                'comparable_qty'   => $qty * $comboMultiplier,
                'comparable_nmv'   => $comparableNmv,
                'combo_multiplier' => $comboMultiplier,
                'expanded_items'   => $expandedItems,
                'has_bundle'       => count($expandedItems) > 1 || $comboMultiplier > 1,
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

    private function loadConfirmedMonths(): array
    {
        try {
            if ($this->config === [] || !\function_exists('db') || !\function_exists('get_app_setting')) {
                return [];
            }

            $pdo = \db($this->config);
            $rows = json_decode(\get_app_setting($pdo, self::CONFIRMED_MONTHS_SETTING_KEY, '{}'), true);
            if (!is_array($rows)) {
                return [];
            }

            $result = [];
            foreach ($rows as $month => $row) {
                if (!preg_match('/^\d{4}-\d{2}$/', (string) $month)) {
                    continue;
                }
                $result[(string) $month] = [
                    'month' => (string) $month,
                    'confirmed_at' => is_array($row) ? ($row['confirmed_at'] ?? null) : null,
                    'confirmed_by' => is_array($row) ? ($row['confirmed_by'] ?? null) : null,
                ];
            }

            return $result;
        } catch (\Throwable $e) {
            return [];
        }
    }

    private function saveConfirmedMonths(array $state): void
    {
        if ($this->config === [] || !\function_exists('db') || !\function_exists('set_app_setting')) {
            throw new RuntimeException('Không thể lưu trạng thái xác nhận đối soát.');
        }

        $pdo = \db($this->config);
        \set_app_setting(
            $pdo,
            self::CONFIRMED_MONTHS_SETTING_KEY,
            json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );
    }

    private function parseDateTimeCell(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_numeric($value)) {
            try {
                return \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject((float) $value)->format('Y-m-d H:i:s');
            } catch (\Throwable $e) {
                return null;
            }
        }

        return \parse_datetime_value((string) $value);
    }

    private function formatMonthLabel(string $month): string
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            return $month;
        }

        [$year, $monthNumber] = explode('-', $month, 2);
        return sprintf('Tháng %s/%s', $monthNumber, $year);
    }

    private function buildMappings(): array
    {
        return [
            'shopee' => [
                ['field' => 'time_scope', 'gbs' => 'Thời gian đối soát', 'platform' => 'Thời gian hoàn thành đơn hàng', 'rule' => 'Shopee dùng dữ liệu trong bảng orders chung, lọc theo tháng của thời gian hoàn thành đơn hàng.'],
                ['field' => 'order_id', 'gbs' => 'Mã đơn hàng', 'platform' => 'order_id', 'rule' => 'Khớp trực tiếp theo đơn hàng sau khi đã lọc đúng tháng.'],
                ['field' => 'sku', 'gbs' => 'sku', 'platform' => 'sku', 'rule' => 'Ưu tiên quy đổi theo Combo_to_single; nếu chưa có mapping sẽ fallback về heuristic COMBO trong tên sản phẩm.'],
                ['field' => 'nmv', 'gbs' => 'Doanh thu - Mã giảm giá từ người bán - Giảm giá từ người bán (làm tròn tiền)', 'platform' => 'subtotal_after_discount - seller_voucher', 'rule' => 'Shopee lấy `Giá ưu đãi`; voucher shop chỉ trừ 1 lần duy nhất theo đơn hàng.'],
            ],
            'lazada' => [
                ['field' => 'time_scope', 'gbs' => 'Thời gian đối soát', 'platform' => 'ttsSla', 'rule' => 'Lazada dùng dữ liệu trong bảng orders chung, lọc theo tháng của TTS SLA.'],
                ['field' => 'order_id', 'gbs' => 'Mã đơn hàng', 'platform' => 'order_id', 'rule' => 'Khớp trực tiếp theo đơn hàng sau khi đã lọc đúng tháng.'],
                ['field' => 'sku', 'gbs' => 'sku', 'platform' => 'sku', 'rule' => 'Nếu có mapping combo thì quy đổi về SKU đơn GBS trước khi so sánh.'],
                ['field' => 'nmv', 'gbs' => 'Doanh thu - Voucher người bán - Giảm giá nhà bán', 'platform' => 'subtotal_before_discount - seller_discount', 'rule' => 'Bang_gia dùng để phân bổ NMV khi 1 combo tách thành nhiều SKU đơn.'],
            ],
            'tiktokshop' => [
                ['field' => 'time_scope', 'gbs' => 'Thời gian đối soát', 'platform' => 'Chưa có mốc thời gian ổn định', 'rule' => 'TikTok Shop hiện chỉ so khớp các mã đơn xuất hiện trong GBS tháng đang chọn.'],
                ['field' => 'order_id', 'gbs' => 'Mã đơn hàng', 'platform' => 'order_id', 'rule' => 'Khớp trực tiếp theo đơn hàng.'],
                ['field' => 'sku', 'gbs' => 'sku', 'platform' => 'sku', 'rule' => 'Bỏ suffix vùng rồi áp dụng Combo_to_single nếu có cấu hình phù hợp.'],
                ['field' => 'nmv', 'gbs' => 'Doanh thu - Voucher người bán - Giảm giá nhà bán', 'platform' => 'subtotal_before_discount - seller_discount', 'rule' => 'Không trừ phần giảm giá của sàn; Bang_gia hỗ trợ phân bổ NMV khi tách combo.'],
            ],
        ];
    }

    private function buildInsights(?string $selectedMonth, array $files, array $platforms): array
    {
        $insights = [
            'GBS chuẩn hóa giá trị nền tảng từ `shopee_v2`, `lazada`, `tiktok` thành `shopee`, `lazada`, `tiktokshop` để so khớp.',
            'Nguồn dữ liệu sàn giờ dùng chung từ bảng orders; không cần upload và quản lý file Shopee/Lazada/TikTok riêng cho đối soát nữa.',
            'NMV Shopee đối soát = `Giá ưu đãi - Mã giảm giá của Shop`, trong đó voucher shop chỉ tính 1 lần duy nhất ở cấp đơn hàng.',
            'NMV của GBS được làm tròn trước khi so khớp để tránh lệch tiền do số lẻ khi quy đổi.',
        ];

        if ($selectedMonth !== null) {
            $insights[] = sprintf(
                'Tháng đối soát hiện tại là %s, lấy theo cột `Thời gian đối soát` của GBS.',
                $this->formatMonthLabel($selectedMonth)
            );
        }

        $priceCount = count($this->loadManagedPriceTable());
        $comboCount = count($this->loadManagedComboRuleRows());
        if ($priceCount > 0 || $comboCount > 0) {
            $insights[] = sprintf(
                'Cấu hình đối soát hiện có %d dòng Bang_gia và %d dòng Combo_to_single trong phần cài đặt hệ thống.',
                $priceCount,
                $comboCount
            );
        }

        if ($files === []) {
            $insights[] = 'Chưa có file GBS nào trong kho đối soát. Upload file GBS theo tháng để bắt đầu.';
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

        $insights[] = 'TikTok Shop hiện chưa xác định được tháng theo dữ liệu sàn, nên hệ thống chỉ dùng danh sách mã đơn từ GBS để kiểm tra chéo.';

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

    private function buildExpandedItems(
        string $platform,
        string $rawSku,
        string $defaultComparisonSku,
        string $productName,
        float $rawQty,
        float $fallbackComparableQty,
        float $baseComparableNmv,
        int $fallbackComboMultiplier
    ): array {
        $comboRule = $this->resolveComboRule($platform, $rawSku, $productName);
        if ($comboRule === null) {
            return [[
                'sku'              => $rawSku,
                'comparison_sku'   => $defaultComparisonSku,
                'quantity'         => $rawQty,
                'comparable_qty'   => $fallbackComparableQty,
                'comparable_nmv'   => $baseComparableNmv,
                'combo_multiplier' => $fallbackComboMultiplier,
                'name'             => $productName,
                'is_combo_mapping' => false,
            ]];
        }

        $priceTable = $this->loadManagedPriceTable();
        $items = $comboRule['items'];
        $weights = [];
        $totalWeight = 0.0;

        foreach ($items as $index => $item) {
            $price = (float) ($priceTable[$item['single_sku']]['unit_price'] ?? 0);
            $weight = $price > 0
                ? $price * $item['single_qty']
                : $item['single_qty'];
            $weights[$index] = $weight;
            $totalWeight += $weight;
        }

        if ($totalWeight <= 0) {
            $totalWeight = count($items) > 0 ? (float) count($items) : 1.0;
            foreach ($items as $index => $item) {
                $weights[$index] = 1.0;
            }
        }

        $expanded = [];
        $remainingNmv = $baseComparableNmv;
        $lastIndex = count($items) - 1;

        foreach ($items as $index => $item) {
            $allocatedNmv = $index === $lastIndex
                ? $remainingNmv
                : ($baseComparableNmv * ($weights[$index] / $totalWeight));
            $remainingNmv -= $allocatedNmv;

            $expanded[] = [
                'sku'              => $rawSku,
                'comparison_sku'   => $item['single_sku'],
                'quantity'         => $rawQty,
                'comparable_qty'   => $rawQty * $item['single_qty'],
                'comparable_nmv'   => $allocatedNmv,
                'combo_multiplier' => $item['single_qty'],
                'name'             => $productName,
                'is_combo_mapping' => true,
            ];
        }

        return $expanded;
    }

    private function resolveComboRule(string $platform, string $rawSku, string $productName): ?array
    {
        $rules = $this->loadManagedComboRules();
        $platformScopes = [$platform, 'all'];

        foreach ($platformScopes as $scope) {
            foreach ($this->comboSkuCandidates($rawSku) as $candidate) {
                if (isset($rules['by_sku'][$scope][$candidate])) {
                    return $rules['by_sku'][$scope][$candidate];
                }
            }
        }

        $normalizedName = $this->normalizeMatchText($productName);
        if ($normalizedName === '') {
            return null;
        }

        foreach ($platformScopes as $scope) {
            foreach ($rules['by_name'][$scope] ?? [] as $rule) {
                if (($rule['combo_name_needle'] ?? '') !== '' && str_contains($normalizedName, $rule['combo_name_needle'])) {
                    return $rule;
                }
            }
        }

        return null;
    }

    private function comboSkuCandidates(string $sku): array
    {
        $raw = strtoupper(trim($sku));
        $candidates = [$raw];

        $stripped = preg_replace('/-[A-Z0-9]+$/', '', $raw) ?? $raw;
        $normalized = $this->normalizeSkuKey($raw);

        foreach ([$stripped, $normalized] as $candidate) {
            if ($candidate !== '' && !in_array($candidate, $candidates, true)) {
                $candidates[] = $candidate;
            }
        }

        return $candidates;
    }

    private function loadManagedPriceTable(): array
    {
        if ($this->managedPriceTable !== null) {
            return $this->managedPriceTable;
        }

        $result = [];
        try {
            if ($this->config === [] || !\function_exists('db') || !\function_exists('get_app_setting')) {
                return $this->managedPriceTable = [];
            }

            $pdo = \db($this->config);
            $rows = json_decode(\get_app_setting($pdo, self::PRICE_SETTING_KEY, '[]'), true);
            if (!is_array($rows)) {
                $rows = [];
            }

            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $sku = strtoupper(trim((string) ($row['sku'] ?? '')));
                if ($sku === '') {
                    continue;
                }
                $result[$sku] = [
                    'sku'          => $sku,
                    'product_name' => trim((string) ($row['product_name'] ?? '')),
                    'unit_price'   => (float) ($row['unit_price'] ?? 0),
                ];
            }
        } catch (\Throwable $e) {
            $result = [];
        }

        return $this->managedPriceTable = $result;
    }

    private function loadManagedComboRuleRows(): array
    {
        try {
            if ($this->config === [] || !\function_exists('db') || !\function_exists('get_app_setting')) {
                return [];
            }

            $pdo = \db($this->config);
            $rows = json_decode(\get_app_setting($pdo, self::COMBO_SETTING_KEY, '[]'), true);
            return is_array($rows) ? $rows : [];
        } catch (\Throwable $e) {
            return [];
        }
    }

    private function loadManagedComboRules(): array
    {
        if ($this->managedComboRules !== null) {
            return $this->managedComboRules;
        }

        $compiled = [
            'by_sku' => [
                'all'        => [],
                'shopee'     => [],
                'lazada'     => [],
                'tiktokshop' => [],
            ],
            'by_name' => [
                'all'        => [],
                'shopee'     => [],
                'lazada'     => [],
                'tiktokshop' => [],
            ],
        ];

        $grouped = [];
        foreach ($this->loadManagedComboRuleRows() as $row) {
            if (!is_array($row)) {
                continue;
            }

            $platform = (string) ($row['platform'] ?? 'all');
            if (!in_array($platform, ['all', 'shopee', 'lazada', 'tiktokshop'], true)) {
                $platform = 'all';
            }

            $comboSku = strtoupper(trim((string) ($row['combo_sku'] ?? '')));
            $comboName = trim((string) ($row['combo_name'] ?? ''));
            $comboNameNeedle = $this->normalizeMatchText($comboName);
            $singleSku = strtoupper(trim((string) ($row['single_sku'] ?? '')));
            $singleQty = (float) ($row['single_qty'] ?? 0);

            if ($singleSku === '' || $singleQty <= 0 || ($comboSku === '' && $comboNameNeedle === '')) {
                continue;
            }

            $ruleKey = implode('|', [$platform, $comboSku, $comboNameNeedle]);
            if (!isset($grouped[$ruleKey])) {
                $grouped[$ruleKey] = [
                    'platform'          => $platform,
                    'combo_sku'         => $comboSku,
                    'combo_name'        => $comboName,
                    'combo_name_needle' => $comboNameNeedle,
                    'items'             => [],
                ];
            }

            $grouped[$ruleKey]['items'][] = [
                'single_sku' => $singleSku,
                'single_qty' => $singleQty,
            ];
        }

        foreach ($grouped as $rule) {
            $scope = $rule['platform'];
            if ($rule['combo_sku'] !== '') {
                $compiled['by_sku'][$scope][$rule['combo_sku']] = $rule;
            }
            if ($rule['combo_name_needle'] !== '') {
                $compiled['by_name'][$scope][] = $rule;
            }
        }

        foreach ($compiled['by_name'] as $scope => $rules) {
            usort($rules, static fn(array $left, array $right): int =>
                strlen((string) ($right['combo_name_needle'] ?? '')) <=> strlen((string) ($left['combo_name_needle'] ?? ''))
            );
            $compiled['by_name'][$scope] = $rules;
        }

        return $this->managedComboRules = $compiled;
    }

    private function normalizeMatchText(string $value): string
    {
        $normalized = $this->normalizeHeader($value);
        return preg_replace('/[^a-z0-9]+/u', '', $normalized) ?? $normalized;
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

    private function roundCurrency(float $value): float
    {
        return round($value, 0, \PHP_ROUND_HALF_UP);
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
