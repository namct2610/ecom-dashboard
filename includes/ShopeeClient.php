<?php

declare(strict_types=1);

namespace Dashboard;

/**
 * Shopee Open Platform API client (v2)
 *
 * Signing algorithm:
 *   Shop API  : HMAC-SHA256( partner_id + api_path + timestamp + access_token + shop_id, partner_key )
 *   Auth API  : HMAC-SHA256( partner_id + api_path + timestamp, partner_key )
 *
 * Docs: https://open.shopee.com/developer-guide/
 */
class ShopeeClient
{
    public const BASE_URL = 'https://partner.shopeemobile.com/api/v2';

    private int    $partnerId;
    private string $partnerKey;

    public function __construct(int $partnerId, string $partnerKey)
    {
        $this->partnerId  = $partnerId;
        $this->partnerKey = $partnerKey;
    }

    // ── Signing ───────────────────────────────────────────────────────────────

    public function sign(string $path, int $timestamp, string $accessToken = '', int $shopId = 0): string
    {
        $base = (string) $this->partnerId . $path . $timestamp;
        if ($accessToken !== '') $base .= $accessToken;
        if ($shopId > 0)         $base .= (string) $shopId;
        return hash_hmac('sha256', $base, $this->partnerKey);
    }

    // ── OAuth ─────────────────────────────────────────────────────────────────

    public function getAuthUrl(string $redirectUri, string $state = ''): string
    {
        $path      = '/api/v2/shop/auth_partner';
        $timestamp = time();
        $sign      = $this->sign($path, $timestamp);

        $params = [
            'partner_id' => $this->partnerId,
            'timestamp'  => $timestamp,
            'sign'       => $sign,
            'redirect'   => $redirectUri,
        ];
        if ($state !== '') $params['state'] = $state;

        return self::BASE_URL . '/shop/auth_partner?' . http_build_query($params);
    }

    /** Exchange auth code for access + refresh token. */
    public function getAccessToken(string $code, int $shopId): array
    {
        $path      = '/api/v2/auth/token/get';
        $timestamp = time();
        $sign      = $this->sign($path, $timestamp);

        $query = http_build_query([
            'partner_id' => $this->partnerId,
            'timestamp'  => $timestamp,
            'sign'       => $sign,
        ]);

        return $this->httpPost(
            self::BASE_URL . $path . '?' . $query,
            ['code' => $code, 'shop_id' => $shopId, 'partner_id' => $this->partnerId]
        );
    }

    /** Refresh an expired access token. */
    public function refreshAccessToken(string $refreshToken, int $shopId): array
    {
        $path      = '/api/v2/auth/access_token/get';
        $timestamp = time();
        $sign      = $this->sign($path, $timestamp);

        $query = http_build_query([
            'partner_id' => $this->partnerId,
            'timestamp'  => $timestamp,
            'sign'       => $sign,
        ]);

        return $this->httpPost(
            self::BASE_URL . $path . '?' . $query,
            ['refresh_token' => $refreshToken, 'shop_id' => $shopId, 'partner_id' => $this->partnerId]
        );
    }

    // ── Shop info ─────────────────────────────────────────────────────────────

    public function getShopInfo(string $accessToken, int $shopId): array
    {
        return $this->get('/api/v2/shop/get_shop_info', [], $accessToken, $shopId);
    }

    // ── Orders API ────────────────────────────────────────────────────────────

    /**
     * Get a page of orders.
     *
     * @param array $extra  time_range_field, time_from, time_to, page_size, cursor, order_status
     */
    public function getOrderList(string $accessToken, int $shopId, array $extra = []): array
    {
        $params = array_merge([
            'time_range_field' => 'create_time',
            'page_size'        => 100,
            'cursor'           => '',
        ], $extra);

        return $this->get('/api/v2/order/get_order_list', $params, $accessToken, $shopId);
    }

    /**
     * Get full order details for up to 50 orders at once.
     *
     * @param string[] $orderSnList
     */
    public function getOrderDetail(string $accessToken, int $shopId, array $orderSnList): array
    {
        return $this->get('/api/v2/order/get_order_detail', [
            'order_sn_list'            => implode(',', $orderSnList),
            'response_optional_fields' => 'buyer_username,recipient_address,item_list,'
                . 'payment_method,actual_shipping_fee,total_amount,seller_discount,'
                . 'shopee_discount,estimated_shipping_fee,order_status',
        ], $accessToken, $shopId);
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────────

    private function get(string $path, array $extra, string $accessToken, int $shopId): array
    {
        $timestamp = time();
        $sign      = $this->sign($path, $timestamp, $accessToken, $shopId);

        $params = array_merge([
            'partner_id'   => $this->partnerId,
            'timestamp'    => $timestamp,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
            'sign'         => $sign,
        ], $extra);

        return $this->httpGet(self::BASE_URL . $path . '?' . http_build_query($params));
    }

    private function httpGet(string $url): array
    {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT      => 'DashboardV3/1.0',
        ]);
        $response = curl_exec($ch);
        $errno    = curl_errno($ch);
        $error    = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno) throw new \RuntimeException("cURL error ($errno): $error");

        $decoded = json_decode((string) $response, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException("Shopee API returned non-JSON (HTTP $httpCode): " . substr((string) $response, 0, 200));
        }
        return $decoded;
    }

    private function httpPost(string $url, array $body): array
    {
        $json = json_encode($body);
        $ch   = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_USERAGENT      => 'DashboardV3/1.0',
        ]);
        $response = curl_exec($ch);
        $errno    = curl_errno($ch);
        $error    = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno) throw new \RuntimeException("cURL error ($errno): $error");

        $decoded = json_decode((string) $response, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException("Shopee API returned non-JSON (HTTP $httpCode): " . substr((string) $response, 0, 200));
        }
        return $decoded;
    }
}
