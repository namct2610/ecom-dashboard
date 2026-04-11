<?php

declare(strict_types=1);

namespace Dashboard;

/**
 * Lazada Open Platform API client
 * Handles OAuth2 authorization flow and signed API requests.
 *
 * Signing algorithm (from Lazada Open Platform docs):
 *   1. Sort all params alphabetically, exclude only 'sign' (access_token IS included)
 *   2. Concat: API_PATH + key1 + value1 + key2 + value2 ...
 *   3. HMAC-SHA256(concat_string, app_secret)
 *   4. Uppercase the hex result
 */
class LazadaClient
{
    // Vietnam endpoint — change for other regions
    public const API_URL    = 'https://api.lazada.vn/rest';
    public const AUTH_URL   = 'https://auth.lazada.com/oauth/authorize';
    public const TOKEN_URL  = 'https://auth.lazada.com/rest';

    private string $appKey;
    private string $appSecret;

    public function __construct(string $appKey, string $appSecret)
    {
        $this->appKey    = $appKey;
        $this->appSecret = $appSecret;
    }

    // ── Signing ───────────────────────────────────────────────────────────────

    public function sign(string $apiPath, array $params): string
    {
        $filtered = array_filter(
            $params,
            fn($k) => $k !== 'sign',
            ARRAY_FILTER_USE_KEY
        );
        ksort($filtered);

        $str = $apiPath;
        foreach ($filtered as $k => $v) {
            $str .= $k . $v;
        }

        return strtoupper(hash_hmac('sha256', $str, $this->appSecret));
    }

    // ── OAuth ─────────────────────────────────────────────────────────────────

    public function getAuthUrl(string $redirectUri, string $state = ''): string
    {
        $params = [
            'response_type' => 'code',
            'force_auth'    => 'true',
            'client_id'     => $this->appKey,
            'redirect_uri'  => $redirectUri,
        ];
        if ($state !== '') {
            $params['state'] = $state;
        }
        return self::AUTH_URL . '?' . http_build_query($params);
    }

    public function getAccessToken(string $code, string $redirectUri = ''): array
    {
        $path   = '/auth/token/create';
        $params = [
            'app_key'     => $this->appKey,
            'code'        => $code,
            'sign_method' => 'sha256',
            'timestamp'   => (string)(time() * 1000),
        ];
        // redirect_uri is NOT included in token exchange (only used in auth URL)
        $params['sign'] = $this->sign($path, $params);

        return $this->httpGet(self::TOKEN_URL . $path, $params);
    }

    public function refreshAccessToken(string $refreshToken): array
    {
        $path   = '/auth/token/refresh';
        $params = [
            'app_key'       => $this->appKey,
            'refresh_token' => $refreshToken,
            'sign_method'   => 'sha256',
            'timestamp'     => (string)(int)(microtime(true) * 1000),
        ];
        $params['sign'] = $this->sign($path, $params);

        return $this->httpGet(self::TOKEN_URL . $path, $params);
    }

    // ── Order API ─────────────────────────────────────────────────────────────

    /**
     * Get orders by time range.
     *
     * @param array $extra  Additional params: created_after, created_before, status,
     *                      offset, limit (max 100), sort_by, sort_direction
     */
    public function getOrders(string $accessToken, array $extra = []): array
    {
        $params = array_merge([
            'limit'    => 100,
            'offset'   => 0,
            'sort_by'  => 'created_at',
            'sort_direction' => 'DESC',
        ], $extra);

        return $this->get('/orders/get', $params, $accessToken);
    }

    /**
     * Get item details for up to 50 orders at once.
     *
     * @param array $orderIds  Array of numeric order IDs
     */
    public function getMultipleOrderItems(string $accessToken, array $orderIds): array
    {
        return $this->get('/orders/items/get', [
            'order_ids' => '[' . implode(',', $orderIds) . ']',
        ], $accessToken);
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────────

    private function get(string $apiPath, array $extra, string $accessToken): array
    {
        $params = array_merge([
            'app_key'      => $this->appKey,
            'sign_method'  => 'sha256',
            'timestamp'    => (string)(int)(microtime(true) * 1000),
            'access_token' => $accessToken,
        ], $extra);
        $params['sign'] = $this->sign($apiPath, $params);

        return $this->httpGet(self::API_URL . $apiPath, $params);
    }

    private function httpGet(string $baseUrl, array $params): array
    {
        $url = $baseUrl . '?' . http_build_query($params);
        $ch  = curl_init();
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

        if ($errno) {
            throw new \RuntimeException("cURL error ($errno): $error");
        }

        $decoded = json_decode((string)$response, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException("Lazada API returned invalid JSON (HTTP $httpCode): " . substr((string)$response, 0, 300));
        }

        return $decoded;
    }
}
