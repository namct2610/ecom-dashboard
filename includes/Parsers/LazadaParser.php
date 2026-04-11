<?php

declare(strict_types=1);

namespace Dashboard\Parsers;

final class LazadaParser extends BaseParser
{
    private const COLUMN_MAP = [
        'order_item_id'   => ['orderitemid'],
        'order_id'        => ['ordernumber', 'order number'],
        'order_created_at'=> ['createtime', 'create time'],
        'order_paid_at'   => ['updatetime', 'update time'],
        'delivered_at'    => ['delivereddate', 'delivered date'],
        'status'          => ['status'],
        'cancel_reason'   => ['buyerfaileddeliveryreason', 'cancelreason'],
        'buyer_name'      => ['customername', 'customer name', 'shippingname', 'shipping name'],
        'shipping_city'   => ['shippingcity', 'shipping city'],
        'shipping_region' => ['shippingregion', 'shipping region'],
        'payment_method'  => ['paymethod', 'pay method'],
        'sku'             => ['sellersku', 'seller sku'],
        'product_name'    => ['itemname', 'item name'],
        'variation'       => ['variation'],
        'unit_price'      => ['unitprice', 'unit price'],
        'paid_price'      => ['paidprice', 'paid price'],
        'seller_discount' => ['sellerdisctotal', 'seller discount total', 'sellerdiscounttotal'],
        'shipping_fee'    => ['shippingfee', 'shipping fee'],
        'tracking_code'   => ['trackingcode', 'tracking code', 'cdtrackingcode'],
    ];

    public function parse(int $uploadId): array
    {
        $sheet = $this->sheet();
        $rows  = $sheet->toArray(null, false, true, false);
        $result = ['rows' => [], 'errors' => [], 'total_rows' => 0, 'imported_rows' => 0, 'skipped_rows' => 0];

        if (empty($rows)) return $result;

        $headers = array_map(fn($v) => (string)($v ?? ''), $rows[0]);
        $col     = $this->resolveColumns($headers, self::COLUMN_MAP);

        foreach ($rows as $i => $row) {
            if ($i === 0 || $this->isEmptyRow($row)) continue;
            $result['total_rows']++;

            // Use orderNumber as order_id; fall back to orderItemId
            $orderId   = $this->cell($row, $col['order_id'] ?? null)
                      ?? $this->cell($row, $col['order_item_id'] ?? null);
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

            $paidPrice     = parse_amount($this->cell($row, $col['paid_price'] ?? null));
            $unitPrice     = parse_amount($this->cell($row, $col['unit_price'] ?? null));
            $sellerDisc    = abs(parse_amount($this->cell($row, $col['seller_discount'] ?? null)));
            $city          = normalize_city(
                $this->cell($row, $col['shipping_city'] ?? null)
                ?? $this->cell($row, $col['shipping_region'] ?? null)
            );

            $result['rows'][] = [
                'platform'                => 'lazada',
                'order_id'               => $orderId,
                'buyer_name'             => $this->cell($row, $col['buyer_name'] ?? null),
                'buyer_username'         => null,
                'shipping_address'       => null, // Lazada masks address
                'shipping_district'      => null,
                'shipping_city'          => $city,
                'payment_method'         => $this->cell($row, $col['payment_method'] ?? null),
                'sku'                    => $sku,
                'product_name'           => $this->cell($row, $col['product_name'] ?? null) ?? '',
                'variation'              => $this->cell($row, $col['variation'] ?? null),
                'quantity'               => 1,
                'unit_price'             => $unitPrice,
                'subtotal_before_discount' => $unitPrice,
                'platform_discount'      => 0,
                'seller_discount'        => $sellerDisc,
                'subtotal_after_discount'=> $paidPrice,
                'order_total'            => $paidPrice,
                'shipping_fee'           => parse_amount($this->cell($row, $col['shipping_fee'] ?? null)),
                'platform_fee_fixed'     => 0,
                'platform_fee_service'   => 0,
                'platform_fee_payment'   => 0,
                'normalized_status'      => $this->normalizeStatus($this->cell($row, $col['status'] ?? null) ?? ''),
                'original_status'        => $this->cell($row, $col['status'] ?? null) ?? '',
                'order_created_at'       => $createdAt,
                'order_paid_at'          => null,
                'order_completed_at'     => parse_datetime_value($this->cell($row, $col['delivered_at'] ?? null)),
                'upload_id'              => $uploadId,
            ];
            $result['imported_rows']++;
        }
        return $result;
    }

    private function normalizeStatus(string $s): string
    {
        $s = strtolower(trim($s));
        if (in_array($s, ['delivered', 'confirmed', 'success', 'complete', 'completed'], true)) return 'completed';
        if (in_array($s, ['pending_confirmation', 'handover_to_logistics', 'shipped', 'in transit'], true)) return 'delivered';
        if (str_contains($s, 'cancel')) return 'cancelled';
        if (str_contains($s, 'return') || str_contains($s, 'refund')) return 'cancelled';
        return 'pending';
    }
}
