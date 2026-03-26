/**
 * Intesis AC Cloud Service Proxy
 *
 * Proxies requests to AC Cloud (Intesis) for air conditioning unit monitoring and control.
 * Auth: OAuth2 access token (non-expiring once obtained).
 * URL: https://accloud.intesis.com
 */

import { Router } from 'express';
import axios from 'axios';

const router = Router();

const INTESIS_URL = process.env.INTESIS_URL || 'https://accloud.intesis.com';
const INTESIS_TOKEN = process.env.INTESIS_TOKEN;
const READ_ONLY = process.env.READ_ONLY === 'true';

const cache = new Map();
const CACHE_TTL_CONFIG = 5 * 60 * 1000;
const CACHE_TTL_STATUS = 60 * 1000;

let available = !!INTESIS_TOKEN;

/**
 * Make authenticated Intesis API request
 */
async function intesisRequest(method, path, data = null) {
    if (!INTESIS_TOKEN) throw new Error('INTESIS_TOKEN not configured');

    const config = {
        method,
        url: `${INTESIS_URL}${path}`,
        headers: {
            'Authorization': `Bearer ${INTESIS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        timeout: 15000
    };
    if (data) config.data = data;

    const res = await axios(config);
    return res.data;
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
 * GET /api/intesis/status — Service health
 */
router.get('/status', (req, res) => {
    res.json({ service: 'intesis', available, configured: !!INTESIS_TOKEN });
});

/**
 * GET /api/intesis/config — All AC units + current state
 */
router.get('/config', async (req, res) => {
    try {
        const data = await getCached('intesis-config', CACHE_TTL_CONFIG, () =>
            intesisRequest('GET', '/api/v1/devices')
        );
        res.json(data);
    } catch (err) {
        console.error(`[INTESIS] Config fetch failed: ${err.message}`);
        available = false;
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'intesis', available: false
        });
    }
});

/**
 * POST /api/intesis/set — Control AC unit
 * Body: { deviceId: "...", commands: { power: "on", mode: "cool", setpoint: 22 } }
 */
router.post('/set', async (req, res) => {
    if (READ_ONLY) {
        return res.json({ _readOnly: true, message: 'Read-only mode — Intesis command not sent' });
    }

    try {
        const { deviceId, commands } = req.body;
        if (!deviceId || !commands) {
            return res.status(400).json({ error: 'deviceId and commands required' });
        }

        const result = await intesisRequest('POST', `/api/v1/devices/${deviceId}/commands`, commands);
        // Invalidate cache
        cache.delete('intesis-config');

        res.json({ success: true, result });
    } catch (err) {
        console.error(`[INTESIS] Control command failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'intesis', available: false
        });
    }
});

if (INTESIS_TOKEN) {
    console.log('[INTESIS] Token configured — service available');
} else {
    console.warn('[INTESIS] Not configured — INTESIS_TOKEN required');
}

export default router;
export { available as intesisAvailable };
