# OOH Dashboard — Configuration Reference

All secrets live in `.env` locally (gitignored) or the Spencer-managed K8s Secret in production — never in source. Structure only, no values (see `config.js`).

| Variable | Mode | Purpose |
|---|---|---|
| `PORT` | all | Listen port (default 3001) |
| `APP_ORIGIN` | all | Origin the app is served from; CORS + OIDC redirects locked to it. Must be https in production |
| `AUTH_MODE` | all | `oidc` (production, enforced) / `dev` (fictitious operators, non-production only) |
| `DATA_MODE` | all | `live` (bridge + TB + Cosmos + Zendesk) / `fixture` (local fixtures, no live systems) |
| `SESSION_SECRET` | prod | Session-cookie signing secret (required in production) |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | oidc | Airedale B2C (shared hub client pattern, SD-545) — values from Spencer |
| `OIDC_SCOPE` / `OIDC_ROLE_CLAIM` / `OIDC_ROLE_MAP` | oidc | Role claim (`extension_Role`) → app role mapping (`handler`/`iot`) |
| `BRIDGE_BASE_URL` | live | Integration-bridge internal read API (cluster-internal, iot-services) |
| `TB_URL` / `TB_USERNAME` / `TB_PASSWORD` | live | ThingsBoard READ credential (telemetry/status) |
| `TB_WRITE_USERNAME` / `TB_WRITE_PASSWORD` | live | **SR-3 scoped WRITE credential** (F003 gate) — shared-attribute writes only |
| `ZENDESK_SUBDOMAIN` / `ZENDESK_EMAIL` / `ZENDESK_API_TOKEN` | live | Zendesk API service account |
| `COSMOS_ENDPOINT` / `COSMOS_KEY` / `COSMOS_DATABASE` | live | Durable store (holds, audit, config, SMS log) |
| `SMS_PROVIDER` | all | `log` (record only — default until the Q-F gateway decision) / `twilio` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | twilio | Twilio REST credentials |
| `ESCALATION_ONDUTY_NUMBER` / `ESCALATION_ONDUTY_NAME` | all | On-duty escalation manager SMS target |
| `IOT_DASH_BASE_URL` | all | IoT Support dashboard base URL for P1 deep-links (F026) |
| `SYNC_POLL_INTERVAL_MS` / `SYNC_TIMEOUT_MS` / `LATE_SYNC_WATCH_MS` | all | Sync loop tuning (defaults 3s / 90s / 10min) |

Local development quick start:

```bash
npm install
npm run dev          # AUTH_MODE=dev, DATA_MODE=fixture by default outside production
# sign in as "Test Handler" or "Test IoT Admin" at /auth/dev
```
