/**
 * Authentication & authorisation (F001).
 *
 * Production: OIDC authorization-code + PKCE against the Airedale B2C tenant
 * (shared hub client pattern per F024/SD-545). Roles come from the extension_Role
 * claim via config.oidc.roleMap.
 *
 * Development: fictitious dev operators (security-standards: no real PII), gated
 * hard behind AUTH_MODE=dev which server.js refuses to run in production.
 *
 * Every API route sits behind requireAuth; privileged routes behind requireRole —
 * enforcement is server-side, never UI-only.
 */

import { Router } from 'express';
import session from 'express-session';
import { randomBytes } from 'crypto';
import { config } from '../config.js';

// Fictitious development identities only — never real staff details
const DEV_OPERATORS = [
    { id: 'dev-handler', name: 'Test Handler', email: 'handler@example.com', role: 'handler', roleLabel: 'OOH Handler' },
    { id: 'dev-iot', name: 'Test IoT Admin', email: 'iotadmin@example.com', role: 'iot', roleLabel: 'IoT Team (Admin)' }
];

let oidcLib = null;
let oidcConfig = null;

/**
 * Builds the session middleware with hardened cookie settings.
 */
export function sessionMiddleware() {
    return session({
        name: config.session.name,
        secret: config.session.secret || randomBytes(32).toString('hex'), // random per-process secret in dev only
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax', // lax (not strict) so the OIDC redirect back carries the session
            maxAge: config.session.maxAgeMs
        }
    });
}

/**
 * Discovers the OIDC issuer once at startup (AUTH_MODE=oidc).
 *
 * Public client (F001/SD-586): the shared Techhub-Production B2C client carries NO
 * secret. openid-client v6 `discovery(server, clientId, metadata?, clientAuthentication?)`
 * defaults `clientAuthentication` to `None()` when no secret is supplied, so the two-arg
 * form is the correct public-client idiom; PKCE (see authRouter) carries the flow. The
 * token exchange therefore sends no client secret. (Confirmed against openid-client@6.8.4.)
 */
export async function initOidc() {
    if (config.authMode !== 'oidc') return;
    oidcLib = await import('openid-client');
    oidcConfig = await oidcLib.discovery(
        new URL(config.oidc.issuer),
        config.oidc.clientId
    );
    console.log('[AUTH] OIDC issuer discovered (public client, PKCE)');
}

// Deterministic role precedence (CT AD-01): a user carrying BOTH an IoT (1400) and a
// handler (1500) claim resolves to the higher-privilege role, independent of claim order.
const ROLE_PRECEDENCE = ['iot', 'handler'];

/**
 * Maps the extension_Role claim to the app role ('handler' | 'iot'); unknown values get null.
 *
 * F002/SD-586: extension_Role arrives as a JSON string of an array of AreaClaim objects
 * ({claimArea, claimGroup, claimPermission, ...}), keyed on the claimArea int
 * (1500 = Zendesk/OOH → handler, 1400 = IoT → iot). Malformed / legacy / missing input
 * must not throw — it resolves to null, which drives the existing 403 path in /callback.
 */
export function mapRole(claims) {
    let raw = claims?.[config.oidc.roleClaim];
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = []; }
    }
    const areas = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
    const matched = new Set();
    for (const c of areas) {
        // AreaClaim objects key on claimArea; tolerate bare ints/strings (legacy tokens)
        const key = String(c?.claimArea ?? c);
        if (config.oidc.roleMap[key]) matched.add(config.oidc.roleMap[key]);
    }
    return ROLE_PRECEDENCE.find(r => matched.has(r)) ?? null;
}

/**
 * Requires a signed-in operator; APIs get 401 JSON, page loads get the SSO redirect.
 */
export function requireAuth(req, res, next) {
    if (req.session?.operator) return next();
    if (req.originalUrl.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ error: 'Not signed in', signIn: '/auth/login' });
    }
    // Only capture real page navigations — asset requests (favicon, css, js) must
    // not overwrite the post-sign-in destination
    if (req.headers.accept?.includes('text/html') && !/\.[a-z0-9]+$/i.test(req.path)) {
        req.session.returnTo = req.originalUrl;
    }
    return res.redirect('/auth/login');
}

/**
 * Requires a specific app role (server-side check independent of UI).
 */
export function requireRole(role) {
    return (req, res, next) => {
        const op = req.session?.operator;
        if (!op) return res.status(401).json({ error: 'Not signed in' });
        if (op.role !== role) {
            console.warn(`[AUTH] Role denied: ${op.id} (${op.role}) attempted ${req.method} ${req.originalUrl} requiring ${role}`);
            return res.status(403).json({ error: 'You do not have access to this function — contact the IoT team' });
        }
        return next();
    };
}

/**
 * Same-origin guard for mutating requests (CSRF defence-in-depth alongside SameSite).
 */
export function sameOriginGuard(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
    if (origin && origin !== config.appOrigin) {
        console.warn(`[AUTH] Cross-origin ${req.method} blocked from ${origin}`);
        return res.status(403).json({ error: 'Cross-origin request blocked' });
    }
    return next();
}

/**
 * Auth routes: /auth/login, /auth/callback, /auth/logout, /auth/dev (dev mode only).
 */
export function authRouter() {
    const router = Router();

    router.get('/login', async (req, res, next) => {
        try {
            if (config.authMode === 'dev') {
                return res.redirect('/auth/dev');
            }
            const codeVerifier = oidcLib.randomPKCECodeVerifier();
            const state = oidcLib.randomState();
            const nonce = oidcLib.randomNonce();
            req.session.oidcFlight = { codeVerifier, state, nonce };
            const url = oidcLib.buildAuthorizationUrl(oidcConfig, {
                redirect_uri: `${config.appOrigin}/auth/callback`,
                scope: config.oidc.scope,
                state,
                nonce,
                code_challenge: await oidcLib.calculatePKCECodeChallenge(codeVerifier),
                code_challenge_method: 'S256'
            });
            return res.redirect(url.href);
        } catch (err) { return next(err); }
    });

    router.get('/callback', async (req, res, next) => {
        try {
            if (config.authMode !== 'oidc') return res.redirect('/');
            const flight = req.session.oidcFlight;
            if (!flight) return res.redirect('/auth/login');
            const currentUrl = new URL(req.originalUrl, config.appOrigin);
            const tokens = await oidcLib.authorizationCodeGrant(oidcConfig, currentUrl, {
                pkceCodeVerifier: flight.codeVerifier,
                expectedState: flight.state,
                expectedNonce: flight.nonce
            });
            const claims = tokens.claims();
            const role = mapRole(claims);
            if (!role) {
                console.warn(`[AUTH] Sign-in without OOH role: sub=${claims.sub}`);
                return res.status(403).send('You don’t have access to the OOH Dashboard — contact the IoT team.');
            }
            delete req.session.oidcFlight;
            req.session.operator = {
                id: claims.sub,
                name: claims.name || claims.preferred_username || claims.email || 'Operator',
                email: claims.email || null,
                role,
                roleLabel: role === 'iot' ? 'IoT Team (Admin)' : 'OOH Handler'
            };
            const dest = req.session.returnTo || '/';
            delete req.session.returnTo;
            return res.redirect(dest);
        } catch (err) {
            // Surface the OIDC/OAuth error detail — oauth4webapi ResponseBodyError carries the
            // provider's error code/description (e.g. B2C AADB2C90xxx), which the generic handler
            // would otherwise hide. Critical for diagnosing token-exchange failures at go-live.
            const detail = [err?.error, err?.error_description, err?.cause?.error, err?.cause?.error_description]
                .filter(Boolean).join(' — ');
            console.error(`[AUTH] /auth/callback token exchange failed: ${err?.name || 'Error'}: ${err?.message}${detail ? ` | provider: ${detail}` : ''}`);
            return next(err);
        }
    });

    if (config.authMode === 'dev') {
        // Dev sign-in page — fictitious operators, non-production only (enforced at startup)
        router.get('/dev', (req, res) => {
            res.send(`<!doctype html><meta charset="utf-8"><title>Dev sign-in</title>
<body style="font-family:system-ui;background:#F1F5F9;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:28px;width:360px">
<h2 style="margin:0 0 4px">OOH Dashboard</h2>
<p style="color:#64748B;font-size:13px;margin:0 0 16px">Development sign-in (no live SSO configured)</p>
${DEV_OPERATORS.map(o => `<form method="post" action="/auth/dev" style="margin-bottom:8px">
<input type="hidden" name="id" value="${o.id}">
<button style="width:100%;padding:10px;border-radius:8px;border:1px solid #E2E8F0;background:#fff;cursor:pointer;font-size:14px;text-align:left">
<b>${o.name}</b> — ${o.roleLabel}</button></form>`).join('')}
</div></body>`);
        });
        router.post('/dev', (req, res) => {
            const op = DEV_OPERATORS.find(o => o.id === req.body.id);
            if (!op) return res.status(400).send('Unknown dev operator');
            req.session.operator = { ...op };
            const dest = req.session.returnTo || '/';
            delete req.session.returnTo;
            return res.redirect(dest);
        });
    }

    router.post('/logout', (req, res) => {
        req.session.destroy(() => res.json({ ok: true }));
    });

    return router;
}
