/**
 * OOHDASH-140: GET-only signed Tuya EU OpenAPI client.
 *
 * SECURITY: This module exports ONLY tuyaGet(path). There is no POST, PUT, PATCH or DELETE
 * code path. A unit test asserts this by scanning the module source. The path must match an
 * explicit allowlist before any signing or network call. The token, signature, client id,
 * secret and local_key values are never logged.
 *
 * Rate limits: max 4 in-flight concurrent, max 5 req/s token bucket.
 * Circuit breaker: 3 consecutive failures OR any 429/1009 → open 60s.
 * Timeout: 2500ms per request.
 */

import { createHash, createHmac } from 'node:crypto';
import { config } from '../config.js';
import { recordTuyaEvent } from './metrics.js';

const TUYA_HOST = 'https://openapi.tuyaeu.com';

// ── Path allowlist ──────────────────────────────────────────────────────────────
const ALLOWED_PATHS = [
    /^\/v1\.0\/token\?grant_type=1$/,
    /^\/v1\.0\/users\/[A-Za-z0-9]+\/devices\?page_size=100(&last_row_key=[^&]+)?$/,
    /^\/v2\.0\/cloud\/timer\/device\/[A-Za-z0-9]+(\?last_row_key=[^&]+)?$/,
    /^\/v2\.0\/cloud\/thing\/[A-Za-z0-9]+\/shadow\/properties\?codes=schedule$/
];

function checkAllowlist(path) {
    // Sort query params for signing — check against sorted form
    if (!ALLOWED_PATHS.some(re => re.test(path))) {
        throw Object.assign(new Error(`[TUYA] Path not in allowlist: ${path.split('?')[0]}`), { code: 'not-allowed' });
    }
}

// ── Token cache ────────────────────────────────────────────────────────────────
let _token = { value: '', expireAt: 0 };
let _tokenRefreshPromise = null;

async function _doGrantToken() {
    const path = '/v1.0/token?grant_type=1';
    const result = await _rawRequest(path, '');
    if (!result.success) throw new Error(`[TUYA] Token grant failed: code ${result.code}`);
    const data = result.result || {};
    const newValue = data.access_token || '';
    if (_token.value && newValue && newValue !== _token.value) {
        console.warn('[TUYA] token_changed_early');
        recordTuyaEvent('tuyaTokenChangedEarly');
    }
    _token = {
        value: newValue,
        expireAt: Date.now() + ((data.expire_time || 7200) - 60) * 1000
    };
    return _token.value;
}

async function getToken() {
    if (_token.value && Date.now() < _token.expireAt) return _token.value;
    if (_tokenRefreshPromise) return _tokenRefreshPromise;
    _tokenRefreshPromise = _doGrantToken().finally(() => { _tokenRefreshPromise = null; });
    return _tokenRefreshPromise;
}

// ── Rate limiter: 4 in-flight + 5 req/s token bucket ──────────────────────────
let _inFlight = 0;
const MAX_IN_FLIGHT = 4;
const BUCKET_CAPACITY = 5;
const BUCKET_REFILL_MS = 1000;
let _tokens = BUCKET_CAPACITY;
let _lastRefill = Date.now();
const _waitQueue = [];

function _refillBucket() {
    const now = Date.now();
    const elapsed = now - _lastRefill;
    const toAdd = Math.floor(elapsed / BUCKET_REFILL_MS) * BUCKET_CAPACITY;
    if (toAdd > 0) {
        _tokens = Math.min(BUCKET_CAPACITY, _tokens + toAdd);
        _lastRefill = now;
    }
}

function _tryAcquire() {
    _refillBucket();
    if (_inFlight >= MAX_IN_FLIGHT) return false;
    if (_tokens < 1) return false;
    _tokens--;
    _inFlight++;
    return true;
}

function _release() {
    _inFlight--;
    // Drain the wait queue
    while (_waitQueue.length && _tryAcquire()) {
        const resolve = _waitQueue.shift();
        resolve();
    }
    if (_waitQueue.length && _inFlight < MAX_IN_FLIGHT) {
        // If we released but didn't drain (bucket empty), schedule a retry
    }
}

function _acquireSlot(timeoutMs) {
    if (_tryAcquire()) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const idx = _waitQueue.indexOf(resolve);
            if (idx >= 0) _waitQueue.splice(idx, 1);
            reject(Object.assign(new Error('[TUYA] Rate limit: too many concurrent requests'), { reason: 'rate-limited' }));
        }, timeoutMs);
        _waitQueue.push(() => { clearTimeout(timer); resolve(); });
    });
}

// ── Circuit breaker ────────────────────────────────────────────────────────────
let _consecutiveFailures = 0;
let _breakerOpenUntil = 0;
const BREAKER_THRESHOLD = 3;
const BREAKER_OPEN_MS = 60000;

function _checkBreaker() {
    if (Date.now() < _breakerOpenUntil) {
        throw Object.assign(new Error('[TUYA] Circuit breaker open'), { reason: 'circuit-open' });
    }
}

function _recordFailure(isRateLimit = false) {
    if (isRateLimit || ++_consecutiveFailures >= BREAKER_THRESHOLD) {
        const wasOpen = Date.now() < _breakerOpenUntil;
        _breakerOpenUntil = Date.now() + BREAKER_OPEN_MS;
        _consecutiveFailures = 0;
        if (!wasOpen) recordTuyaEvent('tuyaBreakerOpenings');
    }
}

function _recordSuccess() {
    _consecutiveFailures = 0;
}

// ── Signing (ported from Tuya Scheduler _sign) ─────────────────────────────────
function _sign(method, path, tokenValue) {
    const ts = String(Date.now());
    const body = '';
    const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
    const strToSign = [method, bodyHash, '', decodeURIComponent(path)].join('\n');
    const signStr = config.tuya.clientId + tokenValue + ts + strToSign;
    const sign = createHmac('sha256', config.tuya.clientSecret)
        .update(signStr, 'utf8')
        .digest('hex')
        .toUpperCase();
    const headers = {
        client_id: config.tuya.clientId,
        sign,
        t: ts,
        sign_method: 'HMAC-SHA256'
    };
    if (tokenValue) headers.access_token = tokenValue;
    return headers;
}

// ── Sort query params before signing ──────────────────────────────────────────
function _sortedPath(path) {
    const [base, query] = path.split('?');
    if (!query) return path;
    const params = new URLSearchParams(query);
    params.sort();
    return `${base}?${params.toString()}`;
}

// ── Raw request (no auth, used for token grant) ───────────────────────────────
async function _rawRequest(path, tokenValue) {
    const sorted = _sortedPath(path);
    const headers = _sign('GET', sorted, tokenValue);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
        const res = await fetch(`${TUYA_HOST}${sorted}`, {
            method: 'GET',
            headers: { ...headers, 'Content-Type': 'application/json' },
            signal: controller.signal
        });
        if (!res.ok) {
            const isRateLimit = res.status === 429;
            if (isRateLimit) recordTuyaEvent('tuyaRateLimits');
            throw Object.assign(new Error(`[TUYA] HTTP ${res.status}`), { httpStatus: res.status, rateLimited: isRateLimit });
        }
        const json = await res.json();
        if (!json.success) {
            const code = json.code;
            const isRateLimit = code === 1009;
            if (isRateLimit) recordTuyaEvent('tuyaRateLimits');
            throw Object.assign(new Error(`[TUYA] API error code ${code}`), { tuyaCode: code, rateLimited: isRateLimit });
        }
        return json;
    } finally {
        clearTimeout(timer);
    }
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * GET-only Tuya OpenAPI call. Path must match the allowlist.
 * Handles token caching, rate limiting, circuit breaker and retry on token errors.
 */
export async function tuyaGet(path) {
    checkAllowlist(path);
    _checkBreaker();

    const start = Date.now();

    // Acquire rate-limit slot (timeout = 2500ms so it fits within the request budget)
    await _acquireSlot(2500).catch(err => {
        recordTuyaEvent('tuyaRateLimits');
        recordTuyaEvent('tuyaFailures');
        throw err;
    });

    recordTuyaEvent('tuyaCalls');

    const isTokenPath = path.startsWith('/v1.0/token');
    let attempt = 0;

    try {
        while (attempt < 2) {
            attempt++;
            const tokenValue = isTokenPath ? '' : await getToken();
            const sorted = _sortedPath(path);
            const headers = _sign('GET', sorted, tokenValue);

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2500);
            try {
                const res = await fetch(`${TUYA_HOST}${sorted}`, {
                    method: 'GET',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    signal: controller.signal
                });

                const elapsed = Date.now() - start;
                console.info(`[TUYA] GET ${path.split('?')[0]} status=${res.status} ${elapsed}ms`);

                if (res.status === 429) {
                    recordTuyaEvent('tuyaRateLimits');
                    _recordFailure(true);
                    throw Object.assign(new Error('[TUYA] Rate limited (HTTP 429)'), { reason: 'rate-limited' });
                }

                if (!res.ok) {
                    _recordFailure();
                    recordTuyaEvent('tuyaFailures');
                    throw new Error(`[TUYA] HTTP ${res.status}`);
                }

                const json = await res.json();

                if (!json.success) {
                    const code = json.code;
                    if (code === 1009) {
                        recordTuyaEvent('tuyaRateLimits');
                        _recordFailure(true);
                        throw Object.assign(new Error('[TUYA] Rate limited (1009)'), { reason: 'rate-limited' });
                    }
                    if ((code === 1010 || code === 1011) && !isTokenPath && attempt === 1) {
                        // Token invalid — drop it and retry once
                        _token = { value: '', expireAt: 0 };
                        continue;
                    }
                    _recordFailure();
                    recordTuyaEvent('tuyaFailures');
                    throw Object.assign(new Error(`[TUYA] API error code ${code}: ${json.msg}`), { tuyaCode: code });
                }

                _recordSuccess();
                return json;

            } catch (err) {
                clearTimeout(timer);
                if (err.name === 'AbortError') {
                    _recordFailure();
                    recordTuyaEvent('tuyaFailures');
                    throw Object.assign(new Error('[TUYA] Request timed out'), { reason: 'timeout' });
                }
                throw err;
            } finally {
                clearTimeout(timer);
            }
        }

        // Exhausted retries
        _recordFailure();
        recordTuyaEvent('tuyaFailures');
        throw new Error('[TUYA] Token refresh retry exhausted');

    } finally {
        _release();
    }
}

// Exported for testing only
export function _resetForTest() {
    _token = { value: '', expireAt: 0 };
    _tokenRefreshPromise = null;
    _consecutiveFailures = 0;
    _breakerOpenUntil = 0;
    _inFlight = 0;
    _tokens = BUCKET_CAPACITY;
    _lastRefill = Date.now();
    _waitQueue.length = 0;
}

export function _getBreakerState() {
    return { open: Date.now() < _breakerOpenUntil, openUntil: _breakerOpenUntil };
}
