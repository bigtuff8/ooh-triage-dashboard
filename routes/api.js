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
import * as escalation from '../services/escalation.js';
import * as reconciliation from '../services/reconciliation.js';
import * as audit from '../services/audit.js';
import * as metrics from '../services/metrics.js';
import * as liveness from '../services/liveness.js';
import * as notices from '../services/notices.js';

const router = Router();

const wrap = fn => (req, res) => fn(req, res).catch(err => {
    const status = err.status || 500;
    if (status >= 500) console.error(`[API] ${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
    res.status(status).json({ error: err.message, ...(err.resolution ? { resolution: err.resolution } : {}), ...(err.guardrail ? { guardrail: true } : {}) });
});

/* ---------------- session / app context ---------------- */

router.get('/me', wrap(async (req, res) => {
    const op = req.session.operator;
    res.json({
        operator: { name: op.name, role: op.role, roleLabel: op.roleLabel, email: op.email },
        killSwitch: await killswitch.killSwitchState(),
        notices: await notices.activeNotices(),
        degraded: !bridge.bridgeStatus().healthy,
        version: config.appVersion,
        dataMode: config.dataMode
    });
}));

/* ---------------- site search / resolution (F004) ---------------- */

router.get('/sites/search', wrap(async (req, res) => {
    let results;
    try {
        results = await bridge.searchSites(req.query.q);
    } catch {
        return res.status(503).json({ error: 'Device inventory unavailable — degraded mode', degraded: true });
    }
    // Duplicate house IDs are surfaced, not hidden — the resolution gate rejects them
    const counts = {};
    results.forEach(r => { counts[r.siteNo] = (counts[r.siteNo] || 0) + 1; });
    res.json({
        results: results.map(r => ({
            siteNo: r.siteNo, siteName: r.siteName, brand: r.brand, duplicate: counts[r.siteNo] > 1
        }))
    });
}));

router.get('/sites/:siteNo/resolve', wrap(async (req, res) => {
    const result = await resolution.resolveSite(req.params.siteNo, req.session.operator);
    if (result.status === 'resolved') {
        const s = result.site;
        return res.json({
            status: 'resolved',
            site: { siteNo: s.siteNo, siteName: s.siteName, brand: s.brand, address: s.address, callsLast30Days: s.callsLast30Days, deviceSummary: deviceSummary(s) }
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

const SCOPE_GROUPS = [
    { key: 'heating', label: 'Heating', level: s => s.devices.some(d => d.kind === 'heating' && d.deviceType !== 'boiler-panel') ? 'ctl' : s.devices.some(d => d.kind === 'heating') ? 'mon' : 'none' },
    { key: 'hotwater', label: 'Hot water', level: s => s.devices.some(d => d.deviceType === 'salus-it500-dhw') ? 'ctl' : 'none' },
    { key: 'kitchen', label: 'Kitchen equipment', level: s => s.devices.some(d => d.kind === 'kitchen') ? 'mon' : 'none' },
    { key: 'lighting', label: 'External lighting', level: s => s.devices.some(d => d.kind === 'lighting') ? 'mon' : 'none' },
    { key: 'fan', label: 'Extractor fans', level: s => s.devices.some(d => d.kind === 'fan') ? 'mon' : 'none' },
    { key: 'electrics', label: 'Internal lighting / sockets', level: () => 'none' },
    { key: 'boiler', label: 'Boiler internals / PCB', level: () => 'none' }
];

async function workspacePayload(site) {
    let tickets = [];
    try { tickets = await zendesk.ticketsForSite(site.siteNo); }
    catch (err) { console.error(`[API] Site tickets unavailable: ${err.message}`); }
    return {
        site: { siteNo: site.siteNo, siteName: site.siteName, brand: site.brand, address: site.address, callsLast30Days: site.callsLast30Days },
        devices: site.devices.map(d => ({
            ...stripDemo(d),
            capabilities: registry.capabilitiesFor(d.deviceType)?.commands || [],
            setpointWindow: typeof d.telemetry?.heatingSetpoint === 'number' ? registry.setpointWindow(d.deviceType, d.telemetry.heatingSetpoint) : null
        })),
        scope: SCOPE_GROUPS.map(g => ({ key: g.key, label: g.label, level: g.level(site) })),
        anyOffline: site.devices.some(d => !d.online),
        tickets,
        degraded: !bridge.bridgeStatus().healthy
    };
}

function stripDemo(device) {
    const { _demo, ...rest } = device;
    return rest;
}

/* ---------------- control (F002/F005/F006/F007/F008/F009) ---------------- */

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
const SYNC_STEP_TEXT = {
    synced: 'Sync: device confirmed (synced)',
    'late-synced': 'Sync: late confirmation (late-synced)',
    timeout: 'Sync: timed out — not confirmed',
    failed: 'Sync: write failed',
    rejected: 'Sync: rejected by device',
    pending: 'Sync: awaiting device confirmation'
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
function buildOutcomeTranscript({ action, type, siteNo, siteName, detail, holdText, outcomeTime }) {
    const steps = [];
    if (action) {
        const t0 = action.dispatchedAt || outcomeTime;
        steps.push({ time: hhmm(t0), text: `Site selected: ${action.siteName || siteName || 'unknown'} (${action.siteNo || siteNo})` });
        if (action.zone) steps.push({ time: hhmm(t0), text: `Zone: ${action.zone}` });
        if (action.previousValue != null) steps.push({ time: hhmm(t0), text: `Live read: ${action.attribute} = ${action.previousValue}` });
        steps.push({ time: hhmm(t0), text: `Dispatched value: ${action.attribute} → ${action.value}${action.previousValue != null ? ` (was ${action.previousValue})` : ''}` });
        steps.push({ time: hhmm(action.settledAt || t0), text: SYNC_STEP_TEXT[action.state] || `Sync: ${action.state}` });
        if (action.hold?.revertAt) steps.push({ time: hhmm(action.settledAt || t0), text: `Hold: until ${friendlyHold(action.hold.revertAt)}` });
    } else {
        steps.push({ time: hhmm(outcomeTime), text: `Site selected: ${siteName || 'unknown'} (${siteNo})` });
        if (detail) steps.push({ time: hhmm(outcomeTime), text: detail });
        if (holdText) steps.push({ time: hhmm(outcomeTime), text: holdText });
    }
    if (type === 'escalate-p1') steps.push({ time: hhmm(outcomeTime), text: 'P1 escalation → SMS dispatched to on-duty manager' });
    return steps;
}

router.post('/outcomes', wrap(async (req, res) => {
    const op = req.session.operator;
    const { type, siteNo, siteName, subject, detail, callerWords, OohCaptureClass, actionId, holdText, p1Summary } = req.body;
    if (!type || !siteNo || !subject || !detail) {
        return res.status(400).json({ error: 'type, siteNo, subject and detail are required' });
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
        extraTags: isP1 ? ['ooh_p1'] : []
    });

    let p1 = null;
    if (isP1) {
        p1 = await escalation.escalateP1({ operator: op, siteNo, siteName, ticketId: ticket.id, summary: p1Summary || subject });
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
        p1: p1 ? { dispatchedAt: p1.dispatchedAt, sentTo: p1.sentTo, link: p1.OohP1EscalationLink, dispatchOk: p1.dispatchOk } : null,
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
    const ticket = await zendesk.raiseQuery(req.session.operator, req.body.siteNo, req.body.text.trim());
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

admin.get('/sms-log', wrap(async (req, res) => res.json({ log: await escalation.smsLog() })));
admin.post('/sms-log/:id/ack', wrap(async (req, res) => {
    res.json({ entry: await escalation.acknowledgeP1(req.params.id, req.session.operator.name) });
}));

admin.get('/metrics', wrap(async (req, res) => {
    res.json(await metrics.computeMetrics(Number(req.query.days) || 7));
}));

admin.get('/alerts', wrap(async (req, res) => res.json({ alerts: metrics.activeAlerts() })));
admin.post('/alerts/:id/clear', wrap(async (req, res) => { metrics.clearAlert(req.params.id); res.json({ ok: true }); }));

/* F010 — producer-liveness self-check. GET returns the live assessment of the last OOH period;
 * POST /simulate lets ops (and the test suite) validate the alert wiring with explicit numbers. */
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
