<?php

declare(strict_types=1);

/**
 * SkuExpander — quy đổi COMBO về SKU đơn lẻ.
 *
 * Data nguồn:
 *  - reconcile_combo_items: (platform, combo_sku, single_sku, single_qty)
 *  - reconcile_price_items: (sku, product_name, brand, unit_price)
 *
 * Thuật toán cho mỗi dòng COMBO {sku=combo, qty=Q, revenue=R, ...}:
 *  weight_i = price(single_i) * qty_i_in_combo
 *  W = Σ weight_i
 *  Output i = {
 *      sku        = single_i,
 *      total_qty  = Q * qty_i_in_combo,
 *      total_revenue = R * (weight_i / W)
 *  }
 *  Nếu W <= 0 (chưa cấu hình giá): fallback chia theo qty_i_in_combo.
 *
 * Dòng không phải COMBO: trả lại nguyên dạng.
 */
final class SkuExpander
{
    /** combo_sku (upper) => list<array{single_sku:string, single_qty:float, platform:string}> */
    private array $combos = [];
    /** single_sku (upper) => float */
    private array $prices = [];
    /** single_sku (upper) => string */
    private array $names = [];
    /** single_sku (upper) => string */
    private array $brands = [];

    public function __construct(PDO $pdo)
    {
        try {
            $rows = $pdo->query("SELECT sku, product_name, brand, unit_price FROM reconcile_price_items")->fetchAll();
            foreach ($rows as $r) {
                $sku = strtoupper(trim((string) $r['sku']));
                if ($sku === '') { continue; }
                $this->prices[$sku] = (float) $r['unit_price'];
                $this->names[$sku] = (string) $r['product_name'];
                $this->brands[$sku] = (string) $r['brand'];
            }
        } catch (\Throwable $e) {
            // table not yet present
        }

        try {
            $rows = $pdo->query("SELECT platform, combo_sku, single_sku, single_qty FROM reconcile_combo_items")->fetchAll();
            foreach ($rows as $r) {
                $combo = strtoupper(trim((string) $r['combo_sku']));
                $single = strtoupper(trim((string) $r['single_sku']));
                if ($combo === '' || $single === '') { continue; }
                $this->combos[$combo][] = [
                    'single_sku' => $single,
                    'single_qty' => (float) $r['single_qty'],
                    'platform'   => (string) $r['platform'],
                ];
            }
        } catch (\Throwable $e) {
            // table not yet present
        }
    }

    public function isCombo(string $sku): bool
    {
        return isset($this->combos[strtoupper(trim($sku))]);
    }

    public function priceOf(string $sku): float
    {
        return $this->prices[strtoupper(trim($sku))] ?? 0.0;
    }

    public function nameOf(string $sku): string
    {
        return $this->names[strtoupper(trim($sku))] ?? '';
    }

    public function brandOf(string $sku): string
    {
        return $this->brands[strtoupper(trim($sku))] ?? '';
    }

    /**
     * @param array $row    Phải chứa các key: sku. Có thể có total_qty, total_revenue, order_count, product_name, platform.
     * @param string|null $platform  Nếu set, ưu tiên mapping theo platform; rơi về 'all' nếu không có.
     * @return list<array>
     */
    public function expandRow(array $row, ?string $platform = null): array
    {
        $combo = strtoupper(trim((string) ($row['sku'] ?? '')));
        if ($combo === '' || !isset($this->combos[$combo])) {
            return [$row];
        }

        $mappings = $this->selectMappings($combo, $platform ?? (string) ($row['platform'] ?? ''));
        if (empty($mappings)) {
            return [$row];
        }

        $qty = (float) ($row['total_qty'] ?? 0);
        $rev = (float) ($row['total_revenue'] ?? 0);
        $orderCount = (int) ($row['order_count'] ?? 0);

        // weights
        $weights = [];
        $totalWeight = 0.0;
        foreach ($mappings as $m) {
            $w = $this->priceOf($m['single_sku']) * (float) $m['single_qty'];
            $weights[] = $w;
            $totalWeight += $w;
        }
        $useFallback = $totalWeight <= 0;
        $fallbackTotal = 0.0;
        if ($useFallback) {
            foreach ($mappings as $m) { $fallbackTotal += (float) $m['single_qty']; }
            if ($fallbackTotal <= 0) { $fallbackTotal = (float) count($mappings); }
        }

        $out = [];
        foreach ($mappings as $i => $m) {
            $share = $useFallback
                ? ((float) $m['single_qty'] / $fallbackTotal)
                : ($totalWeight > 0 ? ($weights[$i] / $totalWeight) : 0.0);
            $singleSku = $m['single_sku'];
            $out[] = array_merge($row, [
                'sku'           => $singleSku,
                'product_name'  => $this->nameOf($singleSku) ?: ($row['product_name'] ?? $singleSku),
                'total_qty'     => $qty * (float) $m['single_qty'],
                'total_revenue' => $rev * $share,
                'order_count'   => $orderCount, // each order still counted once per output sku
                '_expanded_from'=> $combo,
            ]);
        }
        return $out;
    }

    /**
     * Áp dụng expandRow lên toàn bộ list rồi gộp lại theo (sku, platform).
     * Giữ key bổ sung: product_name (lấy từ master nếu có), brand_prefix.
     *
     * @param list<array> $rows
     * @return list<array>
     */
    public function expandAndAggregate(array $rows): array
    {
        $bucket = [];
        foreach ($rows as $row) {
            foreach ($this->expandRow($row) as $out) {
                $key = strtoupper(trim((string) $out['sku'])) . '|' . ($out['platform'] ?? '');
                if (!isset($bucket[$key])) {
                    $bucket[$key] = [
                        'sku'           => (string) $out['sku'],
                        'product_name'  => $this->nameOf($out['sku']) ?: (string) ($out['product_name'] ?? ''),
                        'platform'      => (string) ($out['platform'] ?? ''),
                        'total_qty'     => 0.0,
                        'total_revenue' => 0.0,
                        'order_count'   => 0,
                    ];
                }
                $bucket[$key]['total_qty']     += (float) ($out['total_qty'] ?? 0);
                $bucket[$key]['total_revenue'] += (float) ($out['total_revenue'] ?? 0);
                $bucket[$key]['order_count']   += (int) ($out['order_count'] ?? 0);
            }
        }
        // cast qty back to int after aggregation, round revenue
        foreach ($bucket as &$b) {
            $b['total_qty'] = (int) round($b['total_qty']);
            $b['total_revenue'] = round($b['total_revenue'], 2);
        }
        unset($b);
        return array_values($bucket);
    }

    /**
     * @return list<array{single_sku:string, single_qty:float, platform:string}>
     */
    private function selectMappings(string $combo, string $platform): array
    {
        if (!isset($this->combos[$combo])) { return []; }
        $all = $this->combos[$combo];
        if ($platform === '' || $platform === 'all') {
            // prefer 'all' if available, otherwise return everything (avoid empty)
            $allRows = array_values(array_filter($all, fn($m) => ($m['platform'] === 'all')));
            return !empty($allRows) ? $allRows : $all;
        }
        $matched = array_values(array_filter($all, fn($m) => $m['platform'] === $platform));
        if (!empty($matched)) { return $matched; }
        $fallback = array_values(array_filter($all, fn($m) => $m['platform'] === 'all'));
        return !empty($fallback) ? $fallback : $all;
    }
}
