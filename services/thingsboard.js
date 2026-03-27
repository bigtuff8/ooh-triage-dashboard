/**
 * ThingsBoard Service Proxy
 *
 * Proxies requests to ThingsBoard IoT platform for device telemetry and status.
 * Auth: JWT login (POST /api/auth/login) with username/password.
 * URL: https://portal.lhlive.co.uk
 */

import { Router } from 'express';
import axios from 'axios';

const router = Router();

const TB_URL = process.env.TB_URL || 'https://portal.lhlive.co.uk';
const TB_USERNAME = process.env.TB_USERNAME;
const TB_PASSWORD = process.env.TB_PASSWORD;
const READ_ONLY = process.env.READ_ONLY === 'true';

let jwtToken = null;
let tokenExpiry = 0;

const cache = new Map();
const CACHE_TTL_DEVICES = 15 * 60 * 1000;
const CACHE_TTL_TELEMETRY = 60 * 1000;

/** Service availability flag */
let available = false;

/**
 * Authenticate with ThingsBoard and obtain JWT token
 */
async function authenticate() {
    if (!TB_USERNAME || !TB_PASSWORD) {
        throw new Error('TB_USERNAME and TB_PASSWORD not configured');
    }

    const res = await axios.post(`${TB_URL}/api/auth/login`, {
        username: TB_USERNAME,
        password: TB_PASSWORD
    }, { timeout: 10000 });

    jwtToken = res.data.token;
    // TB tokens typically last 2.5 hours — refresh at 2 hours
    tokenExpiry = Date.now() + (2 * 60 * 60 * 1000);
    available = true;
    console.log('[TB] Authenticated successfully');
}

/**
 * Get valid JWT token, re-authenticating if expired
 */
async function getToken() {
    if (!jwtToken || Date.now() > tokenExpiry) {
        await authenticate();
    }
    return jwtToken;
}

/**
 * Make authenticated request to ThingsBoard API
 */
async function tbRequest(method, path, data = null) {
    const token = await getToken();
    const config = {
        method,
        url: `${TB_URL}${path}`,
        headers: {
            'X-Authorization': `Bearer ${token}`,
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
 * GET /api/tb/status — Service health check
 */
router.get('/status', (req, res) => {
    res.json({ service: 'thingsboard', available, configured: !!(TB_USERNAME && TB_PASSWORD) });
});

/**
 * GET /api/tb/sites/:siteNo — Look up building entity by house ID
 */
router.get('/sites/:siteNo', async (req, res) => {
    try {
        const { siteNo } = req.params;
        const data = await getCached(`site:${siteNo}`, CACHE_TTL_DEVICES, async () => {
            // Search for entity with house number attribute matching siteNo
            const result = await tbRequest('GET',
                `/api/tenant/assets?pageSize=100&page=0&textSearch=${encodeURIComponent(siteNo)}`
            );
            return result;
        });
        res.json(data);
    } catch (err) {
        console.error(`[TB] Site lookup failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'thingsboard', available: false
        });
    }
});

/**
 * GET /api/tb/sites/:siteNo/devices — All devices at a site
 */
router.get('/sites/:siteNo/devices', async (req, res) => {
    try {
        const { siteNo } = req.params;
        const data = await getCached(`site-devices:${siteNo}`, CACHE_TTL_DEVICES, async () => {
            // First get the asset (site) entity — filter to Building type only
            const assets = await tbRequest('GET',
                `/api/tenant/assets?pageSize=100&page=0&textSearch=${encodeURIComponent(siteNo)}`
            );
            if (!assets.data?.length) return { devices: [], siteFound: false };

            // Find the Building asset (not Property Schedule or Brand)
            const building = assets.data.find(a => a.type === 'Building') || assets.data[0];
            const assetId = building.id.id;
            const assetName = building.name;

            // Get related devices
            const relations = await tbRequest('GET',
                `/api/relations?fromId=${assetId}&fromType=ASSET`
            );

            const devices = [];
            for (const rel of (relations || [])) {
                if (rel.to?.entityType === 'DEVICE') {
                    try {
                        const device = await tbRequest('GET', `/api/device/${rel.to.id}`);
                        devices.push(device);
                    } catch (e) {
                        // Skip devices we can't read
                    }
                }
            }
            return { devices, siteFound: true, assetId, assetName };
        });
        res.json(data);
    } catch (err) {
        console.error(`[TB] Device list failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'thingsboard', available: false
        });
    }
});

/**
 * GET /api/tb/devices/:deviceId/telemetry — Latest readings
 */
router.get('/devices/:deviceId/telemetry', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const keys = req.query.keys || '';
        const path = keys
            ? `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${encodeURIComponent(keys)}`
            : `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries`;

        const data = await getCached(`telemetry:${deviceId}:${keys}`, CACHE_TTL_TELEMETRY, () =>
            tbRequest('GET', path)
        );
        res.json(data);
    } catch (err) {
        console.error(`[TB] Telemetry failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'thingsboard', available: false
        });
    }
});

/**
 * GET /api/tb/devices/:deviceId/status — Online/offline + last activity
 */
router.get('/devices/:deviceId/status', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const data = await getCached(`device-status:${deviceId}`, CACHE_TTL_TELEMETRY, async () => {
            const device = await tbRequest('GET', `/api/device/${deviceId}`);
            const attributes = await tbRequest('GET',
                `/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes?keys=active,lastActivityTime,lastConnectTime`
            );
            const attrMap = {};
            for (const attr of (attributes || [])) {
                attrMap[attr.key] = attr.value;
            }
            return {
                id: deviceId,
                name: device.name,
                type: device.type,
                active: attrMap.active ?? false,
                lastActivityTime: attrMap.lastActivityTime || null,
                lastConnectTime: attrMap.lastConnectTime || null
            };
        });
        res.json(data);
    } catch (err) {
        console.error(`[TB] Device status failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'thingsboard', available: false
        });
    }
});

// ============================================================================
// Site Index — maps house numbers to TB asset IDs
// Built once from GK customer assets + attributes, cached for 1 hour
// ============================================================================
let siteIndex = null;
let siteIndexExpiry = 0;
const SITE_INDEX_TTL = 60 * 60 * 1000; // 1 hour

async function buildSiteIndex() {
    if (siteIndex && Date.now() < siteIndexExpiry) return siteIndex;

    console.log('[TB] Building site index from customer assets...');
    const GK_CUSTOMER_ID = '275b1bc0-d212-11ed-93fd-070d53843730';

    // Get all GK assets
    const assets = await tbRequest('GET', `/api/customer/${GK_CUSTOMER_ID}/assets?pageSize=1000&page=0`);
    const buildings = (assets.data || []).filter(a => a.type === 'Building');

    const index = new Map();
    // Fetch siteNo attribute for each building (batched)
    for (const building of buildings) {
        try {
            const attrs = await tbRequest('GET',
                `/api/plugins/telemetry/ASSET/${building.id.id}/values/attributes/SERVER_SCOPE?keys=siteNo,siteShortName`
            );
            const siteNo = attrs?.find(a => a.key === 'siteNo')?.value ||
                           attrs?.find(a => a.key === 'siteShortName')?.value;
            if (siteNo) {
                index.set(String(siteNo), {
                    assetId: building.id.id,
                    name: building.name,
                    siteNo: String(siteNo)
                });
            }
        } catch (e) {
            // Skip — some buildings may not have attributes
        }
    }

    siteIndex = index;
    siteIndexExpiry = Date.now() + SITE_INDEX_TTL;
    console.log(`[TB] Site index built: ${index.size} sites mapped of ${buildings.length} buildings`);
    return index;
}

/**
 * GET /api/tb/site-by-number/:siteNo/devices — Look up by house number (4-digit code)
 */
router.get('/site-by-number/:siteNo/devices', async (req, res) => {
    try {
        const { siteNo } = req.params;
        const index = await buildSiteIndex();
        const entry = index.get(String(siteNo));

        if (!entry) {
            return res.json({ devices: [], siteFound: false, siteNo });
        }

        // Get devices via relations
        const data = await getCached(`site-devices-num:${siteNo}`, CACHE_TTL_DEVICES, async () => {
            const relations = await tbRequest('GET',
                `/api/relations?fromId=${entry.assetId}&fromType=ASSET`
            );

            const devices = [];
            for (const rel of (relations || [])) {
                if (rel.to?.entityType === 'DEVICE') {
                    try {
                        const device = await tbRequest('GET', `/api/device/${rel.to.id}`);
                        devices.push(device);
                    } catch (e) {
                        // Skip
                    }
                }
            }
            return { devices, siteFound: true, assetId: entry.assetId, assetName: entry.name, siteNo };
        });

        res.json(data);
    } catch (err) {
        console.error(`[TB] Site-by-number lookup failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'thingsboard', available: false
        });
    }
});

/**
 * GET /api/tb/site-index — Return the full site index (for debugging / dropdown enrichment)
 */
router.get('/site-index', async (req, res) => {
    try {
        const index = await buildSiteIndex();
        const entries = [];
        index.forEach((v, k) => entries.push(v));
        res.json({ count: entries.length, sites: entries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/tb/assets/:assetId/attributes — Read asset attributes (house number, etc.)
 */
router.get('/assets/:assetId/attributes', async (req, res) => {
    try {
        const { assetId } = req.params;
        const [server, shared, client] = await Promise.all([
            tbRequest('GET', `/api/plugins/telemetry/ASSET/${assetId}/values/attributes/SERVER_SCOPE`).catch(() => []),
            tbRequest('GET', `/api/plugins/telemetry/ASSET/${assetId}/values/attributes/SHARED_SCOPE`).catch(() => []),
            tbRequest('GET', `/api/plugins/telemetry/ASSET/${assetId}/values/attributes/CLIENT_SCOPE`).catch(() => [])
        ]);
        res.json({ server, shared, client });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/tb/debug/relations/:entityType/:entityId — Debug: show all relations for an entity
 */
router.get('/debug/relations/:entityType/:entityId', async (req, res) => {
    try {
        const { entityType, entityId } = req.params;
        const fromRels = await tbRequest('GET',
            `/api/relations?fromId=${entityId}&fromType=${entityType.toUpperCase()}`
        );
        const toRels = await tbRequest('GET',
            `/api/relations?toId=${entityId}&toType=${entityType.toUpperCase()}`
        );
        res.json({ from: fromRels, to: toRels });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/tb/customers — List all customers (for discovering site hierarchy)
 */
router.get('/customers', async (req, res) => {
    try {
        const data = await getCached('tb-customers', CACHE_TTL_DEVICES, () =>
            tbRequest('GET', '/api/customers?pageSize=100&page=0')
        );
        res.json(data);
    } catch (err) {
        res.status(err.response?.status || 500).json({ error: err.message });
    }
});

/**
 * GET /api/tb/customers/:customerId/assets — Assets for a customer
 */
router.get('/customers/:customerId/assets', async (req, res) => {
    try {
        const { customerId } = req.params;
        const data = await getCached(`customer-assets:${customerId}`, CACHE_TTL_DEVICES, () =>
            tbRequest('GET', `/api/customer/${customerId}/assets?pageSize=1000&page=0`)
        );
        res.json(data);
    } catch (err) {
        res.status(err.response?.status || 500).json({ error: err.message });
    }
});

/**
 * GET /api/tb/customers/:customerId/devices — Devices for a customer
 */
router.get('/customers/:customerId/devices', async (req, res) => {
    try {
        const { customerId } = req.params;
        const data = await getCached(`customer-devices:${customerId}`, CACHE_TTL_DEVICES, () =>
            tbRequest('GET', `/api/customer/${customerId}/devices?pageSize=1000&page=0`)
        );
        res.json(data);
    } catch (err) {
        res.status(err.response?.status || 500).json({ error: err.message });
    }
});

// Initial auth attempt on load (non-blocking)
if (TB_USERNAME && TB_PASSWORD) {
    authenticate().catch(err => {
        console.warn(`[TB] Initial auth failed (will retry on first request): ${err.message}`);
    });
} else {
    console.warn('[TB] Not configured — TB_USERNAME and TB_PASSWORD required');
}

export default router;
export { available as tbAvailable };
