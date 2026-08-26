# IoT OOH Triage — Prototype Safety Rules

**Status:** ACTIVE — applies to all prototype testing
**Last Updated:** 2026-03-27
**Purpose:** Ensure the prototype NEVER makes live changes to any IoT platform

---

## Golden Rule

**The prototype reads live data but NEVER writes to any platform.**

All "control" actions (boost, switch on, override) are simulated in the frontend only. They show a toast, log to the triage summary, and display a `[SIMULATED]` badge. They do NOT call any backend API endpoint.

---

## Architecture Enforcing Safety

### Layer 1: Frontend (public/index.html)
- **Zero POST/PUT fetch calls.** All `fetch()` calls use GET method only.
- Action buttons (boost, switch on, override) call local JavaScript functions that display simulated results.
- These functions NEVER call `fetch()` with a write method.

### Layer 2: Backend (.env)
- `READ_ONLY=true` must be set in the `.env` file.
- This is the master safety switch.

### Layer 3: Backend Routes (services/*.js)
- Every POST/PUT route in `tuya.js`, `salus.js`, `intesis.js` checks `READ_ONLY` first.
- If `READ_ONLY=true`, the route returns `{_readOnly: true, message: '...'}` without calling the external API.
- This is a defence-in-depth measure — the frontend should never hit these routes, but if it did, they'd be harmless.

---

## Mandatory Testing Checks

### Before EVERY commit

```bash
# 1. Verify no POST/PUT in frontend code
grep -c "method.*POST\|method.*PUT\|method.*DELETE\|method.*PATCH" public/index.html
# EXPECTED: 0

# 2. Verify READ_ONLY is set
grep "READ_ONLY=true" .env
# EXPECTED: match found

# 3. Count all fetch() calls — all must be GET
grep -c "fetch(" public/index.html
# Record the count. Cross-reference with known GET endpoints only.

# 4. Verify backend guards exist on write routes
grep -c "READ_ONLY" services/tuya.js services/salus.js services/intesis.js
# EXPECTED: at least 1 per file
```

### Before EVERY demo/presentation

1. Open browser DevTools → Network tab
2. Run through a complete triage flow including a "boost" or "switch on" action
3. **Verify:** No POST, PUT, DELETE, or PATCH requests appear in the Network tab
4. **Verify:** All requests are GET to `/api/tb/`, `/api/tuya/`, `/api/salus/`, `/api/zendesk/` endpoints
5. **Verify:** Server console shows no `[TUYA] Switch command` or `[SALUS] Setpoint change` entries
6. **Verify:** Action confirmation messages show `[SIMULATED]` badge

### Before EVERY new flow is added

1. Review the flow function for any `fetch()` calls
2. If the flow has a "control" action (boost, switch, override, turn on/off):
   - It MUST NOT call `fetch()` with POST/PUT
   - It MUST display `[SIMULATED]` badge
   - It MUST use `as()` with the `badge-demo` class
   - It MUST prefix `actionsTaken` entries with `[SIMULATED]`

---

## What IS allowed (READ-ONLY operations)

| Endpoint | Method | What it does | Safe? |
|----------|--------|-------------|-------|
| `/api/tb/status` | GET | Check ThingsBoard connectivity | Yes |
| `/api/tb/sites/:siteNo` | GET | Look up site in ThingsBoard | Yes |
| `/api/tb/sites/:siteNo/devices` | GET | List devices at site | Yes |
| `/api/tb/devices/:id/telemetry` | GET | Read latest sensor values | Yes |
| `/api/tb/devices/:id/status` | GET | Read online/offline status | Yes |
| `/api/tuya/status` | GET | Check Tuya connectivity | Yes |
| `/api/tuya/devices/:id/status` | GET | Read switch state | Yes |
| `/api/tuya/devices/:id/schedules` | GET | Read schedule | Yes |
| `/api/salus/status` | GET | Check Salus connectivity | Yes |
| `/api/salus/:account/devices` | GET | Read zone temperatures | Yes |
| `/api/zendesk/field-options/:id` | GET | Load site dropdown | Yes |
| `/api/health` | GET | App health check | Yes |

## What is BLOCKED (WRITE operations)

| Endpoint | Method | What it would do | Status |
|----------|--------|-----------------|--------|
| `/api/tuya/devices/:id/switch` | POST | Turn device on/off | BLOCKED by READ_ONLY + not called by frontend |
| `/api/salus/:account/devices/:id/setpoint` | POST | Change temperature | BLOCKED by READ_ONLY + not called by frontend |
| `/api/zendesk/tickets.json` | POST | Create ticket | BLOCKED by READ_ONLY + not called by frontend |
| `/api/zendesk/tickets/:id.json` | PUT | Update ticket | BLOCKED by READ_ONLY + not called by frontend |

---

## Visual Indicators in the UI

| Badge | Meaning |
|-------|---------|
| `LIVE` (green) | Data fetched from a real API in real-time |
| `DEMO` (amber) | Hardcoded demonstration data |
| `SIMULATED` (amber) | Action was recorded but NOT executed on any platform |
| Purple banner at top | Persistent reminder that this is a prototype |
