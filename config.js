/**
 * Central configuration — all environment access lives here.
 *
 * Modes:
 *  - AUTH_MODE:  'oidc' (Airedale B2C, production) | 'dev' (fictitious operators, non-production only)
 *  - DATA_MODE:  'live' (bridge read API + ThingsBoard) | 'fixture' (local fixture data, no live systems)
 *
 * Production fail-secure rules are enforced in server.js at startup:
 * AUTH_MODE=dev or DATA_MODE=fixture refuse to start when NODE_ENV=production.
 */

import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const env = (key, fallback = undefined) => {
    const v = process.env[key];
    return v === undefined || v === '' ? fallback : v;
};

export const config = {
    appVersion: pkg.version,
    port: parseInt(env('PORT', '3001'), 10),
    isProduction: env('NODE_ENV') === 'production',

    // Origin the app is served from — CORS and OIDC redirect URIs are locked to this
    appOrigin: env('APP_ORIGIN', `http://localhost:${env('PORT', '3001')}`),

    authMode: env('AUTH_MODE', env('NODE_ENV') === 'production' ? 'oidc' : 'dev'),
    dataMode: env('DATA_MODE', 'fixture'),

    session: {
        secret: env('SESSION_SECRET'),
        name: 'ooh.sid',
        maxAgeMs: 12 * 60 * 60 * 1000 // one OOH shift
    },

    // Airedale B2C (shared hub client pattern per F024/SD-545) — values provided by Spencer
    oidc: {
        issuer: env('OIDC_ISSUER'),               // e.g. https://<tenant>.b2clogin.com/<tenant>/<policy>/v2.0
        clientId: env('OIDC_CLIENT_ID'),
        clientSecret: env('OIDC_CLIENT_SECRET'),
        scope: env('OIDC_SCOPE', 'openid profile email'),
        roleClaim: env('OIDC_ROLE_CLAIM', 'extension_Role'),
        // claimArea int → app role mapping (JSON). F002/SD-586: extension_Role is a serialised
        // AreaClaim[] keyed on the claimArea int — 1500 = Zendesk/OOH → handler, 1400 = IoT → iot.
        // Prod sets OIDC_ROLE_MAP explicitly; this default keeps a missing env correct.
        roleMap: JSON.parse(env('OIDC_ROLE_MAP', '{"1500":"handler","1400":"iot"}'))
    },

    // Integration-bridge internal read API (SD-545; cluster-internal in iot-services)
    bridge: {
        baseUrl: env('BRIDGE_BASE_URL'), // e.g. http://integration-bridge.iot-services.svc.cluster.local
        timeoutMs: parseInt(env('BRIDGE_TIMEOUT_MS', '10000'), 10)
    },

    // ThingsBoard — READ credential (telemetry/status) and scoped WRITE credential (SR-3, F003)
    thingsboard: {
        url: env('TB_URL', 'https://portal.lhlive.co.uk'),
        readUsername: env('TB_USERNAME'),
        readPassword: env('TB_PASSWORD'),
        writeUsername: env('TB_WRITE_USERNAME'),
        writePassword: env('TB_WRITE_PASSWORD')
    },

    zendesk: {
        subdomain: env('ZENDESK_SUBDOMAIN'),
        email: env('ZENDESK_EMAIL'),
        // Standard Zendesk API-token Basic auth: base64(email/token:apiToken) — same scheme the rest
        // of the Airedale Zendesk estate uses. This is the live credential.
        apiToken: env('ZENDESK_API_TOKEN'),
        // Deprecated: an earlier build used plain email:password; retained only for back-compat/no-op.
        password: env('ZENDESK_PASSWORD'),
        siteFieldId: 11405878329244,
        followUpFieldId: 26074112194076,
        // Ticket Category tagger field — "Support Request" (F002). The consumer does not read
        // this; it drives Zendesk-native Explore reporting only. Verified live 2026-07-14.
        categoryFieldId: 25999250486684,
        categoryValue: 'tcat_support_request',
        oohTag: 'ooh'
    },

    // Deploy-time device-write lock (F005). A synchronous, Cosmos-independent kill that engages
    // at first live boot regardless of the runtime kill-switch state — every device write routes
    // through killswitch.writesBlocked(), which checks this FIRST. Fail-CLOSED by design: writes
    // are enabled ONLY when WRITES_DISABLED is set to exactly "false" (trim + lower-case). Absence,
    // empty, "true", "0", "no", a typo, or ANY other value ⇒ disabled. Read the RAW process.env
    // value (NOT via env(), whose empty→fallback collapse must not be inherited here) so unset/empty
    // cannot masquerade as anything but "not exactly false". Enable is a deliberate, auditable act.
    writesDisabled: (process.env.WRITES_DISABLED ?? '').trim().toLowerCase() !== 'false',

    // Durable store: Cosmos DB in live mode, local JSON files in fixture/dev mode
    cosmos: {
        endpoint: env('COSMOS_ENDPOINT'),
        key: env('COSMOS_KEY'),
        database: env('COSMOS_DATABASE', 'ooh-dashboard')
    },

    sms: {
        provider: env('SMS_PROVIDER', 'log'), // 'log' | 'twilio' — gateway choice pending Spencer/James (Q-F)
        twilio: {
            accountSid: env('TWILIO_ACCOUNT_SID'),
            authToken: env('TWILIO_AUTH_TOKEN'),
            from: env('TWILIO_FROM')
        },
        onDutyNumber: env('ESCALATION_ONDUTY_NUMBER'),
        onDutyName: env('ESCALATION_ONDUTY_NAME', 'On-duty escalation manager')
    },

    // IoT Support dashboard base URL for P1 deep-links (F004/F026). Default is the live UAT host
    // so the P1 SMS deep-link (/?ticket={id}) resolves correctly even if the env var is unset;
    // production still sets IOT_DASH_BASE_URL explicitly via the Spencer-managed secret.
    iotDashBaseUrl: env('IOT_DASH_BASE_URL', 'https://zendesk-uat.airedale-api.co.uk'),

    control: {
        // OOHDASH-123 (Rosetta Stone): the single global 90s decide-now / 10-min late-watch / 30s
        // mid-wait block is REPLACED by per-class confirm timing (see `classes` below), consumed via
        // registry.capabilitiesContractFor. syncPollIntervalMs is retained as the server watcher's
        // BASE tick — each in-flight action is read at its own class confirmPollMs cadence on top of it.
        syncPollIntervalMs: parseInt(env('SYNC_POLL_INTERVAL_MS', '3000'), 10),
        // DEPRECATED (OOHDASH-123): the global decide-now / late-watch / mid-wait timers are superseded
        // by the per-class `classes` block below and removed from the control plane in WU4/WU6. They are
        // retained here only until the last consumer migrates, so no commit is left half-wired.
        syncTimeoutMs: parseInt(env('SYNC_TIMEOUT_MS', '90000'), 10),
        lateSyncWatchMs: parseInt(env('LATE_SYNC_WATCH_MS', '600000'), 10),
        midWaitPromptMs: parseInt(env('MID_WAIT_PROMPT_MS', '30000'), 10),
        // OOHDASH-24: freshness window for the /healthz active read-probe. A probe result older
        // than this is stale ⇒ the read tri-state can no longer report green off it (amber/unknown
        // until a fresh probe runs). Env-overridable; default 60s.
        healthProbeTtlMs: parseInt(env('HEALTH_PROBE_TTL_MS', '60000'), 10),
        // OOHDASH-123 / DD-RESEND-UX: the SQ-09 Salus dedup fallback is repurposed under no-resend as a
        // one-shot dispatch-sanity check. If the Salus status attr lastUpdateTs does not advance within
        // this window after the SINGLE dispatch write, surface the humane "may not have reached the
        // device" warning and note the ticket (a swallowed write stays visible; nothing is re-fired).
        dispatchSanityMs: parseInt(env('OOH_DISPATCH_SANITY_MS', '5000'), 10),
        // OOHDASH-123 / DD-SCHED-DISPLAY (James override: decoded display ON by default). dayOrder + tz
        // are single invertible constants so an SQ-13 correction is a config change, not a rebuild.
        schedule: {
            dayOrder: env('OOH_SCHED_DAY_ORDER', 'mon-first'),   // 'mon-first' | 'sun-first'
            tz: env('OOH_SCHED_TZ', 'Europe/London'),
            decoded: env('OOH_SCHED_DECODED', 'on') !== 'off'
        },
        // Per-class confirm timing (ms) + operator copy minutes + offline threshold hours. Defaults
        // from design §5 / build plan §3. Every value is env-overridable with no release.
        classes: {
            tuya: {
                confirmLimitMs: parseInt(env('OOH_CONFIRM_LIMIT_MS_TUYA', '10000'), 10),
                lateWatchMs: parseInt(env('OOH_LATE_WATCH_MS_TUYA', '120000'), 10),
                confirmPollMs: parseInt(env('OOH_CONFIRM_POLL_MS_TUYA', '3000'), 10),
                copyMinutes: null,
                offlineHours: parseInt(env('OOH_OFFLINE_HOURS_TUYA', '3'), 10)
            },
            'salus-it700': {
                confirmLimitMs: parseInt(env('OOH_CONFIRM_LIMIT_MS_IT700', '2700000'), 10),
                lateWatchMs: parseInt(env('OOH_LATE_WATCH_MS_IT700', '5400000'), 10),
                confirmPollMs: parseInt(env('OOH_CONFIRM_POLL_MS_SALUS', '60000'), 10),
                copyMinutes: parseInt(env('OOH_COPY_MIN_IT700', '5'), 10),
                offlineHours: parseInt(env('OOH_OFFLINE_HOURS_IT700', '3'), 10)
            },
            'salus-it500': {
                confirmLimitMs: parseInt(env('OOH_CONFIRM_LIMIT_MS_IT500', '2100000'), 10),
                lateWatchMs: parseInt(env('OOH_LATE_WATCH_MS_IT500', '3600000'), 10),
                confirmPollMs: parseInt(env('OOH_CONFIRM_POLL_MS_SALUS', '60000'), 10),
                copyMinutes: parseInt(env('OOH_COPY_MIN_IT500', '15'), 10),
                offlineHours: parseInt(env('OOH_OFFLINE_HOURS_IT500', '3'), 10)
            },
            salus: {
                confirmLimitMs: parseInt(env('OOH_CONFIRM_LIMIT_MS_IT500', '2100000'), 10),
                lateWatchMs: parseInt(env('OOH_LATE_WATCH_MS_IT500', '3600000'), 10),
                confirmPollMs: parseInt(env('OOH_CONFIRM_POLL_MS_SALUS', '60000'), 10),
                copyMinutes: parseInt(env('OOH_COPY_MIN_IT500', '15'), 10),
                offlineHours: parseInt(env('OOH_OFFLINE_HOURS_IT500', '3'), 10)
            },
            // Monitor-only classes (boiler panels, intesis, refrigeration, gateways) — never dispatched;
            // only offlineHours is meaningful (48h, boiler/monitor devices report infrequently).
            monitor: {
                confirmLimitMs: 0, lateWatchMs: 0, confirmPollMs: 0, copyMinutes: null,
                offlineHours: parseInt(env('OOH_OFFLINE_HOURS_MONITOR', '48'), 10)
            }
        }
    },

    // OOHDASH-119: optional additional notes. One shared constant so the limit is changed in one place.
    notes: {
        maxChars: 1000
    },

    // Call-ticket reconciliation (F003). Thresholds are the numbers James tunes at the Design Gate
    // (locked: auto-merge ≥0.80 / link-only 0.50–0.79); env-overridable so they can be retuned
    // without a code change. operatorAgentMap maps operator email → Zendesk agent id for the
    // answered-by signal — now OPTIONAL (higher-precedence bonus): since the CR-01 fix derives
    // answered_by_name from answered_by_id via a users lookup, the name-match signal works live
    // without the map, so auto-merge no longer depends on Spencer supplying it.
    reconciliation: {
        operatorAgentMap: env('OOH_OPERATOR_AGENT_MAP', '{}'),
        autoMergeThreshold: parseFloat(env('OOH_RECON_AUTOMERGE_THRESHOLD', '0.80')),
        linkThreshold: parseFloat(env('OOH_RECON_LINK_THRESHOLD', '0.50'))
    }
};

/**
 * Validates configuration for the selected modes; returns a list of fatal problems.
 */
export function validateConfig() {
    const problems = [];
    // DEPRECATED invariant (removed with midWaitPromptMs in WU6): retained while the legacy timer
    // still exists so the mid-wait config tests stay green until the client prompt is reworked.
    if (!(config.control.midWaitPromptMs > 0 && config.control.midWaitPromptMs <= config.control.syncTimeoutMs)) {
        problems.push('MID_WAIT_PROMPT_MS must satisfy 0 < midWaitPromptMs <= syncTimeoutMs (SYNC_TIMEOUT_MS)');
    }
    // OOHDASH-123: per-class control timing invariant. For each controllable class:
    // 0 < copyMinutes*60000 (when set) <= confirmLimitMs <= lateWatchMs, and confirmPollMs > 0.
    for (const [cls, c] of Object.entries(config.control.classes)) {
        if (cls === 'monitor') continue;
        const copyMs = (c.copyMinutes || 0) * 60000;
        if (!(c.confirmLimitMs > 0 && c.confirmLimitMs <= c.lateWatchMs && c.confirmPollMs > 0 && copyMs <= c.confirmLimitMs)) {
            problems.push(`control.classes.${cls} timing invalid: require 0 < copyMinutes*60000 <= confirmLimitMs <= lateWatchMs and confirmPollMs > 0`);
        }
    }
    if (config.isProduction) {
        if (config.authMode !== 'oidc') problems.push('AUTH_MODE must be "oidc" in production (fail-secure)');
        if (config.dataMode !== 'live') problems.push('DATA_MODE must be "live" in production');
        if (!config.session.secret) problems.push('SESSION_SECRET is required in production');
        if (!config.appOrigin.startsWith('https://')) problems.push('APP_ORIGIN must be https in production');
        // AD-04: require the P1 deep-link host explicitly in production — fail loud rather than
        // silently falling back to the UAT default (which would send live P1 SMS links to UAT).
        if (!env('IOT_DASH_BASE_URL')) problems.push('IOT_DASH_BASE_URL must be set explicitly in production (P1 deep-link host; no silent fallback)');
    }
    if (config.authMode === 'oidc') {
        // F001/SD-586: Techhub-Production is a secret-less client used for implicit id_token
        // sign-in (response_type=id_token, form_post) — OIDC_CLIENT_SECRET is intentionally NOT
        // required and there is no token-endpoint call, so no secret is ever sent.
        if (!config.oidc.issuer || !config.oidc.clientId) {
            problems.push('OIDC_ISSUER and OIDC_CLIENT_ID are required when AUTH_MODE=oidc');
        }
    }
    if (config.dataMode === 'live') {
        if (!config.bridge.baseUrl) problems.push('BRIDGE_BASE_URL is required when DATA_MODE=live');
        if (!config.thingsboard.writeUsername || !config.thingsboard.writePassword) {
            problems.push('TB_WRITE_USERNAME / TB_WRITE_PASSWORD (SR-3 scoped credential) are required when DATA_MODE=live');
        }
        // F003/SD-586: Cosmos is reached keyless via workload identity — COSMOS_KEY is
        // intentionally NOT required. COSMOS_DATABASE defaults (config.cosmos.database) so only
        // the endpoint is mandatory here.
        if (!config.cosmos.endpoint) problems.push('COSMOS_ENDPOINT is required when DATA_MODE=live');
    }
    return problems;
}
