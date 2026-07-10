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
        // Claim value → app role mapping (JSON), e.g. {"ClaimArea.IoT":"iot","OOH.Handler":"handler"}
        roleMap: JSON.parse(env('OIDC_ROLE_MAP', '{"OOH.Handler":"handler","OOH.IoTAdmin":"iot","ClaimArea.IoT":"iot"}'))
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
        apiToken: env('ZENDESK_API_TOKEN'),
        siteFieldId: 11405878329244,
        followUpFieldId: 26074112194076,
        oohTag: 'ooh'
    },

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

    // IoT Support dashboard base URL for P1 deep-links (F014/F026)
    iotDashBaseUrl: env('IOT_DASH_BASE_URL', 'https://iot-support-dashboard.airedalegroup.io'),

    control: {
        syncPollIntervalMs: parseInt(env('SYNC_POLL_INTERVAL_MS', '3000'), 10),
        syncTimeoutMs: parseInt(env('SYNC_TIMEOUT_MS', '90000'), 10),
        lateSyncWatchMs: parseInt(env('LATE_SYNC_WATCH_MS', '600000'), 10)
    }
};

/**
 * Validates configuration for the selected modes; returns a list of fatal problems.
 */
export function validateConfig() {
    const problems = [];
    if (config.isProduction) {
        if (config.authMode !== 'oidc') problems.push('AUTH_MODE must be "oidc" in production (fail-secure)');
        if (config.dataMode !== 'live') problems.push('DATA_MODE must be "live" in production');
        if (!config.session.secret) problems.push('SESSION_SECRET is required in production');
        if (!config.appOrigin.startsWith('https://')) problems.push('APP_ORIGIN must be https in production');
    }
    if (config.authMode === 'oidc') {
        if (!config.oidc.issuer || !config.oidc.clientId || !config.oidc.clientSecret) {
            problems.push('OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required when AUTH_MODE=oidc');
        }
    }
    if (config.dataMode === 'live') {
        if (!config.bridge.baseUrl) problems.push('BRIDGE_BASE_URL is required when DATA_MODE=live');
        if (!config.thingsboard.writeUsername || !config.thingsboard.writePassword) {
            problems.push('TB_WRITE_USERNAME / TB_WRITE_PASSWORD (SR-3 scoped credential) are required when DATA_MODE=live');
        }
        if (!config.cosmos.endpoint || !config.cosmos.key) problems.push('COSMOS_ENDPOINT / COSMOS_KEY are required when DATA_MODE=live');
    }
    return problems;
}
