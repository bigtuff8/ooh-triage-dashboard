/**
 * Salus Premium Connect Service Proxy
 *
 * Proxies requests to Salus heating controls for temperature monitoring and setpoint changes.
 * Auth: AWS Cognito SRP (Secure Remote Password) via amazon-cognito-identity-js.
 * Multiple accounts — one per customer/site group.
 */

import { Router } from 'express';
import axios from 'axios';
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';

const router = Router();

const READ_ONLY = process.env.READ_ONLY === 'true';

// Salus accounts loaded from env as JSON array: [{username, password, clientName}]
let salusAccounts = [];
try {
    salusAccounts = JSON.parse(process.env.SALUS_ACCOUNTS || '[]');
} catch (e) {
    console.warn('[SALUS] Failed to parse SALUS_ACCOUNTS env var');
}

// Salus API endpoints (AWS-hosted)
const SALUS_API_URL = 'https://eu.salusconnect.io/api';
const COGNITO_REGION = 'eu-west-1';
const COGNITO_CLIENT_ID = '3mv93lkgcmaj87i44n3a7dfqk3';
const COGNITO_POOL_ID = `${COGNITO_REGION}_CK5vOdfhC`;

// Cognito user pool — shared across all accounts
const userPool = new CognitoUserPool({
    UserPoolId: COGNITO_POOL_ID,
    ClientId: COGNITO_CLIENT_ID
});

// Token cache per account: { token, idToken, expiry }
const tokenCache = new Map();
const cache = new Map();
const CACHE_TTL_DEVICES = 60 * 1000;

let available = false;

/**
 * Authenticate with Cognito SRP for a specific account.
 * Returns the ID token (JWT) used for Salus API authorization.
 */
function authenticateAccount(account) {
    const cached = tokenCache.get(account.username);
    if (cached && Date.now() < cached.expiry) {
        return Promise.resolve(cached.token);
    }

    return new Promise((resolve, reject) => {
        const authDetails = new AuthenticationDetails({
            Username: account.username,
            Password: account.password
        });

        const cognitoUser = new CognitoUser({
            Username: account.username,
            Pool: userPool
        });

        cognitoUser.authenticateUser(authDetails, {
            onSuccess: (session) => {
                const idToken = session.getIdToken().getJwtToken();
                // Cognito tokens last 1 hour — refresh at 55 minutes
                tokenCache.set(account.username, {
                    token: idToken,
                    expiry: Date.now() + (55 * 60 * 1000)
                });
                available = true;
                console.log(`[SALUS] Authenticated: ${account.clientName || account.username}`);
                resolve(idToken);
            },
            onFailure: (err) => {
                console.error(`[SALUS] Auth failed for ${account.username}: ${err.message}`);
                reject(err);
            },
            newPasswordRequired: () => {
                reject(new Error('Cognito requires password change — contact Spencer'));
            }
        });
    });
}

/**
 * Make authenticated Salus API request
 */
async function salusRequest(account, method, path, data = null) {
    const token = await authenticateAccount(account);
    const config = {
        method,
        url: `${SALUS_API_URL}${path}`,
        headers: {
            'Authorization': `Bearer ${token}`,
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

/**
 * Find account by name or index
 */
function findAccount(accountRef) {
    return salusAccounts.find(a => a.clientName === accountRef || a.username === accountRef)
        || salusAccounts[parseInt(accountRef, 10)];
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/salus/status — Service health
 */
router.get('/status', (req, res) => {
    res.json({
        service: 'salus',
        available,
        configured: salusAccounts.length > 0,
        accounts: salusAccounts.map(a => ({ clientName: a.clientName, username: a.username }))
    });
});

/**
 * GET /api/salus/accounts — List configured accounts (no credentials)
 */
router.get('/accounts', (req, res) => {
    res.json(salusAccounts.map(a => ({ clientName: a.clientName, username: a.username })));
});

/**
 * GET /api/salus/:account/devices — Device shadows (temp, setpoint, mode)
 */
router.get('/:account/devices', async (req, res) => {
    try {
        const account = findAccount(req.params.account);
        if (!account) return res.status(404).json({ error: 'Account not found', service: 'salus' });

        const data = await getCached(`salus-devices:${account.username}`, CACHE_TTL_DEVICES, () =>
            salusRequest(account, 'GET', '/devices')
        );
        res.json(data);
    } catch (err) {
        console.error(`[SALUS] Device list failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'salus', available: false
        });
    }
});

/**
 * POST /api/salus/:account/devices/:deviceId/setpoint — Change temperature setpoint
 * Body: { temperature: 21.0, reason: "Customer reported too cold" }
 */
router.post('/:account/devices/:deviceId/setpoint', async (req, res) => {
    if (READ_ONLY) {
        return res.json({ _readOnly: true, message: 'Read-only mode — Salus setpoint not changed' });
    }

    try {
        const account = findAccount(req.params.account);
        if (!account) return res.status(404).json({ error: 'Account not found', service: 'salus' });

        const { deviceId } = req.params;
        const { temperature, reason } = req.body;
        if (temperature == null) {
            return res.status(400).json({ error: 'temperature required' });
        }

        const result = await salusRequest(account, 'POST', `/devices/${deviceId}/setpoint`, {
            temperature
        });

        // Invalidate cache
        cache.delete(`salus-devices:${account.username}`);

        res.json({ success: true, result, reason });
    } catch (err) {
        console.error(`[SALUS] Setpoint change failed: ${err.message}`);
        res.status(err.response?.status || 500).json({
            error: err.message, service: 'salus', available: false
        });
    }
});

// Initial auth attempt for all configured accounts (non-blocking)
if (salusAccounts.length > 0) {
    console.log(`[SALUS] ${salusAccounts.length} account(s) configured — authenticating...`);
    for (const account of salusAccounts) {
        authenticateAccount(account).catch(err => {
            console.warn(`[SALUS] Initial auth failed for ${account.clientName || account.username}: ${err.message}`);
        });
    }
} else {
    console.warn('[SALUS] Not configured — SALUS_ACCOUNTS env var required');
}

export default router;
export { available as salusAvailable };
