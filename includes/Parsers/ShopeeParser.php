<?php

declare(strict_types=1);

namespace Dashboard\Parsers;

final class ShopeeParser extends BaseParser
{
    private const COLUMN_MAP = [
        'order_id'           => ['mã đơn hàng', 'order id'],
        'order_created_at'   => ['ngày đặt hàng', 'thời gian tạo đơn'],
        'order_paid_at'      => ['thời gian đơn hàng được thanh toán', 'thời gian thanh toán'],
        'order_completed_at' => ['thời gian hoàn thành đơn hàng', 'thời gian hoàn thành đơn'],
        'status'             => ['trạng thái đơn hàng', 'trạng thái'],
        'cancel_reason'      => ['lý do hủy', 'lý do huỷ'],
        'buyer_username'     => ['người mua', 'tên đăng nhập người mua'],
        'buyer_name'         => ['tên người nhận', 'họ & tên'],
        'shipping_address'   => ['địa chỉ nhận hàng'],
        'shipping_city'      => ['tỉnh/thành phố', 'tỉnh/thành', 'khu vực'],
        'shipping_district'  => ['tp / quận / huyện', 'quận/huyện', 'quận huyện'],
        'payment_method'     => ['phương thức thanh toán'],
        'tracking_code'      => ['mã vận đơn'],
        'shipping_provider'  => ['đơn vị vận chuyển'],
        'sku'                => ['sku sản phẩm', 'mã sku', 'seller sku'],
        'product_name'       => ['tên sản phẩm', 'product name'],
        'variation'          => ['tên phân loại hàng', 'phân loại'],
        'unit_price'         => ['giá gốc', 'đơn giá'],
        'seller_voucher'     => ['mã giảm giá của shop', 'mã giảm giá từ shop'],
        'seller_discount_total' => ['tổng số tiền được người bán trợ giá'],
        'seller_discount_unit'  => ['người bán trợ giá', 'giảm giá người bán'],
        'platform_discount'  => ['được shopee trợ giá', 'giảm giá shopee'],
        'promo_price'        => ['giá ưu đãi', 'giá sau giảm'],
        'quantity'           => ['số lượng'],
        'order_total'        => ['tổng giá trị đơn hàng', 'tổng tiền'],
        'shipping_fee'       => ['phí vận chuyển mà người mua trả', 'phí vận chuyển'],
        'platform_fee_fixed'   => ['phí cố định'],
        'platform_fee_service' => ['phí dịch vụ'],
        'platform_fee_payment' => ['phí thanh toán'],
    ];

    public function parse(int $uploadId): array
    {
        $sheet = $this->sheet();
        $rows  = $sheet->toArray(null, false, true, false);
        $result = ['rows' => [], 'errors' => [], 'total_rows' => 0, 'imported_rows' => 0, 'skipped_rows' => 0];
        $voucherAppliedOrders = [];

        if (empty($rows)) return $result;

        $headers = array_map(fn($v) => (string)($v ?? ''), $rows[0]);
        $col     = $this->resolveColumns($headers, self::COLUMN_MAP);

        foreach ($rows as $i => $row) {
            if ($i === 0 || $this->isEmptyRow($row)) continue;
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
            $promoPrice = parse_amount($this->cell($row, $col['promo_price'] ?? null));
            $sellerVoucherRaw = abs(parse_amount($this->cell($row, $col['seller_voucher'] ?? null)));
            $sellerVoucher = isset($voucherAppliedOrders[$orderId]) ? 0.0 : $sellerVoucherRaw;
            $voucherAppliedOrders[$orderId] = true;
            $sellerDiscountTotal = abs(parse_amount($this->cell($row, $col['seller_discount_total'] ?? null)));
            if ($sellerDiscountTotal <= 0) {
                $sellerDiscountTotal = abs(parse_amount($this->cell($row, $col['seller_discount_unit'] ?? null))) * $qty;
            }
            $city       = normalize_city($this->cell($row, $col['shipping_city'] ?? null));

            $result['rows'][] = [
                'platform'                => 'shopee',
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
                'subtotal_before_discount' => $unitPrice * $qty,
                'platform_discount'      => parse_amount($this->cell($row, $col['platform_discount'] ?? null)),
                'seller_voucher'         => $sellerVoucher,
                'seller_discount'        => $sellerDiscountTotal,
                'subtotal_after_discount'=> $promoPrice * $qty,
                'order_total'            => parse_amount($this->cell($row, $col['order_total'] ?? null)),
                'shipping_fee'           => parse_amount($this->cell($row, $col['shipping_fee'] ?? null)),
                'platform_fee_fixed'     => parse_amount($this->cell($row, $col['platform_fee_fixed'] ?? null)),
                'platform_fee_service'   => parse_amount($this->cell($row, $col['platform_fee_service'] ?? null)),
                'platform_fee_payment'   => parse_amount($this->cell($row, $col['platform_fee_payment'] ?? null)),
                'normalized_status'      => $this->normalizeStatus($this->cell($row, $col['status'] ?? null) ?? ''),
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

    private function normalizeStatus(string $s): string
    {
        $s = mb_strtolower(trim($s));
        if ($s === 'hoàn thành') return 'completed';
        if ($s === 'đã giao' || str_contains($s, 'người mua xác nhận đã nhận') || $s === 'đã hoàn tất') return 'delivered';
        if ($s === 'đã hủy' || $s === 'đã huỷ') return 'cancelled';
        if (str_contains($s, 'hủy') || str_contains($s, 'huỷ') || str_contains($s, 'cancel')) return 'cancelled';
        return 'pending';
    }
}
