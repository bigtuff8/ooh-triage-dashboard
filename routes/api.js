/**
 * REST API. Every route here sits behind requireAuth (mounted in server.js);
 * privileged routes add requireRole('iot') — authorisation is enforced at the
 * service boundary, never just hidden in the UI.
 */

import { Router } from 'express';
import { config } from '../config.js';
import { requireRole } from '../services/auth.js';
import * as bridge from '../services/bridge.js';
import * as resolution from '../services/resolution.js';
import * as registry from '../services/registry.js';
import * as control from '../services/control.js';
import * as killswitch from '../services/killswitch.js';
import * as overrides from '../services/overrides.js';
import * as zendesk from '../services/zendesk.js';
import { hhmm } from '../services/zendesk.js';
import * as p1Log from '../services/p1-log.js';
import * as reconciliation from '../services/reconciliation.js';
import * as audit from '../services/audit.js';
import * as metrics from '../services/metrics.js';
import * as liveness from '../services/liveness.js';
import * as notices from '../services/notices.js';
import { zoneTimetable } from '../services/schedule.js';

const router = Router();

const wrap = fn => (req, res) => fn(req, res).catch(err => {
    const status = err.status || 500;
    if (status >= 500) console.error(`[API] ${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
    res.status(status).json({ error: err.message, ...(err.resolution ? { resolution: err.resolution } : {}), ...(err.guardrail ? { guardrail: true } : {}) });
});

// OOHDASH-119: server-side idempotency for POST /api/tickets/:id/notes.
// Deduplicates re-sends with the same token within a 60-second window.
// Keys are `${ticketId}:${token}`; the Map is in-process memory only.
// IMPORTANT: _notesIdempCheck only READS the Map; _notesIdempCommit records success.
// This write-then-commit discipline means a failed write never blocks the retry:
// if the Zendesk write throws, the token was never committed, so the next call with
// the same token is allowed through and attempts the write again.
const _notesIdempMap = new Map();
function _notesIdempPurge() {
    const now = Date.now();
    for (const [k, ts] of _notesIdempMap) { if (now - ts > 60000) _notesIdempMap.delete(k); }
}
function _notesIdempCheck(ticketId, token) {
    if (!token) return false;
    _notesIdempPurge();
    return _notesIdempMap.has(`${ticketId}:${token}`); // check only — do NOT set
}
function _notesIdempCommit(ticketId, token) {
    if (!token) return;
    _notesIdempMap.set(`${ticketId}:${token}`, Date.now());
}
// Exported for unit testing only — do not call from production paths.
export { _notesIdempMap as _notesIdempMapForTest, _notesIdempCheck as _notesIdempCheckForTest, _notesIdempCommit as _notesIdempCommitForTest };

/* ---------------- session / app context ---------------- */

// OOHDASH-122: read-degraded means a REAL read failure has been recorded (lastError set),
// not "not yet proven". A fresh pod with no read yet is not degraded. Used by /me AND the
// workspace payload so the two degraded signals can never disagree in meaning.
export function bridgeDegraded(status = bridge.bridgeStatus()) {
    return !!status.lastError;
}

router.get('/me', wrap(async (req, res) => {
    const op = req.session.operator;
    res.json({
        operator: { name: op.name, role: op.role, roleLabel: op.roleLabel, email: op.email },
        killSwitch: await killswitch.killSwitchState(),
        notices: await notices.activeNotices(),
        degraded: bridgeDegraded(),
        version: config.appVersion,
        dataMode: config.dataMode,
        // R8/S10: derived "control is live" signal for the OOHDASH-19 flip. Computed from
        // config.writesDisabled (config.js:90) — the SAME deploy-time-lock truth /healthz echoes
        // (server.js:86) — so operator-facing (controlLive) and probe-facing (writesDisabled)
        // signals cannot diverge. Because it is `!config.writesDisabled` it is structurally tied
        // to the true flag and can NEVER be hard-coded to live: flipping the env flips this.
        controlLive: !config.writesDisabled,
        // OOHDASH-119: notes limit delivered to client so the textarea maxlength is set from config.
        notes: { maxChars: config.notes.maxChars }
    });
}));

/* ---------------- site search / resolution (F004) ---------------- */

router.get('/sites/search', wrap(async (req, res) => {
    let results;
    try {
        results = await bridge.searchSites(req.query.q);
    } catch (e) {
        console.error('[BRIDGE] sites/search failed:', (e && e.stack) || e);
        return res.status(503).json({ error: 'Device inventory unavailable — degraded mode', degraded: true });
    }
    // Duplicate house IDs are surfaced, not hidden — the resolution gate rejects them
    const counts = {};
    results.forEach(r => { counts[r.siteNo] = (counts[r.siteNo] || 0) + 1; });
    res.json({
        results: results.map(r => ({
            siteNo: r.siteNo, siteName: r.siteName, nameUnverified: r.nameUnverified, brand: r.brand, duplicate: counts[r.siteNo] > 1
        }))
    });
}));

router.get('/sites/:siteNo/resolve', wrap(async (req, res) => {
    const result = await resolution.resolveSite(req.params.siteNo, req.session.operator);
    if (result.status === 'resolved') {
        const s = result.site;
        return res.json({
            status: 'resolved',
            site: { siteNo: s.siteNo, siteName: s.siteName, nameUnverified: s.nameUnverified, accountId: s.accountId, brand: s.brand, address: s.address, callsLast30Days: s.callsLast30Days, deviceSummary: deviceSummary(s) }
        });
    }
    res.json(result);
}));

router.post('/sites/:siteNo/confirm', wrap(async (req, res) => {
    const { token, site } = await resolution.confirmSite(req.params.siteNo, req.session.operator);
    res.json({ confirmToken: token, workspace: await workspacePayload(site) });
}));

router.get('/sites/:siteNo/workspace', wrap(async (req, res) => {
    // Refresh reads for an already-confirmed site (30s auto-refresh)
    if (!resolution.isConfirmed(req.query.confirmToken, req.params.siteNo, req.session.operator.id)) {
        return res.status(409).json({ error: 'Site not confirmed' });
    }
    const sites = await bridge.getSitesByNumber(req.params.siteNo);
    if (sites.length !== 1) return res.status(409).json({ error: 'Site no longer uniquely resolvable' });
    res.json({ workspace: await workspacePayload(sites[0]) });
}));

function deviceSummary(site) {
    const h = site.devices.filter(d => d.kind === 'heating').length;
    const hw = site.devices.some(d => d.kind === 'hotwater');
    const k = site.devices.filter(d => d.kind === 'kitchen').length;
    const bits = [];
    if (h) bits.push(`${h} heating zone${h > 1 ? 's' : ''}`);
    if (hw) bits.push('hot water');
    if (k) bits.push(`${k} kitchen circuit${k > 1 ? 's' : ''}`);
    return bits.length ? `On Lighthouse: ${bits.join(' · ')}` : 'No Lighthouse devices found for this site.';
}

// OOHDASH-114-F1: DHW controllability is now derived from the boilerControl device's TB shared
// attributes (Sam Day spec). The old registry-capability path tested for 'salus-it500-dhw'
// which live TB never emits. The new path reads the authoritative TB attributes via
// deriveBoilerControl: V2 = DHW.use_boiler (CLIENT_SCOPE); V1 = output1OutputMask[3] (SHARED_SCOPE).
// Fail-closed: returns false when boilerControl field is absent or dhwControllable is false.
export function hasControllableDhw(site) {
    return !!(site.boilerControl?.dhwControllable);
}
// A combi carries the DHW demand signal (hotWaterCapable / telemetry.hotWater)
// but is observed-not-controllable — enough to say "monitored, not adjustable".
function hasHotWaterSignal(site) {
    return site.devices.some(d => d.hotWaterCapable || d.telemetry?.hotWater != null);
}

// D10: kitchen/lighting/fan flip from hard-'mon' to capability-driven 'ctl' when a device of that
// kind actually exposes the `switch` command (Tuya single-gang). Presence-driven — the tile lights
// up to controllable with NO code change once a switch-capable device appears in live inventory,
// and honestly stays 'mon' where the kind is present but not switchable (e.g. tb-rulechain fans).
const switchControllable = (s, kind) => s.devices.some(d =>
    d.kind === kind && (registry.capabilitiesFor(d.deviceType)?.commands || []).includes('switch'));

export const SCOPE_GROUPS = [
    // OOHDASH-135 Item 4: heating scope is now DEVICE-driven (d.controllable on the effective
    // device list built by workspacePayload's Level-A gate). boilerControl.heatingControllable
    // is no longer the deciding factor — that was evaluated before the effective-controllable
    // was computed, producing a stale result for dark fleets and flag-gated device classes.
    // Step 1: any heating device with effective controllable=true → 'ctl'
    // Step 2: any heating device present → 'mon'
    // Step 3: no heating devices → 'none'
    { key: 'heating', label: 'Heating', level: s => s.devices.some(d => d.kind === 'heating' && d.controllable) ? 'ctl' : s.devices.some(d => d.kind === 'heating') ? 'mon' : 'none' },
    // OOHDASH-135 Item 6: four-step hotwater scope evaluation.
    // Step 1: DHW controllable via boilerControl or iT500-dhw → 'ctl'.
    // Step 2: hot-water signal device present → 'mon'.
    // Step 3: pure-heating site (heating device present, no boilerControl, no DHW device) → 'not-lighthouse'.
    //   Hot water exists at the site but is not on Lighthouse. CT3 (accepted inference): electric-only
    //   or genuinely no-DHW sites also land here and show 'not-lighthouse' (false-positive accepted over
    //   false-negative silence; Track 2 W5-A classifier enables finer discrimination).
    // Step 4: no heating or DHW device at all → 'none'.
    { key: 'hotwater', label: 'Hot water', level: s =>
        hasControllableDhw(s) ? 'ctl' :
        hasHotWaterSignal(s) ? 'mon' :
        (s.devices.some(d => d.kind === 'heating') && !s.boilerControl?.present && !s.devices.some(d => d.deviceType === 'salus-it500-dhw')) ? 'not-lighthouse' :
        'none' },
    { key: 'kitchen', label: 'Kitchen equipment', level: s => switchControllable(s, 'kitchen') ? 'ctl' : s.devices.some(d => d.kind === 'kitchen') ? 'mon' : 'none' },
    { key: 'lighting', label: 'External lighting', level: s => switchControllable(s, 'lighting') ? 'ctl' : s.devices.some(d => d.kind === 'lighting') ? 'mon' : 'none' },
    { key: 'fan', label: 'Extractor fans', level: s => switchControllable(s, 'fan') ? 'ctl' : s.devices.some(d => d.kind === 'fan') ? 'mon' : 'none' },
    { key: 'electrics', label: 'Internal lighting / sockets', level: () => 'none' },
    { key: 'boiler', label: 'Boiler internals / PCB', level: () => 'none' }
];

async function workspacePayload(site) {
    let tickets = [];
    try { tickets = await zendesk.ticketsForSite(site.siteNo); }
    catch (err) { console.error(`[API] Site tickets unavailable: ${err.message}`); }

    const P1_WINDOW_MS = 24 * 60 * 60 * 1000;
    const activeP1Tickets = tickets.filter(t =>
        Array.isArray(t.tags) &&
        t.tags.includes('ooh_p1') &&
        !['solved', 'closed'].includes(t.status?.raw ?? t.status) &&
        t.updatedAt &&
        (Date.now() - new Date(t.updatedAt).getTime()) < P1_WINDOW_MS
    );

    // OOHDASH-115-F2: C&B sites (identified by boilerControl device presence) show only 5 scope rows.
    // The two excluded rows ('electrics', 'boiler') are hardcoded-none and add no triage value for C&B.
    // Non-C&B sites (hotels, FHI) continue to show all 7 rows unchanged.
    // subBrand is NOT used — it does not exist in TB (live verified 2026-10-09, 7 sites).
    const CB_SCOPE_KEYS = ['heating', 'hotwater', 'kitchen', 'lighting', 'fan'];
    const isCandB = !!(site.boilerControl?.present);
    const scopeGroups = isCandB
        ? SCOPE_GROUPS.filter(g => CB_SCOPE_KEYS.includes(g.key))
        : SCOPE_GROUPS;
    // OOHDASH-114-F1: safe default for boilerControl when field is absent (legacy fixture sites, bridge path).
    // OOHDASH-136: dhwOverride added with visible:false so flows.js never throws on a missing key.
    const defaultBc = { present: false, isV1: false, isV2: false, heatingControllable: false, dhwControllable: false, deviceId: null, dhwOverride: { visible: false, hiddenReason: 'no-panel', panelVersion: null, panelLastSeenMs: null, mode: null, untilMs: null, confirmedAtMs: null, decodedAtMs: null, unreadableReason: null } };

    // OOHDASH-135 Item 3 Level A: compute effective controllable per device.
    // For salus-it500, the SALUS_IT500_CTL_ENABLED flag gate overrides d.controllable to false
    // when the flag is off — preventing a fleet reconnection from silently enabling iT500 setpoint
    // control before the operator activates it deliberately. All other device types pass through
    // d.controllable unchanged. The siteWithEffective object passes the effective device list to
    // SCOPE_GROUPS so the heating scope reflects the flag state (Item 4 depends on this).
    const effectiveDevices = site.devices.map(d => {
        const base = {
            ...stripDemo(d),
            capabilities: registry.capabilitiesFor(d.deviceType)?.commands || [],
            // D9: registration is derived — fixture devices are registered unless flagged
            // `_demo:'unregistered'`; live inventory sets it from published-state (§3.3). The flows
            // gate the Turn ON/OFF affordance on it; the dispatch-time hasPublishedState is the
            // authoritative re-assert.
            registered: d._demo !== 'unregistered',
            setpointWindow: typeof d.telemetry?.heatingSetpoint === 'number' ? registry.setpointWindow(d.deviceType, d.telemetry.heatingSetpoint) : null
        };
        if (d.deviceType === 'salus-it500' && !config.salusIt500CtlEnabled) {
            return { ...base, controllable: false };
        }
        return base;
    });
    const siteWithEffective = { ...site, devices: effectiveDevices };
    // OOHDASH-141: boostAvailable flags — per-site availability for the boost UI.
    // Both directions are gated by the master enabled flag and the per-site deny list.
    // Heat ON also requires boilerBoost.onEnabled.
    const boostBaseDenied = !config.boilerBoost.enabled || config.boilerBoost.sitesDeny.includes(String(site.siteNo));
    const boostAvailable = {
        on: !boostBaseDenied && config.boilerBoost.onEnabled,
        off: !boostBaseDenied
    };

    // OOHDASH-144: active boiler-panel holds for the banner + flow intercept.
    // Reads from the Cosmos store; null on failure (fail-soft — banner simply doesn't show).
    const activeBoostHolds = await overrides.activeBoostHoldsForSite(site.siteNo);

    // OOHDASH-144 §8.1a: boiler-panel sites with boostAvailable show Heating as "Controllable from here"
    // (even though device.controllable is false — the boost system is the control path, not the registry).
    // Pub heating boost requires: boost enabled + boilerControl present + at least one heating zone.
    // DHW-only sites (boilerControl.present but no heating.zones) remain "Monitored only" for Heating.
    const heatingBoostControllable = (boostAvailable.on || boostAvailable.off)
        && site.boilerControl?.present
        && (site.boilerControl?.heating?.zones?.length ?? 0) > 0;

    // OOHDASH-144: inject timetable data into boilerControl zones.
    // In live mode, zoneTimetable() is computed inside tb-device.js from SHARED_SCOPE attributes and
    // the zone objects already carry `timetable`. In fixture mode, the fixture stores zone schedules
    // under `boilerControl.heating.schedules[zoneId]` (added in §13b fixture changes) and we compute
    // the timetable here so the same code path works for both modes.
    let bcForPayload = site.boilerControl ?? defaultBc;
    if (bcForPayload.heating?.zones && bcForPayload.heating.schedules) {
        const tz = config.control?.schedule?.tz ?? 'Europe/London';
        const now = Date.now();
        const schedules = bcForPayload.heating.schedules;
        const enrichedZones = bcForPayload.heating.zones.map(z => {
            if (z.timetable != null) return z; // already set (live mode)
            const sched = z.zone ? schedules[z.zone] : null;
            const timetable = sched ? (zoneTimetable(sched, now, tz) ?? null) : null;
            return { ...z, timetable };
        });
        bcForPayload = { ...bcForPayload, heating: { ...bcForPayload.heating, zones: enrichedZones } };
    }

    return {
        site: { siteNo: site.siteNo, siteName: site.siteName, nameUnverified: site.nameUnverified, accountId: site.accountId, brand: site.brand, address: site.address, callsLast30Days: site.callsLast30Days },
        devices: effectiveDevices,
        scope: scopeGroups.map(g => {
            if (g.key === 'heating' && heatingBoostControllable) return { key: g.key, label: g.label, level: 'ctl' };
            return { key: g.key, label: g.label, level: g.level(siteWithEffective) };
        }),
        anyOffline: site.devices.some(d => !d.online),
        tickets,
        activeP1Tickets,
        degraded: bridgeDegraded(),
        boilerControl: bcForPayload,
        boostAvailable,
        activeBoostHolds
    };
}

function stripDemo(device) {
    const { _demo, tuyaFixture, ...rest } = device;
    return rest;
}

/* ---------------- control (F002/F005/F006/F007/F008/F009) ---------------- */

/* ---------------- boiler boost (OOHDASH-141) ---------------- */

router.post('/boiler-boost', wrap(async (req, res) => {
    const op = req.session.operator;
    const { siteNo, deviceId, zones, direction, durationKey, acknowledgedWarnings, callerWords, confirmToken, appendToHoldId } = req.body;
    const action = await control.dispatchBoilerBoost({ operator: op, confirmToken, siteNo, deviceId, zones, direction, durationKey, acknowledgedWarnings, callerWords, appendToHoldId: appendToHoldId || null });
    // Return warnings as 200 so the api helper doesn't throw; frontend checks res.warnings.
    if (action._warnings) return res.json({ warnings: action._warnings });
    // C2 fix (OOHDASH-144 §9 handover-safe append): the boost consumed the confirmation token,
    // so issue a fresh one for the same site. The browser stores it and uses it in the wrapup
    // append check (hasSiteConfirmation). The consumed token is permanently gone — cannot be
    // replayed for another boost (it no longer exists). The fresh token authorises only this
    // session's subsequent non-control reads/appends, not a new control write.
    const refreshed = await resolution.confirmSite(siteNo, op);
    res.json({ action, confirmToken: refreshed.token });
}));

/* OOHDASH-144 §5 — put back to normal early (any signed-in OOH role, same gate as boiler-boost). */
router.post('/sites/:siteNo/booster-holds/:id/cancel', wrap(async (req, res) => {
    const op = req.session.operator;
    const { siteNo, id } = req.params;
    const { confirmToken } = req.body || {};

    // 1. Site must be confirmed for this call.
    if (!resolution.isConfirmed(confirmToken, siteNo, op.id)) {
        return res.status(409).json({ error: 'not-confirmed', message: 'Confirm the site before putting heating back to normal' });
    }

    // 2. Load the hold doc.
    const { collection } = await import('../services/store.js');
    const col = await collection('OohOverrides');
    const doc = await col.get(id);
    if (!doc || doc.deviceType !== 'boiler-panel' || String(doc.siteNo) !== String(siteNo)) {
        return res.status(404).json({ error: 'hold-not-found' });
    }

    // 3. Hold must still be active.
    if (doc.status !== 'active') {
        return res.status(404).json({ error: 'hold-ended' });
    }

    // 4. Cancel (trigger prompt revert).
    try {
        await overrides.cancelOverride(id, op);
    } catch (e) {
        if (e.code === 'concurrency' || e.status === 409) {
            return res.status(409).json({ error: 'hold-changed', message: e.message });
        }
        throw e;
    }

    // Read back the doc to get the result.
    const after = await col.get(id);
    const ro = after?.revertOutcome || after?.status || 'pending';
    let result;
    if ((after?.status === 'reverted') && ro === 'written') result = 'reverted';
    else if ((after?.status === 'reverted') && ro === 'already-auto') result = 'already-auto';
    else if (after?.status === 'superseded-by-other') result = 'superseded';
    else if ((after?.status === 'reverted') && ro === 'same-direction-skip') result = 'left-forced';
    else result = 'pending';

    await audit.logAction({
        actionType: 'boiler-boost-cancel',
        operator: op,
        siteNo,
        detail: `Put heating back to normal (hold ${id}, zone ${doc.boilerZone}, result: ${result})`,
        outcome: result,
        ticketId: doc.ticketId || null
    });

    res.json({
        result,
        hold: {
            id,
            boilerZone: doc.boilerZone || null,
            direction: doc.direction || null,
            status: after?.status || 'unknown',
            ticketId: doc.ticketId || null
        }
    });
}));

router.get('/boiler-boost/preview', wrap(async (req, res) => {
    const { direction, durationKey } = req.query;
    const { clampBoostWindow } = await import('../services/boost-window.js');
    const result = clampBoostWindow(Date.now(), direction, durationKey);
    res.json(result);
}));

router.post('/control/dispatch', wrap(async (req, res) => {
    const { confirmToken, siteNo, deviceId, command, value, hold, direction } = req.body;
    const action = await control.dispatch({
        operator: req.session.operator,
        confirmToken, siteNo, deviceId, command, value, hold, direction
    });
    res.json({ action });
}));

router.get('/control/actions/:id', wrap(async (req, res) => {
    const action = control.getAction(req.params.id);
    if (!action) return res.status(404).json({ error: 'Action not found (it may have expired)' });
    res.json({ action });
}));

router.post('/control/actions/:id/wait', wrap(async (req, res) => {
    const action = control.extendWait(req.params.id);
    if (!action) return res.status(404).json({ error: 'Action not found or not waitable' });
    res.json({ action });
}));

/* ---------------- outcomes → tickets (F011/F014/F017/F001/F002/F003) ---------------- */

// Sync-state → human transcript line. Keeps the raw code out of the timeline while the
// anchor Outcome: line stays a bare code for the consumer's server parser.
// OOHDASH-123 three-outcome vocabulary (plus the legacy keys for any in-flight record mid-migration).
const SYNC_STEP_TEXT = {
    confirmed: 'Outcome: CONFIRMED — the device confirmed the change in its own reading',
    'non-delivery': 'Outcome: NOT DELIVERED — the gate/vendor rejected the command',
    indeterminate: 'Outcome: NOT CONFIRMED — accepted but the device had not confirmed by the limit (still watching)',
    'already-set': 'Outcome: already at the requested value — no change dispatched',
    'in-flight': 'Outcome: in flight — awaiting device confirmation',
    // legacy (pre-Rosetta) values, kept so an older record still renders a line
    synced: 'Outcome: CONFIRMED (synced)',
    'late-synced': 'Outcome: CONFIRMED late (late-synced)',
    timeout: 'Outcome: NOT CONFIRMED (timeout)',
    failed: 'Outcome: NOT DELIVERED (failed)',
    rejected: 'Outcome: NOT DELIVERED (rejected)',
    pending: 'Outcome: awaiting device confirmation'
};

/** Friendly Europe/London day+time for a hold revert (e.g. "Sat 07:00"). */
function friendlyHold(iso) {
    try {
        return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } catch {
        return iso;
    }
}

/**
 * Assembles the [TRG] transcript (F001) from data the producer already holds — no new capture.
 * Control outcomes get the full site→zone→read→dispatch→sync→hold trail from the control action;
 * non-control outcomes get the shorter site→detail trail. Every line carries an HH:MM timestamp.
 */
export function buildOutcomeTranscript({ action, type, siteNo, siteName, detail, holdText, outcomeTime }) {
    const steps = [];
    if (action) {
        const t0 = action.dispatchedAt || outcomeTime;
        steps.push({ time: hhmm(t0), text: `Site selected: ${action.siteName || siteName || 'unknown'} (${action.siteNo || siteNo})` });
        if (action.zone) steps.push({ time: hhmm(t0), text: `Zone: ${action.zone}` });
        if (action.previousValue != null) steps.push({ time: hhmm(t0), text: `Live read: ${action.attribute} = ${action.previousValue}` });
        steps.push({ time: hhmm(t0), text: `Dispatched value: ${action.attribute} → ${action.value}${action.previousValue != null ? ` (was ${action.previousValue})` : ''}` });
        steps.push({ time: hhmm(action.settledAt || t0), text: SYNC_STEP_TEXT[action.state] || `Outcome: ${action.state}` });
        // OOHDASH-123 §9: the raw gate/vendor LastError goes to the ticket (never to the operator's screen).
        if (action.state === 'non-delivery' && action.lastErrorRaw) {
            steps.push({ time: hhmm(action.settledAt || t0), text: `Vendor reason (raw): ${String(action.lastErrorRaw).slice(0, 300)}` });
        }
        if (action.hold?.revertAt) steps.push({ time: hhmm(action.settledAt || t0), text: `Hold: until ${friendlyHold(action.hold.revertAt)}` });
    } else {
        steps.push({ time: hhmm(outcomeTime), text: `Site selected: ${siteName || 'unknown'} (${siteNo})` });
        if (detail) steps.push({ time: hhmm(outcomeTime), text: detail });
        if (holdText) steps.push({ time: hhmm(outcomeTime), text: holdText });
    }
    // OOHDASH-153: neutral, true-at-build-time step. The transcript is built (and the [TRG] first
    // comment baked) before recordP1Raised runs. The real paging is handled by the IoT Support
    // Dashboard watching the ooh_p1 tag (Approach B). Does not perturb the Outcome: anchor.
    if (type === 'escalate-p1') steps.push({ time: hhmm(outcomeTime), text: 'P1 escalation raised — on-duty manager to be paged' });
    return steps;
}

router.post('/outcomes', wrap(async (req, res) => {
    const op = req.session.operator;
    const { type, siteNo, siteName, subject, detail, callerWords, OohCaptureClass, actionId, holdText, p1Summary, additionalNotes, appendToHoldId, holdIds, actions: actionLines, relatedToTicketId } = req.body;
    if (!type || !siteNo || !subject || !detail) {
        return res.status(400).json({ error: 'type, siteNo, subject and detail are required' });
    }

    // OOHDASH-144 §9.2: append to an existing hold's ticket rather than creating a new one.
    if (appendToHoldId) {
        const { collection } = await import('../services/store.js');
        const col = await collection('OohOverrides');
        const holdDoc = await col.get(appendToHoldId);

        // Authority check (OOHDASH-144 §9 handover-safe append):
        // Use hasSiteConfirmation rather than isConfirmed(token): the boost already consumed the
        // original token via consumeConfirmation, so isConfirmed would always return false.
        // hasSiteConfirmation checks that this operator has ANY active confirmation for siteNo
        // (their current call confirmed this site). This allows the original agent OR a handover
        // agent who re-confirmed the same site to append — matching the design panel ruling.
        // The check is non-consuming so it doesn't affect any subsequent operation.
        const canAppend = holdDoc &&
            holdDoc.ticketId &&
            String(holdDoc.siteNo) === String(siteNo) &&
            holdDoc.deviceType === 'boiler-panel' &&
            (Date.now() - new Date(holdDoc.createdAt).getTime()) < 12 * 60 * 60 * 1000 &&
            resolution.hasSiteConfirmation(siteNo, op.id);

        if (!canAppend) {
            return res.status(409).json({ error: 'append-refused', message: 'Cannot append to that hold: site not confirmed, hold not found, or older than 12 h' });
        }

        const summary = [
            subject && `Summary: ${subject}`,
            detail && `What we found: ${detail}`,
            ...(Array.isArray(actionLines) ? actionLines.map(l => `Action: ${l}`) : []),
            additionalNotes ? `Notes: ${additionalNotes}` : null
        ].filter(Boolean).join('\n');
        await zendesk.addIssueSummaryComment(holdDoc.ticketId, `[OOH ISSUE SUMMARY] Added by ${op.name}:\n${summary}`);
        await audit.logAction({ actionType: type, operator: op, siteNo, detail: subject, outcome: 'appended', ticketId: holdDoc.ticketId });
        return res.json({ ticket: { id: holdDoc.ticketId }, appended: true });
    }

    const isP1 = type === 'escalate-p1';

    // F001 — build the timestamped [TRG] transcript from the control action (if any) + context.
    const action = actionId ? control.getAction(actionId) : null;
    const outcomeTime = new Date().toISOString();
    const transcript = buildOutcomeTranscript({ action, type, siteNo, siteName, detail, holdText, outcomeTime });

    const ticket = await zendesk.createOutcomeTicket({
        operator: op, siteNo, siteName, subject,
        summary: subject,          // clean one-liner (≤180); detail/holdText live in the transcript
        transcript,
        callerWords,
        outcomeType: type,
        priority: isP1 ? 'urgent' : 'normal',
        extraTags: isP1 ? ['ooh_p1'] : [],
        // OOHDASH-119: additional notes ride alongside but are NOT written to the P1 SMS or audit log.
        additionalNotes: additionalNotes || null
    });

    // §9.2: if the client re-submitted after an append-refused, cite the earlier ticket in an
    // internal comment so the IoT helpdesk can link the two records.
    if (relatedToTicketId) {
        try {
            await zendesk.addIssueSummaryComment(ticket.id, `[OOH] Related: #${relatedToTicketId}`);
        } catch (err) {
            console.error(`[API] Failed to add Related comment to ticket #${ticket.id}: ${err.message}`);
            // Non-fatal: the new ticket is still created and logged.
        }
    }

    let p1 = null;
    if (isP1) {
        // OOHDASH-153 (Approach B): record a positive audit entry in OohSmsLog. The ticket with the
        // ooh_p1 tag already exists above — that tag is what triggers the IoT Support Dashboard to
        // page the on-duty manager. recordP1Raised is fail-safe and never blocks the outcome.
        p1 = await p1Log.recordP1Raised({ operator: op, siteNo, siteName, ticketId: ticket.id, summary: p1Summary || subject });
    }

    let auditId = action?.auditId || null;
    if (actionId) {
        // Control outcome: the dispatch already wrote the audit entry — link the ticket
        control.attachTicket(actionId, ticket.id);
        if (action?.auditId) await audit.attachTicket(action.auditId, ticket.id);
        if (action?.overrideId) await overrides.attachTicketToOverride(action.overrideId, ticket.id);
    } else {
        // Tonight/review-queue "What happened" column carries the concise subject —
        // the full detail lives on the ticket
        const auditEntry = await audit.logAction({
            actionType: type, operator: op, siteNo, siteName,
            detail: subject + (OohCaptureClass ? ` · class: ${OohCaptureClass}` : ''),
            outcome: { 'escalate-p1': 'p1', capture: 'captured', 'scope-only': 'scope', 'no-action': 'no-action' }[type] || type,
            ticketId: ticket.id,
            OohCaptureClass: OohCaptureClass || null
        });
        auditId = auditEntry?.id || null;
    }

    // F003 — call-ticket reconciliation is the LAST step and must never block or fail the outcome
    // (like SMS: it logs + alerts on failure and returns the OOH ticket regardless). It only ever
    // appends internal comments / merges the call ticket INTO the OOH ticket — the [TRG] first
    // comment is never mutated, so the oversight parse is preserved (freeze rule).
    let reconcileResult = null;
    try {
        reconcileResult = await reconciliation.reconcileCallTicket({
            oohTicketId: ticket.id,
            operator: op,
            siteNo,
            sessionStart: action?.dispatchedAt || outcomeTime,
            outcomeTime
        });
        // F003 provenance — record the matched call ticket on the audit entry.
        await audit.attachReconciledCallTicket(auditId, reconcileResult?.callTicketId ?? null, reconcileResult?.action ?? null);
    } catch (err) {
        console.error(`[API] Call-ticket reconciliation failed for OOH ticket #${ticket.id}: ${err.message}`);
        metrics.raiseAlert('reconciliation-failed', `Call-ticket reconciliation for OOH ticket #${ticket.id} failed — check for an un-merged call ticket`);
    }

    res.json({
        ticket,
        p1: p1 ? { raisedAt: p1.dispatchedAt, link: p1.OohP1EscalationLink } : null,
        reconciliation: reconcileResult
    });
}));

/* ---------------- callback lookup (F013) + tickets ---------------- */

router.get('/callback/:siteNo', wrap(async (req, res) => {
    try {
        res.json(await zendesk.callbackLookup(req.params.siteNo));
    } catch (err) {
        res.status(503).json({ error: 'Zendesk is unreachable — take the caller’s details and capture the issue', degraded: true });
    }
}));

router.post('/tickets/:id/followup', wrap(async (req, res) => {
    if (!req.body.date) return res.status(400).json({ error: 'date is required' });
    res.json(await zendesk.setFollowUpDate(req.params.id, req.body.date));
}));

router.get('/tickets/:id/thread', wrap(async (req, res) => {
    res.json({ thread: await zendesk.getFeedbackThread(req.params.id) });
}));

router.post('/tickets/:id/notes', wrap(async (req, res) => {
    // OOHDASH-119: kind='additional-notes' writes a labelled [OOH NOTE] comment from the post-submit
    // notes box. Without kind the existing drawer-notes behaviour is byte-for-byte unchanged.
    if (req.body.kind === 'additional-notes') {
        const ticketId = req.params.id;
        // Idempotency: deduplicate re-sends with the same token within 60 s.
        if (_notesIdempCheck(ticketId, req.body.idempotencyKey)) {
            return res.json({ ok: true, deduplicated: true });
        }
        const normalised = zendesk.normaliseAdditionalNotes(req.body.body);
        if (!normalised) return res.status(400).json({ error: 'Note is empty' });
        const labelledBody = `Additional notes from OOH agent: "${normalised}"`;
        try {
            await zendesk.addFeedbackNote(ticketId, req.session.operator, labelledBody);
            // Commit AFTER a successful write — on failure the token is never recorded
            // so the client's retry (same token) is allowed through and tries again.
            _notesIdempCommit(ticketId, req.body.idempotencyKey);
        } catch (err) {
            // Log ticket id + error message; never log note content.
            console.error(`[OOH] notes save failed for ticket #${ticketId}: ${err.message}`);
            throw err; // re-throw so wrap() returns 500 to the client
        }
        await audit.logAction({
            actionType: 'note', operator: req.session.operator,
            detail: `Note added to ticket #${ticketId}`, outcome: 'note', ticketId: Number(ticketId)
        });
        return res.json({ ok: true });
    }
    if (!req.body.body?.trim()) return res.status(400).json({ error: 'Note body is required' });
    await zendesk.addFeedbackNote(req.params.id, req.session.operator, req.body.body.trim());
    await audit.logAction({
        actionType: 'note', operator: req.session.operator,
        detail: `Note added to ticket #${req.params.id}`, outcome: 'note', ticketId: Number(req.params.id)
    });
    res.json({ ok: true });
}));

router.post('/query', wrap(async (req, res) => {
    if (!req.body.text?.trim()) return res.status(400).json({ error: 'Query text is required' });
    const ticket = await zendesk.raiseQuery(
        req.session.operator,
        req.body.siteNo,
        req.body.text.trim(),
        req.body.additionalNotes || null // OOHDASH-119
    );
    await audit.logAction({
        actionType: 'query', operator: req.session.operator, siteNo: req.body.siteNo || null,
        detail: `Query raised: ${req.body.text.trim()}`, outcome: 'query', ticketId: ticket.id
    });
    res.json({ ticket });
}));

/* ---------------- tonight (shift view) ---------------- */

router.get('/tonight', wrap(async (req, res) => {
    res.json({ entries: await audit.entriesTonight(), periodStart: audit.oohPeriodStart().toISOString() });
}));

/* ---------------- fixture-only test support (F003 reconciliation) ---------------- */
// These routes exist ONLY in fixture mode (dev/tests) — they let the test suite seed synthetic
// Zendesk Talk call tickets. In live mode (production) they are never registered, so there is no
// path to inject fake call tickets against real Zendesk.
if (config.dataMode !== 'live') {
    router.post('/test/call-tickets', wrap(async (req, res) => {
        res.json({ ticket: zendesk.seedFixtureCallTicket(req.body || {}) });
    }));
    router.post('/test/call-tickets/reset', wrap(async (req, res) => {
        zendesk.resetFixtureCallTickets();
        res.json({ ok: true });
    }));
    router.get('/test/call-tickets/:id', wrap(async (req, res) => {
        res.json({ ticket: zendesk.getFixtureCallTicket(req.params.id) });
    }));
    router.post('/test/tickets', wrap(async (req, res) => {
        res.json({ ticket: zendesk.seedFixtureTicket(req.body || {}) });
    }));
    router.post('/test/tickets/reset', wrap(async (req, res) => {
        zendesk.resetSeededFixtureTickets();
        res.json({ ok: true });
    }));

    // NOTE: the test-only /api/test/sites/:siteNo/holds/cancel-all endpoint is registered
    // in server.js BEFORE requireAuth so that the unauthenticated Playwright request
    // fixture can reach it. It is NOT registered here (auth guard would block it).
}

/* ---------------- admin (IoT role only) ---------------- */

const admin = Router();
admin.use(requireRole('iot'));

admin.get('/killswitch', wrap(async (req, res) => res.json(await killswitch.killSwitchState())));

admin.post('/killswitch/global', wrap(async (req, res) => {
    await killswitch.setGlobal(!!req.body.enabled, req.body.reason, req.session.operator.name);
    await audit.logAction({
        actionType: 'admin-killswitch', operator: req.session.operator,
        detail: `Global writes ${req.body.enabled ? 'DISABLED' : 're-enabled'}${req.body.reason ? ` — ${req.body.reason}` : ''}`,
        outcome: 'admin'
    });
    res.json(await killswitch.killSwitchState());
}));

admin.post('/killswitch/site', wrap(async (req, res) => {
    const { siteNo, enabled, reason } = req.body;
    if (!siteNo) return res.status(400).json({ error: 'siteNo is required' });
    await killswitch.setSite(siteNo, !!enabled, reason, req.session.operator.name);
    await audit.logAction({
        actionType: 'admin-killswitch', operator: req.session.operator, siteNo,
        detail: `Site ${siteNo} writes ${enabled ? 'DISABLED' : 're-enabled'}${reason ? ` — ${reason}` : ''}`,
        outcome: 'admin'
    });
    res.json(await killswitch.killSwitchState());
}));

admin.get('/overrides', wrap(async (req, res) => res.json({ overrides: await overrides.activeOverrides() })));

admin.post('/overrides/:id/cancel', wrap(async (req, res) => {
    const doc = await overrides.cancelOverride(req.params.id, req.session.operator);
    res.json({ override: doc });
}));

admin.get('/registry', wrap(async (req, res) => res.json(registry.registrySnapshot())));

admin.get('/notices', wrap(async (req, res) => res.json({ notices: await notices.allNotices() })));
admin.post('/notices', wrap(async (req, res) => {
    await notices.addNotice(req.body, req.session.operator.name);
    res.json({ notices: await notices.allNotices() });
}));
admin.delete('/notices/:id', wrap(async (req, res) => {
    await notices.retireNotice(req.params.id);
    res.json({ notices: await notices.allNotices() });
}));

admin.get('/data-quality', wrap(async (req, res) => res.json({ flags: await notices.dataQualityFlags() })));

admin.get('/sms-log', wrap(async (req, res) => res.json({ log: await p1Log.p1Log() })));
admin.post('/sms-log/:id/ack', wrap(async (req, res) => {
    res.json({ entry: await p1Log.acknowledgeP1(req.params.id, req.session.operator.name) });
}));

admin.get('/metrics', wrap(async (req, res) => {
    res.json(await metrics.computeMetrics(Number(req.query.days) || 7));
}));

admin.get('/alerts', wrap(async (req, res) => res.json({ alerts: metrics.activeAlerts() })));
admin.post('/alerts/:id/clear', wrap(async (req, res) => { metrics.clearAlert(req.params.id); res.json({ ok: true }); }));

/* F010 — producer-liveness self-check. GET returns the live assessment of the last OOH period;
 * POST /simulate lets ops (and the test suite) validate the alert wiring with explicit numbers. */
admin.post('/killswitch/tuya-read', wrap(async (req, res) => {
    await killswitch.setTuyaReadOff(!!req.body.enabled, req.session.operator.name);
    res.json(await killswitch.killSwitchState());
}));

admin.get('/liveness', wrap(async (req, res) => {
    res.json(await liveness.evaluateOvernightActivity(new Date(), { healthy: liveness.producerHealthy() }));
}));
admin.post('/liveness/simulate', wrap(async (req, res) => {
    const { current, baseline, healthy = true } = req.body || {};
    if (current === undefined || baseline === undefined) {
        return res.status(400).json({ error: 'current and baseline are required' });
    }
    const assessment = liveness.assessActivity({ current: Number(current), baseline: Number(baseline), healthy: !!healthy });
    if (assessment.suspect) {
        metrics.raiseAlert('no-overnight-activity',
            `No OOH tickets were created in the last overnight period, but the typical volume is ~${Number(baseline)}. The producer may be silently down — verify it is running.`);
    }
    res.json({ current: Number(current), baseline: Number(baseline), healthy: !!healthy, ...assessment });
}));

router.use('/admin', admin);

export default router;
