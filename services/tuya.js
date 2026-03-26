/**
 * Tuya IoT Cloud Service Proxy
 *
 * Proxies requests to Tuya IoT Cloud for smart device control (fryers, switches).
 * Auth: HMAC-SHA256 signature per request.
 * URL: https://openapi.tuyaeu.com
 */

import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = Router();

const TUYA_URL = process.env.TUYA_URL || 'https://openapi.tuyaeu.com';
const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const READ_ONLY = process.env.READ_ONLY === 'true';

let accessToken = null;
let tokenExpiry = 0;

const cache = new Map();
const CACHE_TTL_STATUS = 60 * 1000;
const CACHE_TTL_SCHEDULES = 5 * 60 * 1000;

let available = false;

/**
 * Generate Tuya API request signature
 */
function generateSign(method, path, timestamp, token = '') {
    const contentHash = crypto.createHash('sha256').update('').digest('hex');
    const stringToSign = [method, contentHash, '', path].join('\n');
    const signStr = TUYA_CLIENT_ID + token + timestamp + stringToSign;
    return crypto.createHmac('sha256', TUYA_CLIENT_SECRET)
        .update(signStr)
        .digest('hex')
        .toUpperCase();
}

/**
 * Get Tuya access token (refresh if expired)
 */
async function getToken() {
    if (accessToken && Date.now() < tokenExpiry) return accessToken;

    const timestamp = Date.now().toString();
    const path = '/v1.0/token?grant_type=1';
    const sign = generateSign('GET', path, timestamp);

    const res = await axios.get(`${TUYA_URL}${path}`, {
        headers: {
            'client_id': TUYA_CLIENT_ID,
            'sign': sign,
            'sign_method': 'HMAC-SHA256',
            't': timestamp
        },
        timeout: 10000
    });

    if (!res.data.success) throw new Error(`Tuya token failed: ${res.data.msg}`);

    accessToken = res.data.result.access_token;
    tokenExpiry = Date.now() + (res.data.result.expire_time * 1000) - 60000;
    available = true;
    console.log('[TUYA] Authenticated successfully');
    return accessToken;
}

/**
 * Make authenticated Tuya API request
 */
async function tuyaRequest(method, path, body = null) {
    const token = await getToken();
    const timestamp = Date.now().toString();
    const sign = generateSign(method, path, timestamp, token);

    const config = {
        method,
        url: `${TUYA_URL}${path}`,
        headers: {
            'client_id': TUYA_CLIENT_ID,
            'access_token': token,
            'sign': sign,
            'sign_method': 'HMAC-SHA256',
            't': timestamp,
            'Content-Type': 'application/json'
        },
        timeout: 15000
    };
    if (body) config.data = body;

    const res = await axios(config);
    if (!res.data.success) throw new Error(`Tuya API error: ${res.data.msg}`);
    return res.data.result;
}

/**
 * Get cached value or fetch fresh
 */
function getCached(key, ttl, fetcher) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.time < ttl) {
        return Promise.resolve(entry.data);
    }
    return fetcher().then(data => {
        cache.set(key, { data, time: Date.now() });
        return data;
    });
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/tuya/status — Service health
 */
router.get('/status', (req, res) => {
    res.json({ service: 'tuya', available, configured: !!(TUYA_CLIENT_ID && TUYA_CLIENT_SECRET) });
});

/**
 * GET /api/tuya/devices/:deviceId/status — Device switch state
 */
router.get('/devices/:deviceId/status', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const data = await getCached(`tuya-status:${deviceId}`, CACHE_TTL_STATUS, () =>
            tuyaRequest('GET', `/v1.0/devices/${deviceId}/status`)
        );
        res.json({ deviceId, status: data });
    } catch (err) {
        console.error(`[TUYA] Device status failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'tuya', available: false
        });
    }
});

/**
 * POST /api/tuya/devices/:deviceId/switch — Toggle device on/off
 * Body: { commands: [{ code: "switch_1", value: true }] }
 */
router.post('/devices/:deviceId/switch', async (req, res) => {
    if (READ_ONLY) {
        return res.json({ _readOnly: true, message: 'Read-only mode — Tuya command not sent' });
    }

    try {
        const { deviceId } = req.params;
        const { commands } = req.body;
        if (!commands?.length) {
            return res.status(400).json({ error: 'commands array required' });
        }

        const result = await tuyaRequest('POST', `/v1.0/devices/${deviceId}/commands`, { commands });
        // Invalidate cache after write
        cache.delete(`tuya-status:${deviceId}`);
        res.json({ success: true, result });
    } catch (err) {
        console.error(`[TUYA] Switch command failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'tuya', available: false
        });
    }
});

/**
 * GET /api/tuya/devices/:deviceId/schedules — Current schedules
 */
router.get('/devices/:deviceId/schedules', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const data = await getCached(`tuya-sched:${deviceId}`, CACHE_TTL_SCHEDULES, () =>
            tuyaRequest('GET', `/v1.0/devices/${deviceId}/timers`)
        );
        res.json({ deviceId, schedules: data });
    } catch (err) {
        console.error(`[TUYA] Schedules failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'tuya', available: false
        });
    }
});

// Initial auth attempt
if (TUYA_CLIENT_ID && TUYA_CLIENT_SECRET) {
    getToken().catch(err => {
        console.warn(`[TUYA] Initial auth failed (will retry on first request): ${err.message}`);
    });
} else {
    console.warn('[TUYA] Not configured — TUYA_CLIENT_ID and TUYA_CLIENT_SECRET required');
}

export default router;
export { available as tuyaAvailable };
