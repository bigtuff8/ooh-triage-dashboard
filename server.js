/**
 * OOH Dashboard server (live build — design cycle 2026-07-10T22-01-41).
 *
 * Architecture (F024 Option A): standalone Node.js app behind the shared Airedale
 * B2C SSO, deployed to AKS iot-services alongside the IoT Hub, consuming the
 * integration-bridge read API and writing ONLY via SD-492 TB shared attributes.
 *
 * Fail-secure startup: production refuses to run with dev auth, fixture data or
 * missing secrets (see validateConfig).
 */

import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config, validateConfig } from './config.js';
import { sessionMiddleware, initOidc, authRouter, requireAuth, sameOriginGuard } from './services/auth.js';
import apiRouter from './routes/api.js';
import * as bridge from './services/bridge.js';
import * as tb from './services/tb-client.js';
import { zendeskStatus } from './services/zendesk.js';
import { storeStatus, storeProbe } from './services/store.js';
import { startWorker } from './services/overrides.js';
import { activeAlerts } from './services/metrics.js';
import { controlQueueStatus } from './services/control.js';
import { startLivenessMonitor } from './services/liveness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const problems = validateConfig();
if (problems.length) {
    console.error('FATAL: configuration invalid:');
    problems.forEach(p => console.error(`  - ${p}`));
    process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // behind the cluster ingress

app.use(express.json({ limit: '1mb' }));
app.use(sessionMiddleware());
app.use(sameOriginGuard);

// CORS: locked to the app origin. The frontend is served same-origin, so no
// cross-origin API access is granted at all — requests from other origins get
// no CORS headers (browser-blocked) and mutating ones are rejected by the guard.

/* ---------------- health (unauthenticated — K8s probes) ---------------- */

app.get('/healthz', (req, res) => {
    const alerts = activeAlerts();
    const subsystems = {
        bridge: bridge.bridgeStatus(),
        thingsboard: tb.tbStatus(),
        zendesk: zendeskStatus(),
        store: storeStatus()
    };
    // CR-02: report real subsystem state in the body. A subsystem is degraded when it
    // explicitly reports healthy:false (store — now backed by a real probe — bridge, zendesk)
    // or, for ThingsBoard, when its READ auth is down (write may be intentionally unconfigured
    // during the write-locked canary, so it does not count against health). We deliberately
    // keep HTTP 200 even when degraded: both K8s liveness and readiness probes hit /healthz and,
    // with replicas:1 (RB-4/AD-04), a non-2xx on a transient Cosmos blip would restart/deregister
    // the only pod — a full outage plus forced re-SSO. Degrade is surfaced in the body, not the code.
    const degraded =
        subsystems.store?.healthy === false ||
        subsystems.bridge?.healthy === false ||
        subsystems.zendesk?.healthy === false ||
        (subsystems.thingsboard?.mode === 'live' && subsystems.thingsboard?.read === false);
    res.json({
        status: degraded ? 'degraded' : 'ok',
        version: config.appVersion,
        authMode: config.authMode,
        dataMode: config.dataMode,
        writesDisabled: config.writesDisabled, // F005 canary proof — deploy-time device-write lock
        subsystems,
        controlQueue: controlQueueStatus(),
        activeAlerts: alerts.map(a => ({ code: a.code, message: a.message, raisedAt: a.raisedAt, count: a.count }))
    });
});

app.get('/api/version', (req, res) => res.json({ version: config.appVersion }));

/* ---------------- auth ---------------- */

app.use('/auth', express.urlencoded({ extended: false }), authRouter());

/* ---------------- API (authenticated, rate-limited) ---------------- */

app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '240', 10), // per client IP; raised for test runs
    message: { error: 'Too many requests — please wait a moment' }
}));
app.use('/api', requireAuth, apiRouter);
// Any /api path not matched by the router is a 404 JSON — never the SPA shell
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));

/* ---------------- static frontend + SPA fallback (authenticated) ---------------- */

app.use(requireAuth, express.static(join(__dirname, 'public')));
app.get('*', requireAuth, (req, res) => {
    // SPA fallback serves the shell for page routes only — a missing asset is a 404,
    // never index.html (retired files must not silently resolve)
    if (/\.[a-z0-9]+$/i.test(req.path)) return res.status(404).json({ error: 'Not found' });
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

/* ---------------- error handler (no stack traces to clients) ---------------- */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(`[SERVER] Unhandled error on ${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
    res.status(500).json({ error: 'Something went wrong — the issue has been logged' });
});

/* ---------------- start ---------------- */

async function start() {
    await initOidc();
    // Eager store warm-up (CR-02): in live mode, actively probe Cosmos at boot so a keyless-WI
    // token / RBAC / missing-container failure surfaces immediately with a clear log line, rather
    // than silently at first store write. A failure is logged and flips store health, but must NOT
    // exit — the device board still reads from the bridge, and /healthz then reports 'degraded'.
    if (config.dataMode === 'live') {
        const store = await storeProbe();
        console.log(`  store warm-up: ${store.mode} · healthy=${store.healthy}`);
    }
    startWorker(); // durable hold reverts resume after restart (F010 overrides)
    startLivenessMonitor(); // F010 — producer business-liveness self-check (no-overnight-activity)
    app.listen(config.port, () => {
        console.log(`OOH Dashboard v${config.appVersion} on port ${config.port}`);
        console.log(`  auth: ${config.authMode} · data: ${config.dataMode} · origin: ${config.appOrigin}`);
    });
}

start().catch(err => {
    console.error(`FATAL: startup failed: ${err.message}`);
    process.exit(1);
});
