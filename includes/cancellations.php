<?php

declare(strict_types=1);

/**
 * Phân loại phục vụ phân tích huỷ đơn. Giá trị gốc vẫn lưu nguyên văn trong
 * orders (payment_method, cancel_reason); việc gom nhóm chỉ làm lúc đọc, để đổi
 * cách gom sau này không phải nhập lại dữ liệu.
 *
 * Trả về MÃ nhóm (không phải nhãn) — giao diện dịch sang tiếng Việt/Anh qua i18n.
 */

function cancel_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    if (class_exists('\Normalizer')) {
        $d = \Normalizer::normalize($s, \Normalizer::FORM_D);
        if (is_string($d)) {
            $s = preg_replace('/\p{Mn}+/u', '', $d) ?? $s;
        }
    }
    return str_replace('đ', 'd', $s);
}

/**
 * Ba sàn gọi cùng một phương thức bằng nhiều tên: "Thanh toán khi nhận hàng",
 * "COD", "Cash on Delivery", "Thanh toán khi giao hàng" đều là COD. Thứ tự kiểm
 * tra có chủ đích: trả sau trước (MOMO_BNPL không phải ví), ngân hàng trước ví
 * ("TK Ngân hàng liên kết ShopeePay" là ngân hàng), ngân hàng trước thẻ
 * ("Thẻ ATM nội địa" là thẻ ngân hàng nội địa, không phải thẻ quốc tế).
 *
 * Ô trống tách riêng thành 'none': đơn huỷ trước khi chọn phương thức thường
 * không ghi gì (gần như toàn bộ là đơn huỷ), gộp vào 'other' sẽ làm nhóm đó
 * trông như huỷ ~90% và gây hiểu nhầm.
 *
 * @return string cod|card|bank|wallet|bnpl|none|other
 */
function cancel_payment_group(string $method): string
{
    $m = cancel_fold($method);
    if ($m === '') return 'none';
    $has = static fn(array $needles): bool => (bool) array_filter($needles, static fn($n) => str_contains($m, $n));

    if ($has(['paylater', 'pay later', 'pay_later', 'bnpl', 'tra sau'])) return 'bnpl';
    if ($has(['khi nhan hang', 'khi giao hang', 'cash on delivery']) || preg_match('/\bcod\b/', $m)) return 'cod';
    if ($has(['ngan hang', 'bank', 'napas', 'atm', 'vietqr', 'vnpay', 'sacombank'])) return 'bank';
    if ($has(['the tin dung', 'ghi no', 'credit', 'debit', 'mixedcard', 'card', 'apple pay', 'google pay'])) return 'card';
    if ($has(['vi ', 'vi dien tu', 'wallet', 'momo', 'zalopay', 'shopeepay', 'so du', 'vtpvn', 'vnpt', 'balance'])) return 'wallet';
    return 'other';
}

/**
 * Shopee ghi gộp "ai huỷ" và "lý do" trong một ô:
 *   "Hủy bởi người mua  lí do là: Thay đổi đơn hàng"
 *   "Tự động hủy bởi hệ thống Shopee  lí do là: Chưa được Thanh Toán"
 * Phần trước "lí do là:" cho biết ai huỷ, phần sau là lý do. Cùng một lý do có
 * thể ở tiếng Việt hoặc tiếng Anh ("Need to change delivery address"), nên nhóm
 * theo từ khoá của cả hai thứ tiếng.
 *
 * @return array{who:string,group:string}
 *   who:   buyer|system|seller|unknown
 *   group: change_order|change_address|unpaid|failed_delivery|seller_issue|
 *          out_of_stock|shipping|cheaper|return|other
 *
 * Lazada/TikTok không ghi "ai huỷ" (trừ khi câu có "hệ thống"/"tự động"), nên
 * who thường là 'unknown' — để nguyên thay vì đoán.
 */
function cancel_reason_classify(string $raw): array
{
    $f = cancel_fold($raw);
    $who = 'unknown';
    $reason = $f;

    if (preg_match('/^(.*?)l[iy] do la\s*:\s*(.*)$/u', $f, $m)) {
        $prefix = $m[1];
        $reason = trim($m[2]);
    } else {
        $prefix = $f;
    }
    if (str_contains($prefix, 'nguoi mua') || str_contains($prefix, 'buyer')) $who = 'buyer';
    elseif (str_contains($prefix, 'he thong') || str_contains($prefix, 'system') || str_contains($prefix, 'tu dong')) $who = 'system';
    elseif (str_contains($prefix, 'nguoi ban') || str_contains($prefix, 'seller')) $who = 'seller';

    $has = static fn(array $needles): bool => (bool) array_filter($needles, static fn($n) => str_contains($reason, $n));

    if ($reason === '') $group = 'other';
    elseif ($has(['dia chi', 'address'])) $group = 'change_address';
    elseif ($has(['chua duoc thanh toan', 'chua thanh toan', 'tre han thanh toan', 'qua han thanh toan', 'unpaid', 'not paid', 'payment'])) $group = 'unpaid';
    elseif ($has(['giao hang that bai', 'giao that bai', 'failed delivery', 'delivery fail', 'khong nhan hang', 'refused'])) $group = 'failed_delivery';
    elseif ($has(['khong xu ly', 'dung han', 'khong tra loi', 'thoi gian lay hang', 'seller did not', 'not respond'])) $group = 'seller_issue';
    elseif ($has(['het hang', 'out of stock'])) $group = 'out_of_stock';
    elseif ($has(['don vi van chuyen', 'giao hang qua lau', 'thoi gian giao hang', 'van chuyen', 'shipping', 'delivery time', 'carrier'])) $group = 'shipping';
    elseif ($has(['gia re hon', 'cheaper', 'khong muon mua', 'doi y', 'change of mind', 'changed mind'])) $group = 'cheaper';
    elseif ($has(['tra hang', 'hoan tien', 'return', 'refund'])) $group = 'return';
    elseif ($has(['thay doi don', 'thay doi san pham', 'them/xoa san pham', 'them san pham', 'xoa san pham', 'trung don', 'voucher', 'change order', 'modify', 'change product', 'duplicate'])) $group = 'change_order';
    else $group = 'other';

    return ['who' => $who, 'group' => $group];
}
