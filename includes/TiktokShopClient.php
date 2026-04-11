<?php

declare(strict_types=1);

namespace Dashboard;

/**
 * TikTok Shop Open Platform API client (v202309)
 * Handles OAuth2 authorization flow and signed API requests.
 */
class TiktokShopClient
{
    public const BASE_URL     = 'https://open-api.tiktokglobalshop.com';
    public const AUTH_URL     = 'https://auth.tiktok-shops.com/oauth/authorize';
    public const TOKEN_PATH   = '/api/v2/token/get';
    public const REFRESH_PATH = '/api/v2/token/refresh';

    private string $appKey;
    private string $appSecret;

    public function __construct(string $appKey, string $appSecret)
    {
        $this->appKey    = $appKey;
        $this->appSecret = $appSecret;
    }

    // ── Signing ───────────────────────────────────────────────────────────────

    /**
     * Compute HMAC-SHA256 signature.
     * Algorithm: APP_SECRET + path + sorted(key+val pairs, excluding sign/access_token) + APP_SECRET
     * signed with APP_SECRET as the HMAC key.
     */
    public function sign(string $path, array $params): string
    {
        $filtered = array_filter(
            $params,
            fn($k) => !in_array($k, ['sign', 'access_token'], true),
            ARRAY_FILTER_USE_KEY
        );
        ksort($filtered);

        $str = $path;
        foreach ($filtered as $k => $v) {
            $str .= $k . $v;
        }

        return hash_hmac('sha256', $this->appSecret . $str . $this->appSecret, $this->appSecret);
    }

    // ── OAuth ─────────────────────────────────────────────────────────────────

    public function getAuthUrl(string $state, string $redirectUri = ''): string
    {
        $params = ['app_key' => $this->appKey, 'state' => $state];
        if ($redirectUri) {
            $params['redirect_uri'] = $redirectUri;
        }
        return self::AUTH_URL . '?' . http_build_query($params);
    }

    public function getAccessToken(string $authCode): array
    {
        $params = [
            'app_key'    => $this->appKey,
            'app_secret' => $this->appSecret,
            'auth_code'  => $authCode,
            'grant_type' => 'authorized_code',
            'timestamp'  => (string) time(),
        ];
        $params['sign'] = $this->sign(self::TOKEN_PATH, $params);

        return $this->httpPost(self::BASE_URL . self::TOKEN_PATH, $params, false);
    }

    public function refreshAccessToken(string $refreshToken): array
    {
        $params = [
            'app_key'       => $this->appKey,
            'app_secret'    => $this->appSecret,
            'refresh_token' => $refreshToken,
            'grant_type'    => 'refresh_token',
            'timestamp'     => (string) time(),
        ];
        $params['sign'] = $this->sign(self::REFRESH_PATH, $params);

        return $this->httpPost(self::BASE_URL . self::REFRESH_PATH, $params, false);
    }

    // ── Shop API ──────────────────────────────────────────────────────────────

    public function getAuthorizedShops(string $accessToken): array
    {
        return $this->get('/api/shop/get_authorized_shop', [], $accessToken);
    }

    // ── Order API ─────────────────────────────────────────────────────────────

    /**
     * Search orders by time range (unix timestamps).
     * @return array ['code'=>0, 'data'=>['order_list'=>[...], 'next_page_token'=>'...']]
     */
    public function searchOrders(
        string $accessToken,
        string $shopCipher,
        int    $createTimeFrom,
        int    $createTimeTo,
        int    $pageSize = 50,
        string $pageToken = ''
    ): array {
        $body = [
            'create_time_from' => $createTimeFrom,
            'create_time_to'   => $createTimeTo,
            'page_size'        => $pageSize,
            'sort_type'        => 1,
            'sort_field'       => 'create_time',
        ];
        if ($pageToken !== '') {
            $body['page_token'] = $pageToken;
        }
        return $this->postJson('/api/orders/search', $body, $accessToken, $shopCipher);
    }

    /**
     * Get full order details for a list of order IDs.
     */
    public function getOrderDetails(string $accessToken, string $shopCipher, array $orderIds): array
    {
        return $this->postJson(
            '/api/orders/detail/query',
            ['order_id_list' => $orderIds],
            $accessToken,
            $shopCipher
        );
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────────

    private function buildSignedQuery(string $path, array $extra, ?string $accessToken, string $shopCipher): array
    {
        $params = array_merge(['app_key' => $this->appKey, 'timestamp' => (string) time()], $extra);
        if ($shopCipher !== '') {
            $params['shop_cipher'] = $shopCipher;
        }
        if ($accessToken !== null) {
            $params['access_token'] = $accessToken;
        }
        $params['sign'] = $this->sign($path, $params);
        return $params;
    }

    private function get(string $path, array $extra = [], ?string $accessToken = null, string $shopCipher = ''): array
    {
        $params = $this->buildSignedQuery($path, $extra, $accessToken, $shopCipher);
        $url    = self::BASE_URL . $path . '?' . http_build_query($params);
        return $this->httpGet($url);
    }

    private function postJson(string $path, array $body, ?string $accessToken, string $shopCipher = ''): array
    {
        $params = $this->buildSignedQuery($path, [], $accessToken, $shopCipher);
        $url    = self::BASE_URL . $path . '?' . http_build_query($params);
        return $this->httpPost($url, $body, true);
    }

    private function httpGet(string $url): array
    {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        return $this->execCurl($ch);
    }

    private function httpPost(string $url, array $data, bool $asJson): array
    {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        if ($asJson) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_UNESCAPED_UNICODE));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        } else {
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
        }
        return $this->execCurl($ch);
    }

    private function execCurl(\CurlHandle $ch): array
    {
        $response = curl_exec($ch);
        $errno    = curl_errno($ch);
        $error    = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno) {
            throw new \RuntimeException("cURL error ($errno): $error");
        }

        $decoded = json_decode((string) $response, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException("TikTok API returned invalid JSON (HTTP $httpCode): " . substr((string) $response, 0, 300));
        }

        return $decoded;
    }
}
