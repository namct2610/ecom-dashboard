<?php

declare(strict_types=1);

namespace Dashboard\Parsers;

final class TiktokShopParser extends BaseParser
{
    private const COLUMN_MAP = [
        'order_id'           => ['order id'],
        'status'             => ['order status'],
        'substatus'          => ['order substatus'],
        'cancel_type'        => ['cancelation/return type', 'cancellation/return type'],
        'order_created_at'   => ['created time'],
        'order_paid_at'      => ['paid time'],
        'order_completed_at' => ['delivered time'],
        'cancel_reason'      => ['cancel reason'],
        'sku'                => ['seller sku'],
        'product_name'       => ['product name'],
        'variation'          => ['variation'],
        'quantity'           => ['quantity'],
        'unit_price'         => ['sku unit original price'],
        'subtotal_before'    => ['sku subtotal before discount'],
        'platform_discount'  => ['sku platform discount'],
        'seller_discount'    => ['sku seller discount'],
        'subtotal_after'     => ['sku subtotal after discount'],
        'shipping_fee'       => ['shipping fee after discount'],
        'order_total'        => ['order amount'],
        'payment_method'     => ['payment method'],
        'buyer_username'     => ['buyer username'],
        'buyer_name'         => ['recipient'],
        'shipping_city'      => ['province', 'city'],
        'shipping_district'  => ['district'],
        'shipping_address'   => ['detail address'],
    ];

    public function parse(int $uploadId): array
    {
        $sheet = $this->sheet();
        $rows  = $sheet->toArray(null, false, true, false);
        $result = ['rows' => [], 'errors' => [], 'total_rows' => 0, 'imported_rows' => 0, 'skipped_rows' => 0];

        if (empty($rows)) return $result;

        // Row 0 = headers, Row 1 = descriptions (SKIP), Row 2+ = data
        $headers = array_map(fn($v) => (string)($v ?? ''), $rows[0]);
        $col     = $this->resolveColumns($headers, self::COLUMN_MAP);

        foreach ($rows as $i => $row) {
            // Skip header row (0) and description row (1)
            if ($i <= 1 || $this->isEmptyRow($row)) continue;
            $result['total_rows']++;

            $orderId   = $this->cell($row, $col['order_id'] ?? null);
            $sku       = $this->cell($row, $col['sku'] ?? null);
            $createdAt = parse_datetime_value($this->cell($row, $col['order_created_at'] ?? null));

            if (!$orderId || !$sku || !$createdAt) {
                $result['skipped_rows']++;
                $result['errors'][] = [
                    'row_number'   => $i + 1,
                    'raw_order_id' => $orderId,
                    'raw_sku'      => $sku,
                    'error_code'   => !$orderId ? 'missing_order_id' : (!$sku ? 'missing_sku' : 'invalid_date'),
                    'error_message'=> !$orderId ? 'Missing order ID.' : (!$sku ? 'Missing SKU.' : 'Invalid date.'),
                    'raw_payload'  => array_slice($row, 0, 10),
                ];
                continue;
            }

            $qty        = max(1, (int) parse_amount($this->cell($row, $col['quantity'] ?? null)));
            $unitPrice  = parse_amount($this->cell($row, $col['unit_price'] ?? null));
            $subtotalB  = parse_amount($this->cell($row, $col['subtotal_before'] ?? null)) ?: $unitPrice * $qty;
            $subtotalA  = parse_amount($this->cell($row, $col['subtotal_after'] ?? null));
            $orderTotal = parse_amount($this->cell($row, $col['order_total'] ?? null));
            $city       = normalize_city($this->cell($row, $col['shipping_city'] ?? null));

            $result['rows'][] = [
                'platform'                => 'tiktokshop',
                'order_id'               => $orderId,
                'buyer_username'         => $this->cell($row, $col['buyer_username'] ?? null),
                'buyer_name'             => $this->cell($row, $col['buyer_name'] ?? null),
                'shipping_address'       => $this->cell($row, $col['shipping_address'] ?? null),
                'shipping_district'      => $this->cell($row, $col['shipping_district'] ?? null),
                'shipping_city'          => $city,
                'payment_method'         => $this->cell($row, $col['payment_method'] ?? null),
                'sku'                    => $sku,
                'product_name'           => $this->cell($row, $col['product_name'] ?? null) ?? '',
                'variation'              => $this->cell($row, $col['variation'] ?? null),
                'quantity'               => $qty,
                'unit_price'             => $unitPrice,
                'subtotal_before_discount' => $subtotalB,
                'platform_discount'      => parse_amount($this->cell($row, $col['platform_discount'] ?? null)),
                'seller_discount'        => parse_amount($this->cell($row, $col['seller_discount'] ?? null)),
                'subtotal_after_discount'=> $subtotalA,
                'order_total'            => $orderTotal ?: $subtotalA,
                'shipping_fee'           => parse_amount($this->cell($row, $col['shipping_fee'] ?? null)),
                'platform_fee_fixed'     => 0,
                'platform_fee_service'   => 0,
                'platform_fee_payment'   => 0,
                'normalized_status'      => $this->normalizeStatus(
                    $this->cell($row, $col['status'] ?? null) ?? '',
                    $this->cell($row, $col['substatus'] ?? null) ?? ''
                ),
                'original_status'        => $this->cell($row, $col['status'] ?? null) ?? '',
                'order_created_at'       => $createdAt,
                'order_paid_at'          => parse_datetime_value($this->cell($row, $col['order_paid_at'] ?? null)),
                'order_completed_at'     => parse_datetime_value($this->cell($row, $col['order_completed_at'] ?? null)),
                'upload_id'              => $uploadId,
            ];
            $result['imported_rows']++;
        }
        return $result;
    }

    private function normalizeStatus(string $status, string $substatus): string
    {
        $s  = mb_strtolower(trim($status));
        $ss = mb_strtolower(trim($substatus));

        if (in_array($s, ['đã hoàn tất', 'completed', 'hoàn tất'], true)) return 'completed';
        if (str_contains($s, 'hủy') || str_contains($s, 'huỷ') || str_contains($s, 'cancel')) return 'cancelled';
        if (str_contains($s, 'vận chuyển') || str_contains($s, 'shipped') || str_contains($s, 'transit')) return 'delivered';
        if (str_contains($ss, 'đã giao') || str_contains($ss, 'delivered')) return 'delivered';
        return 'pending';
    }
}
