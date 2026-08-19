/**
 * Authentication & authorisation (F001).
 *
 * Production: OIDC implicit **id_token** sign-in against the Airedale B2C tenant
 * (shared hub client pattern per F024/SD-545 — the estate-wide `AddMicrosoftIdentityWebApp`
 * `response_type=id_token` idiom). The Techhub-Production client is secret-less BY DESIGN:
 * there is NO client secret and NO token-endpoint call, so the previous authorization-code +
 * PKCE flow was rejected live with `AADB2C90079: Clients must send a client_secret when
 * redeeming a confidential grant`. We now request an id_token directly (form_post response
 * mode) and validate it fully in-app (signature + iss/aud/exp/nbf + nonce + state). Roles come
 * from the extension_Role claim via config.oidc.roleMap.
 *
 * Development: fictitious dev operators (security-standards: no real PII), gated
 * hard behind AUTH_MODE=dev which server.js refuses to run in production.
 *
 * Every API route sits behind requireAuth; privileged routes behind requireRole —
 * enforcement is server-side, never UI-only.
 */

import { Router } from 'express';
import session from 'express-session';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';

// Fictitious development identities only — never real staff details
const DEV_OPERATORS = [
    { id: 'dev-handler', name: 'Test Handler', email: 'handler@example.com', role: 'handler', roleLabel: 'OOH Handler' },
    { id: 'dev-iot', name: 'Test IoT Admin', email: 'iotadmin@example.com', role: 'iot', roleLabel: 'IoT Team (Admin)' }
];

// Discovered B2C server metadata + JWKS resolver (populated by initOidc when AUTH_MODE=oidc).
let oidcMeta = null;          // { issuer, authorization_endpoint, jwks_uri }
let jwks = null;              // jose createRemoteJWKSet(jwks_uri) — cached RS256 verification key set

// Correlation cookie (state+nonce) for the cross-site form_post callback. See authRouter().
const CORRELATION_COOKIE = 'ooh.oidc';
const CORRELATION_TTL_MS = 10 * 60 * 1000; // 10 min — a sign-in round trip is far shorter
// Stable per-process secret for integrity-signing the correlation cookie. In production
// SESSION_SECRET is always set; this random fallback keeps dev/non-oidc runs self-consistent.
const CORRELATION_FALLBACK_SECRET = randomBytes(32).toString('hex');
const correlationSecret = () => config.session.secret || CORRELATION_FALLBACK_SECRET;

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
 * Public discovery (no secret): fetch the standard `.well-known/openid-configuration` off the
 * configured issuer to obtain `authorization_endpoint`, `jwks_uri` and the canonical `issuer`.
 * The Techhub-Production client is secret-less by design — this call is anonymous. We then build
 * a cached jose remote JWKS resolver from `jwks_uri` for id_token signature verification.
 */
export async function initOidc() {
    if (config.authMode !== 'oidc') return;
    const base = String(config.oidc.issuer).replace(/\/$/, '');
    const discoveryUrl = `${base}/.well-known/openid-configuration`;
    const res = await fetch(discoveryUrl);
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText} (${discoveryUrl})`);
    const meta = await res.json();
    if (!meta.authorization_endpoint || !meta.jwks_uri || !meta.issuer) {
        throw new Error('OIDC discovery document missing authorization_endpoint / jwks_uri / issuer');
    }
    oidcMeta = { issuer: meta.issuer, authorization_endpoint: meta.authorization_endpoint, jwks_uri: meta.jwks_uri };
    jwks = createRemoteJWKSet(new URL(meta.jwks_uri));
    console.log(`[AUTH] OIDC issuer discovered (implicit id_token sign-in) — ${oidcMeta.issuer}`);
}

/* ------------------------------------------------------------------ */
/* Correlation cookie: state+nonce carrier for the cross-site callback */
/* ------------------------------------------------------------------ */
//
// With response_mode=form_post, B2C returns the id_token via a cross-site top-level POST to
// /auth/callback. The session cookie is SameSite=Lax, which browsers do NOT send on a cross-site
// POST — so the flight state/nonce cannot live in the session. We carry them in a dedicated,
// short-lived, HttpOnly, SameSite=None; Secure cookie scoped to /auth, integrity-signed (HMAC)
// so a client cannot forge or tamper with the expected state/nonce we validate the token against.

function encodeCorrelation(obj) {
    const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
    const sig = createHmac('sha256', correlationSecret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}

function decodeCorrelation(value) {
    if (!value || typeof value !== 'string') return null;
    const dot = value.indexOf('.');
    if (dot <= 0) return null;
    const payload = value.slice(0, dot);
    const sig = value.slice(dot + 1);
    const expected = createHmac('sha256', correlationSecret()).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
        const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!obj || typeof obj !== 'object') return null;
        if (!obj.t || (Date.now() - obj.t) > CORRELATION_TTL_MS) return null; // expired
        return obj;
    } catch { return null; }
}

// Cookie attributes must match on set + clear. Secure is fine — production is https.
const CORRELATION_COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'none', path: '/auth' };

/** Reads a single cookie value from the raw Cookie header (no cookie-parser dependency). */
function readCookie(req, name) {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        if (part.slice(0, idx).trim() === name) {
            return decodeURIComponent(part.slice(idx + 1).trim());
        }
    }
    return null;
}

/** Open-redirect guard: only accept our own single-slash local return paths. */
function safeReturnTo(rt) {
    return (typeof rt === 'string' && rt.startsWith('/') && !rt.startsWith('//')) ? rt : '/';
}

/**
 * Validates a B2C id_token for the implicit sign-in flow — the full security boundary.
 *
 * Checks, in order: `state` (CSRF) → JWT **signature** (RS256 against the discovered JWKS) plus
 * `iss`/`aud`/`exp`/`nbf` (via jose jwtVerify, with clock skew) → `nonce` (replay protection).
 * Returns { ok:true, claims } or { ok:false, reason }. Pure w.r.t. its inputs: `keySet`, `issuer`
 * and `clientId` default to the discovered/config values but are injectable for unit testing.
 */
export async function verifyIdToken(idToken, {
    expectedState, actualState, expectedNonce,
    keySet = jwks, issuer = oidcMeta?.issuer, clientId = config.oidc.clientId,
    clockToleranceSec = 60
} = {}) {
    if (!idToken) return { ok: false, reason: 'missing id_token' };
    if (!keySet || !issuer) return { ok: false, reason: 'OIDC not initialised' };
    // CSRF: the state echoed back must match the one we issued (from the signed correlation cookie).
    if (!expectedState || actualState !== expectedState) return { ok: false, reason: 'state mismatch' };
    let payload;
    try {
        ({ payload } = await jwtVerify(idToken, keySet, {
            issuer,
            audience: clientId,
            clockTolerance: clockToleranceSec
        }));
    } catch (err) {
        return { ok: false, reason: `jwt verification failed: ${err?.code || err?.message}` };
    }
    // Replay protection: the id_token's nonce must equal the one bound to this flight.
    if (!expectedNonce || payload.nonce !== expectedNonce) return { ok: false, reason: 'nonce mismatch' };
    return { ok: true, claims: payload };
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
    // B2C delivers the id_token to /auth/callback as a cross-site top-level form_post — it is a
    // POST that legitimately originates from b2clogin.com, so the same-origin rule must NOT block
    // it. Its CSRF/integrity defence is the id_token validation itself (signature + iss/aud/exp +
    // the state and nonce bound to our signed correlation cookie), performed in the route handler.
    if (req.path === '/auth/callback') return next();
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

    // GET /auth/login — begin implicit id_token sign-in (B2C, response_type=id_token, form_post).
    router.get('/login', async (req, res, next) => {
        try {
            if (config.authMode === 'dev') {
                return res.redirect('/auth/dev');
            }
            if (!oidcMeta) return next(new Error('OIDC not initialised'));
            const state = randomBytes(16).toString('base64url');
            const nonce = randomBytes(16).toString('base64url');
            // Carry state/nonce + the post-login destination in the signed correlation cookie —
            // NOT the SameSite=Lax session, which the browser won't send on the cross-site callback.
            const returnTo = safeReturnTo(req.session?.returnTo);
            res.cookie(CORRELATION_COOKIE, encodeCorrelation({ state, nonce, returnTo, t: Date.now() }), {
                ...CORRELATION_COOKIE_OPTS, maxAge: CORRELATION_TTL_MS
            });
            // Scope must include openid; default config already does, but enforce defensively.
            const scope = /(^|\s)openid(\s|$)/.test(config.oidc.scope) ? config.oidc.scope : `openid ${config.oidc.scope}`;
            const params = new URLSearchParams({
                client_id: config.oidc.clientId,
                response_type: 'id_token',
                response_mode: 'form_post',
                redirect_uri: `${config.appOrigin}/auth/callback`,
                scope,
                state,
                nonce
            });
            return res.redirect(`${oidcMeta.authorization_endpoint}?${params.toString()}`);
        } catch (err) { return next(err); }
    });

    // A bare GET to /auth/callback is not part of the form_post flow — restart sign-in.
    router.get('/callback', (req, res) => res.redirect('/auth/login'));

    // POST /auth/callback — B2C cross-site form_post carrying the id_token (or an error).
    router.post('/callback', async (req, res, next) => {
        try {
            if (config.authMode !== 'oidc') return res.redirect('/');
            const body = req.body || {};

            // Consume the correlation cookie (present iff SameSite=None was delivered); clear it now
            // so it cannot be replayed regardless of the outcome below.
            const correlation = decodeCorrelation(readCookie(req, CORRELATION_COOKIE));
            res.clearCookie(CORRELATION_COOKIE, CORRELATION_COOKIE_OPTS);

            // B2C error response (e.g. user cancel, policy failure) arrives as form fields.
            if (body.error) {
                console.error(`[AUTH] B2C error at /auth/callback: ${body.error} — ${body.error_description || ''}`);
                return res.status(400).send('Sign-in failed — please try again, or contact the IoT team.');
            }
            if (!correlation) {
                console.warn('[AUTH] /auth/callback: missing/invalid/expired correlation cookie');
                return res.status(400).send('Your sign-in session expired — please try signing in again.');
            }

            const result = await verifyIdToken(body.id_token, {
                expectedState: correlation.state,
                actualState: body.state,
                expectedNonce: correlation.nonce
            });
            if (!result.ok) {
                console.warn(`[AUTH] /auth/callback: id_token rejected (${result.reason})`);
                return res.status(400).send('Sign-in could not be verified — please try again.');
            }

            const claims = result.claims;
            const role = mapRole(claims);
            if (!role) {
                console.warn(`[AUTH] Sign-in without OOH role: sub=${claims.sub}`);
                return res.status(403).send('You don’t have access to the OOH Dashboard — contact the IoT team.');
            }
            req.session.operator = {
                id: claims.sub,
                name: claims.name || claims.preferred_username || claims.email || 'Operator',
                email: claims.email || null,
                role,
                roleLabel: role === 'iot' ? 'IoT Team (Admin)' : 'OOH Handler'
            };
            return res.redirect(safeReturnTo(correlation.returnTo));
        } catch (err) {
            console.error(`[AUTH] /auth/callback failed: ${err?.name || 'Error'}: ${err?.message}`);
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
