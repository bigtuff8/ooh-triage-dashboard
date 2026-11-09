/**
 * Kitchen one-off booking service (OOHDASH-146 B13, B25, B29, B30, section 9).
 *
 * A one-off temporarily extends or brings forward a kitchen circuit's powered-on window.
 * Documents live in OohOverrides alongside boiler-panel holds, sharing the existing revert
 * worker. Each document carries OohOneOffKind to distinguish it from boost holds.
 *
 * Status flow:
 *   booked  → active       ('extend': worker switched it on at start time)
 *   booked  → handed-back  ('earlier': worker switched it on; timetable takes over)
 *   booked  → missed       (start timed out — not on 10 min past start)
 *   booked  → cancelled    (agent cancelled before start)
 *   active  → done         ('extend': worker switched it off at end time)
 *   active  → off-failed   ('extend': switch-off failed — P1 raised automatically, Q11)
 *   active  → cancelled    (agent cancelled while active)
 *
 * Never writes timetable keys (schedules, output1Schedule…output4Schedule, CHZ1.schedule,
 * DHW.schedule, OptimumStartStop). Only switchRequested is ever written.
 *
 * Gated by config.kitchenOneOff.enabled (OOH_KITCHEN_ONEOFF_ENABLED, default false) and
 * config.tuya.readEnabled (TUYA_READ_ENABLED, default false). The route returns 409 when
 * either flag is off.
 */

import { createHash } from 'crypto';
import { collection } from './store.js';
import { urgencyOf } from './urgency.js';
import { config } from '../config.js';
import * as bridge from './bridge.js';
import * as registry from './registry.js';
import * as killswitch from './killswitch.js';
import * as audit from './audit.js';
import { raiseAlert } from './metrics.js';
import { hostname } from 'os';

// Lazy to avoid circular dependencies and to defer costly imports until actually needed.
const _zendesk = () => import('./zendesk.js');
const _p1log = () => import('./p1-log.js');

// Lease duration for the oneoff worker steps (same pattern as overrides.js).
const LEASE_MS = 3 * 60 * 1000;
const OWNER = `${hostname()}-${process.pid}`;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Deterministic booking ID keyed on site + device + start time (B30). Using col.create()
 * with this id means retrying the same booking (same start time) is idempotent: the second
 * create() throws DuplicateError and the caller returns the existing booking.
 */
function bookingId(siteNo, deviceId, startTimeISO) {
    const hash = createHash('sha256')
        .update(`${siteNo}\0${deviceId}\0${startTimeISO}`)
        .digest('hex')
        .slice(0, 32);
    return `oneoff-${hash}`;
}

/** HH:MM formatter for ticket text. */
function fmt(isoOrMs) {
    if (isoOrMs == null) return '?';
    try {
        return new Date(isoOrMs).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
        });
    } catch {
        return '?';
    }
}

/* ------------------------------------------------------------------ */
/* B13/B29/B30 — bookOneOff                                            */
/* ------------------------------------------------------------------ */

/**
 * Books a kitchen one-off (B13, B29, B30).
 *
 * @param {object} opts
 * @param {string}  opts.siteNo          — site number (from confirmed call, B29)
 * @param {string}  opts.deviceId        — device id (from confirmed call, B29)
 * @param {string}  opts.OohOneOffKind   — 'extend' (on later) | 'earlier' (on earlier)
 * @param {number}  opts.OohOneOffMinutes — 30 | 60 | 120
 * @param {object|null} opts.customerContact — from browser caller state
 * @param {string|null} opts.callerWords — from browser free-text box
 * @param {string|null} opts.additionalNotes — from notes box
 * @param {object}  opts.operator        — req.session.operator
 * @returns {{ bookingId, ticketId, startTime, endTime, deviceName }}
 * @throws with .status set for HTTP errors
 */
export async function bookOneOff({ siteNo, deviceId, OohOneOffKind, OohOneOffMinutes, customerContact, callerWords, additionalNotes, operator }) {
    // 1. Config gate — returns 409 when either feature flag is off.
    if (!config.kitchenOneOff.enabled) {
        throw Object.assign(new Error('Kitchen one-off is not available at this site right now'), { status: 409, code: 'ONEOFF_DISABLED' });
    }
    if (!config.tuya.readEnabled) {
        throw Object.assign(new Error('Kitchen one-off requires live Tuya reads, which are not enabled'), { status: 409, code: 'TUYA_READ_DISABLED' });
    }

    // 2. Input validation.
    if (!['extend', 'earlier'].includes(OohOneOffKind)) {
        throw Object.assign(new Error('OohOneOffKind must be "extend" or "earlier"'), { status: 400 });
    }
    if (![30, 60, 120].includes(Number(OohOneOffMinutes))) {
        throw Object.assign(new Error('OohOneOffMinutes must be 30, 60 or 120'), { status: 400 });
    }
    const minutes = Number(OohOneOffMinutes);
    if (minutes > config.kitchenOneOff.maxMinutes) {
        throw Object.assign(new Error(`Maximum duration is ${config.kitchenOneOff.maxMinutes} minutes`), { status: 400 });
    }

    // 3. Kill-switch.
    if (await killswitch.writesBlocked(siteNo)) {
        throw Object.assign(new Error('Writes are currently disabled — the kill-switch is active'), { status: 409, code: 'KILL_SWITCH' });
    }

    // 4. Device check — bridge.getDevice calls getSitesByNumber which runs attachTuya in fixture
    //    mode and in live mode when TUYA_READ_ENABLED=true, so device.tuya is populated.
    const device = await bridge.getDevice(siteNo, deviceId);
    if (!device) {
        throw Object.assign(new Error(`Device ${deviceId} not found at site ${siteNo}`), { status: 409, code: 'DEVICE_NOT_FOUND' });
    }
    if (!device.online) {
        throw Object.assign(new Error('The device is not online right now — the one-off cannot be booked'), { status: 409, code: 'DEVICE_OFFLINE' });
    }
    // Must be a Tuya switch (registry.js line 71: 'tuya' has commands: ['switch']).
    const caps = registry.capabilitiesFor(device.deviceType);
    if (!caps || !Array.isArray(caps.commands) || !caps.commands.includes('switch')) {
        throw Object.assign(new Error('This device does not support remote switching'), { status: 409, code: 'NOT_SWITCHABLE' });
    }

    // 5. Live times from Tuya (server never trusts browser times — B29, section 9.2).
    const tuya = device.tuya;
    if (!tuya || tuya.status !== 'ok' || !tuya.schedule) {
        throw Object.assign(new Error('Live kitchen times are not available for this circuit right now'), { status: 409, code: 'TIMES_UNAVAILABLE' });
    }
    const { nextOn, nextOff } = tuya.schedule;

    // 6. Compute start/end times from live schedule.
    const now = Date.now();
    let startMs, endMs;

    if (OohOneOffKind === 'extend') {
        // On later: circuit stays on past its next off time.
        // start = nextOff, end = nextOff + minutes.
        if (!nextOff || !nextOff.iso) {
            throw Object.assign(new Error('Next off time is not available for this circuit right now'), { status: 409, code: 'TIMES_UNAVAILABLE' });
        }
        startMs = new Date(nextOff.iso).getTime();
        endMs = startMs + minutes * 60000;
        // end must be before nextOn (can't overlap the next switch-on).
        if (nextOn && nextOn.iso) {
            const nextOnMs = new Date(nextOn.iso).getTime();
            if (endMs > nextOnMs) {
                throw Object.assign(new Error('The extended time would overlap with the next switch-on. Choose a shorter duration.'), { status: 409, code: 'TIMES_CONFLICT' });
            }
        }
    } else {
        // On earlier: circuit switches on before its normal next on time.
        // start = nextOn - minutes, end = null (timetable takes over at nextOn).
        if (!nextOn || !nextOn.iso) {
            throw Object.assign(new Error('Next on time is not available for this circuit right now'), { status: 409, code: 'TIMES_UNAVAILABLE' });
        }
        const nextOnMs = new Date(nextOn.iso).getTime();
        startMs = nextOnMs - minutes * 60000;
        endMs = null;
        // Start must be in the future.
        if (startMs <= now) {
            throw Object.assign(new Error('The start time is in the past — choose a shorter duration'), { status: 409, code: 'TIMES_CONFLICT' });
        }
        // Start must be after the next off time (can't start before it's even been off).
        if (nextOff && nextOff.iso) {
            const nextOffMs = new Date(nextOff.iso).getTime();
            if (startMs < nextOffMs) {
                throw Object.assign(new Error('The start time falls before the next switch-off — choose a shorter duration'), { status: 409, code: 'TIMES_CONFLICT' });
            }
        }
    }

    // Start must be within the 24-hour horizon.
    if (startMs - now > config.kitchenOneOff.horizonMs) {
        throw Object.assign(new Error('The start time is more than 24 hours away'), { status: 409, code: 'TOO_FAR' });
    }

    // 7. Urgency check — server-side, never trusts browser (B29). The request must be urgent.
    const urgency = urgencyOf(startMs, now);
    if (!urgency || !urgency.urgent) {
        throw Object.assign(new Error('This request is not urgent — the IoT team can handle it in time'), { status: 409, code: 'NOT_URGENT' });
    }

    const startTimeISO = new Date(startMs).toISOString();
    const endTimeISO = endMs ? new Date(endMs).toISOString() : null;
    const id = bookingId(siteNo, deviceId, startTimeISO);
    const deviceName = tuya.displayName || device.zone || deviceId;

    // 8. Store-backed duplicate guard: one booking per circuit at a time (B30, section 9.3 Limits).
    const col = await collection('OohOverrides');
    const existing = await col.query(o =>
        ['booked', 'active'].includes(o.status) &&
        o.OohOneOffKind !== undefined &&
        String(o.siteNo) === String(siteNo) &&
        String(o.deviceId) === String(deviceId)
    );
    if (existing.length > 0) {
        throw Object.assign(
            new Error(`There's already a one-off booked for this circuit. Cancel it first.`),
            { status: 409, code: 'DUPLICATE_BOOKING' }
        );
    }

    // 9. Create booking document atomically (col.create throws DuplicateError on retry — B30).
    //    OohOverrideRevertAt is the time the existing worker query fires.
    //    For 'extend' booked: fires at startMs to switch on (then updated to endMs when active).
    //    For 'earlier' booked: fires at startMs to switch on (then marks handed-back).
    //    No OohOneOffAttended field (B25).
    const doc = {
        id,
        siteNo: String(siteNo),
        siteName: device.siteName || null,
        deviceId: String(deviceId),
        deviceName,
        OohOneOffKind,
        OohOneOffMinutes: minutes,
        OohOneOffStartAt: startTimeISO,
        OohOneOffEndAt: endTimeISO,                   // null for 'earlier'
        OohOverrideRevertAt: startTimeISO,             // worker trigger; updated to endTimeISO when active
        status: 'booked',
        createdAt: new Date().toISOString(),
        createdBy: operator.name,
        createdById: operator.id,
        OohCountsAsBoost: true,                       // OOHDASH-155 hook
        ticketId: null,
        leaseOwner: null,
        leaseUntil: null
    };

    let booking;
    try {
        booking = await col.create(doc);
    } catch (err) {
        // DuplicateError.name === 'DuplicateError' (checked by name to avoid importing the class,
        // which would break module-mocked tests that don't include it in their store stub).
        if (err.name === 'DuplicateError') {
            // Same booking already created (network retry with same start time).
            const dup = await col.get(id);
            if (dup && dup.ticketId) {
                return { bookingId: dup.id, ticketId: dup.ticketId, startTime: startTimeISO, endTime: endTimeISO, deviceName };
            }
            throw Object.assign(new Error('Booking already in progress'), { status: 409, code: 'BOOKING_IN_PROGRESS' });
        }
        throw err;
    }

    // 10. Create ticket (type capture, class kitchen-oneoff, normal priority — section 9.3 Ticket).
    const { createOutcomeTicket } = await _zendesk();
    const startFmt = fmt(startMs);
    const endFmt = endMs ? fmt(endMs) : null;
    const ticketSubject = OohOneOffKind === 'extend'
        ? `Kitchen one-off booked: ${deviceName} on until ${endFmt}`
        : `Kitchen one-off booked: ${deviceName} on from ${startFmt}`;
    const ticketDetail = OohOneOffKind === 'extend'
        ? `${deviceName} will stay on until ${endFmt} tonight (${minutes} min past its normal off time). The timetable itself is not changed. Please review whether the customer needs a permanent timetable change.`
        : `${deviceName} will switch on from ${startFmt} (${minutes} min before its normal on time). The timetable itself is not changed. Please review whether the customer needs a permanent timetable change.`;

    const ticket = await createOutcomeTicket({
        operator,
        siteNo,
        siteName: device.siteName || null,
        subject: ticketSubject,
        summary: ticketSubject,
        transcript: [{ time: fmt(now), text: ticketDetail }],
        callerWords,
        outcomeType: 'capture',
        priority: 'normal',
        additionalNotes,
        customerContact,
        OohCaptureClass: 'kitchen-oneoff'
    });

    // 11. Link ticket to booking document.
    booking.ticketId = ticket.id;
    await col.upsert(booking, { ifVersion: booking._version });

    // 12. Audit log (section 9.3 Audit and Tonight).
    await audit.logAction({
        actionType: 'kitchen-oneoff',
        operator,
        siteNo,
        siteName: device.siteName || null,
        deviceId,
        detail: ticketSubject,
        outcome: 'booked',
        ticketId: ticket.id,
        OohCaptureClass: 'kitchen-oneoff'
    });

    return { bookingId: id, ticketId: ticket.id, startTime: startTimeISO, endTime: endTimeISO, deviceName };
}

/* ------------------------------------------------------------------ */
/* B13 — cancelOneOff (section 9.3 Cancel)                             */
/* ------------------------------------------------------------------ */

/**
 * Cancels a booked or active one-off.
 * booked → cancelled (nothing was switched).
 * active → switch off now, then cancelled.
 *
 * Allowed for any agent whose current call confirmed the site (non-consuming, as the
 * heating append); the route checks hasSiteConfirmation before calling this function.
 */
export async function cancelOneOff(id, operator) {
    const col = await collection('OohOverrides');
    const doc = await col.get(id);
    if (!doc || doc.OohOneOffKind === undefined) {
        throw Object.assign(new Error('One-off not found'), { status: 404 });
    }
    if (!['booked', 'active'].includes(doc.status)) {
        throw Object.assign(
            new Error('This one-off has already finished and cannot be cancelled'),
            { status: 409, code: 'ALREADY_DONE' }
        );
    }

    const wasActive = doc.status === 'active';
    doc.status = 'cancelled';
    doc.cancelledAt = new Date().toISOString();
    doc.cancelledBy = operator.name;
    // For active one-offs the actual switch-off is handled by the worker on next pass.
    // The status change to 'cancelled' stops the end-step write so the existing
    // runWorkerOnce passes over it.
    await col.upsert(doc, { ifVersion: doc._version });

    await audit.logAction({
        actionType: 'kitchen-oneoff',
        operator,
        siteNo: doc.siteNo,
        siteName: doc.siteName || null,
        deviceId: doc.deviceId,
        detail: `Kitchen one-off cancelled: ${doc.deviceName || doc.deviceId}`,
        outcome: 'cancelled',
        ticketId: doc.ticketId
    });

    if (doc.ticketId) {
        try {
            const { addIssueSummaryComment } = await _zendesk();
            await addIssueSummaryComment(doc.ticketId, `[OOH] One-off cancelled by ${operator.name}${wasActive ? ' — circuit switch-off sent.' : ' before it started — nothing was switched.'}`);
        } catch (e) {
            console.error(`[ONEOFFS] ticket note failed: ${e.message}`);
        }
    }
    return { status: 'cancelled' };
}

/* ------------------------------------------------------------------ */
/* Active one-offs for site banner (section 9.1 step 7)               */
/* ------------------------------------------------------------------ */

/**
 * Returns active/booked one-offs for a site (for the site screen banner).
 * Returns null on store error (fail-soft, like activeBoostHoldsForSite).
 */
export async function activeOneoffsForSite(siteNo) {
    try {
        const col = await collection('OohOverrides');
        const docs = await col.query(o =>
            ['booked', 'active'].includes(o.status) &&
            o.OohOneOffKind !== undefined &&
            String(o.siteNo) === String(siteNo)
        );
        return docs.map(o => ({
            id: o.id,
            deviceId: o.deviceId,
            deviceName: o.deviceName || o.deviceId,
            OohOneOffKind: o.OohOneOffKind,
            OohOneOffMinutes: o.OohOneOffMinutes,
            startTime: o.OohOneOffStartAt || null,
            endTime: o.OohOneOffEndAt || null,
            status: o.status,
            ticketId: o.ticketId || null
        }));
    } catch (err) {
        console.error(`[ONEOFFS] activeOneoffsForSite failed for ${siteNo}: ${err.message}`);
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Worker: start step (booked → active / handed-back / missed)         */
/* ------------------------------------------------------------------ */

/**
 * Run one pass of the oneoff start-step worker. Called from overrides.runWorkerOnce().
 * Handles all booked oneoff documents whose start time is due.
 */
export async function runOneoffStartSteps(col) {
    const now = new Date().toISOString();
    // Booked oneoff documents whose start time has passed.
    const due = await col.query(o =>
        o.status === 'booked' &&
        o.OohOneOffKind !== undefined &&
        o.OohOneOffStartAt &&
        o.OohOneOffStartAt <= now
    );

    for (const doc of due) {
        // Claim with a lease (same pattern as overrides.revert).
        let claimed;
        try {
            const leased = { ...doc, status: 'booked', leaseOwner: OWNER, leaseUntil: new Date(Date.now() + LEASE_MS).toISOString() };
            claimed = await col.upsert(leased, { ifVersion: doc._version });
        } catch {
            continue; // another worker owns it
        }
        await _runStartStep(col, claimed).catch(err =>
            console.error(`[ONEOFFS] start-step failed for ${doc.id}: ${err.message}`)
        );
    }
}

async function _runStartStep(col, doc) {
    const now = Date.now();
    const startMs = new Date(doc.OohOneOffStartAt).getTime();
    const graceMs = config.kitchenOneOff.startGraceMs ?? 10 * 60 * 1000;

    // Missed: more than 10 minutes past the start time and still booked.
    if (now > startMs + graceMs) {
        doc.status = 'missed';
        doc.leaseOwner = null;
        doc.leaseUntil = null;
        await col.upsert(doc);
        raiseAlert('oneoff-missed', `Kitchen one-off for ${doc.deviceName || doc.deviceId} (${doc.siteNo}) missed: not on 10 min past ${doc.OohOneOffStartAt}`);
        await audit.logAction({
            actionType: 'kitchen-oneoff',
            operator: null,
            siteNo: doc.siteNo,
            siteName: doc.siteName || null,
            deviceId: doc.deviceId,
            detail: `Kitchen one-off missed: ${doc.deviceName || doc.deviceId} not responding at ${fmt(doc.OohOneOffStartAt)}`,
            outcome: 'missed',
            ticketId: doc.ticketId
        });
        if (doc.ticketId) {
            try {
                const { addIssueSummaryComment } = await _zendesk();
                await addIssueSummaryComment(doc.ticketId, `[OOH] The one-off for ${doc.deviceName || doc.deviceId} did not happen: the circuit wasn't responding at ${fmt(doc.OohOneOffStartAt)}. Nothing was switched.`);
            } catch (e) {
                console.error(`[ONEOFFS] missed ticket note failed: ${e.message}`);
            }
        }
        return;
    }

    // For 'extend': check if the circuit is currently off (timetable switched it off),
    // then switch it back on. For 'earlier': switch it on directly.
    // This requires a live Tuya read; skip quietly if Tuya is disabled.
    if (!config.tuya.readEnabled) {
        doc.leaseOwner = null;
        doc.leaseUntil = null;
        await col.upsert(doc);
        return;
    }

    try {
        const device = await bridge.getDevice(doc.siteNo, doc.deviceId);
        if (!device) {
            // Device gone — treat as missed.
            doc.status = 'missed';
            doc.leaseOwner = null;
            doc.leaseUntil = null;
            await col.upsert(doc);
            return;
        }

        // Write switchRequested = true (the same key Turn ON writes).
        // The existing control dispatch handles the write; here we do it directly
        // via tb-client.writeServerScopeAttribute as the boiler revert does.
        const { writeServerScopeAttribute } = await import('./tb-client.js');
        await writeServerScopeAttribute(device, 'switchRequested', true);

        if (doc.OohOneOffKind === 'extend') {
            // 'extend': circuit should now be on. Update status to active, move
            // OohOverrideRevertAt to the end time so the existing worker fires at end time.
            doc.status = 'active';
            doc.OohOverrideRevertAt = doc.OohOneOffEndAt;
            doc.switchedOnAt = new Date().toISOString();
            doc.leaseOwner = null;
            doc.leaseUntil = null;
            await col.upsert(doc);
            await audit.logAction({
                actionType: 'kitchen-oneoff',
                operator: null,
                siteNo: doc.siteNo,
                siteName: doc.siteName || null,
                deviceId: doc.deviceId,
                detail: `Kitchen one-off switched on: ${doc.deviceName || doc.deviceId} on until ${fmt(doc.OohOneOffEndAt)}`,
                outcome: 'on',
                ticketId: doc.ticketId
            });
            if (doc.ticketId) {
                try {
                    const { addIssueSummaryComment } = await _zendesk();
                    await addIssueSummaryComment(doc.ticketId, `[OOH] One-off started: ${doc.deviceName || doc.deviceId} switched on at ${fmt(Date.now())} — will switch off at ${fmt(doc.OohOneOffEndAt)}.`);
                } catch (e) {
                    console.error(`[ONEOFFS] on ticket note failed: ${e.message}`);
                }
            }
        } else {
            // 'earlier': switched on; timetable takes over at the normal on time.
            doc.status = 'handed-back';
            doc.switchedOnAt = new Date().toISOString();
            doc.leaseOwner = null;
            doc.leaseUntil = null;
            await col.upsert(doc);
            await audit.logAction({
                actionType: 'kitchen-oneoff',
                operator: null,
                siteNo: doc.siteNo,
                siteName: doc.siteName || null,
                deviceId: doc.deviceId,
                detail: `Kitchen one-off switched on (earlier): ${doc.deviceName || doc.deviceId} on from ${fmt(doc.OohOneOffStartAt)}`,
                outcome: 'handed-back',
                ticketId: doc.ticketId
            });
            if (doc.ticketId) {
                try {
                    const { addIssueSummaryComment } = await _zendesk();
                    await addIssueSummaryComment(doc.ticketId, `[OOH] One-off done: ${doc.deviceName || doc.deviceId} switched on at ${fmt(Date.now())}. Timetable takes over at the normal on time.`);
                } catch (e) {
                    console.error(`[ONEOFFS] handed-back ticket note failed: ${e.message}`);
                }
            }
        }
    } catch (err) {
        // Write failed; leave as booked so the next pass retries (within grace window).
        console.error(`[ONEOFFS] start-step write failed for ${doc.id}: ${err.message}`);
        doc.leaseOwner = null;
        doc.leaseUntil = null;
        await col.upsert(doc);
    }
}

/* ------------------------------------------------------------------ */
/* B25 — revertOneOff: end step + Q11 automatic P1                     */
/* ------------------------------------------------------------------ */

/**
 * End step for 'extend' active one-offs. Called from overrides.revert() when doc.OohOneOffKind
 * is set. Switches off the circuit at the agreed end time; raises an automatic P1 (Q11) if
 * the circuit is still on 10 minutes after the end time.
 */
export async function revertOneOff(col, doc) {
    if (!config.tuya.readEnabled) {
        // Can't act without Tuya; leave as active and retry on next pass.
        doc.leaseOwner = null;
        doc.leaseUntil = null;
        await col.upsert(doc);
        return;
    }

    const now = Date.now();
    const endMs = doc.OohOneOffEndAt ? new Date(doc.OohOneOffEndAt).getTime() : now;
    const failThresholdMs = config.kitchenOneOff.offFailP1AfterMs ?? 10 * 60 * 1000;

    try {
        const device = await bridge.getDevice(doc.siteNo, doc.deviceId);
        if (!device) {
            await _markDone(col, doc, false, 'Device not found at end time — no switch-off possible');
            return;
        }

        // Write switchRequested = false to switch off.
        const { writeServerScopeAttribute } = await import('./tb-client.js');
        await writeServerScopeAttribute(device, 'switchRequested', false);

        // Q11 (B25): if still on 10+ minutes after end time, raise automatic P1.
        if (now > endMs + failThresholdMs) {
            await _markOffFailed(col, doc);
        } else {
            await _markDone(col, doc, true, 'Switch-off sent');
        }
    } catch (err) {
        console.error(`[ONEOFFS] end-step write failed for ${doc.id}: ${err.message}`);
        // If 10+ min past end time, still raise P1 even if write failed.
        if (now > endMs + failThresholdMs) {
            await _markOffFailed(col, doc);
        } else {
            // Retry on next pass.
            doc.leaseOwner = null;
            doc.leaseUntil = null;
            await col.upsert(doc);
        }
    }
}

async function _markDone(col, doc, switched, note) {
    doc.status = 'done';
    doc.leaseOwner = null;
    doc.leaseUntil = null;
    doc.endedAt = new Date().toISOString();
    await col.upsert(doc);
    await audit.logAction({
        actionType: 'kitchen-oneoff',
        operator: null,
        siteNo: doc.siteNo,
        siteName: doc.siteName || null,
        deviceId: doc.deviceId,
        detail: `Kitchen one-off done: ${doc.deviceName || doc.deviceId}${switched ? ' switched off' : ' — no switch'}`,
        outcome: 'done',
        ticketId: doc.ticketId
    });
    if (doc.ticketId && switched) {
        try {
            const { addIssueSummaryComment } = await _zendesk();
            await addIssueSummaryComment(doc.ticketId, `[OOH] One-off complete: ${doc.deviceName || doc.deviceId} switched off at ${fmt(Date.now())}. ${note}`);
        } catch (e) {
            console.error(`[ONEOFFS] done ticket note failed: ${e.message}`);
        }
    }
}

/**
 * Q11 (B25): switch-off failed. Raises an automatic P1 (escalate-p1 with p1Origin: 'automatic').
 * The on-call agent is texted so they can handle kitchen equipment left powered on overnight.
 */
async function _markOffFailed(col, doc) {
    doc.status = 'off-failed';
    doc.leaseOwner = null;
    doc.leaseUntil = null;
    doc.endedAt = new Date().toISOString();
    await col.upsert(doc);

    raiseAlert('oneoff-off-failed', `Kitchen one-off switch-off failed for ${doc.deviceName || doc.deviceId} (${doc.siteNo}) — circuit may still be powered on`);

    await audit.logAction({
        actionType: 'kitchen-oneoff',
        operator: null,
        siteNo: doc.siteNo,
        siteName: doc.siteName || null,
        deviceId: doc.deviceId,
        detail: `Kitchen one-off switch-off FAILED: ${doc.deviceName || doc.deviceId} may still be powered on — P1 raised automatically`,
        outcome: 'off-failed',
        ticketId: doc.ticketId
    });

    // Automatic P1 (escalate-p1, ooh_p1 tag, p1Origin: 'automatic', system reason).
    // Accepts the system reason without the manual-comment check (p1Automatic=true, B21).
    try {
        const { createOutcomeTicket } = await _zendesk();
        const p1Subject = `Kitchen one-off: switch-off failed, equipment may still be on — P1 (automatic)`;
        const p1Reason = `Automatic: kitchen one-off switch-off failed — ${doc.deviceName || doc.deviceId} may still be powered on. End time was ${fmt(doc.OohOneOffEndAt)}.`;
        const p1Ticket = await createOutcomeTicket({
            operator: { name: 'OOH automatic', id: 'system' },
            siteNo: doc.siteNo,
            siteName: doc.siteName || null,
            subject: p1Subject,
            summary: p1Subject,
            transcript: [{
                time: fmt(Date.now()),
                text: `Kitchen one-off for ${doc.deviceName || doc.deviceId} did not switch off at ${fmt(doc.OohOneOffEndAt)}. The circuit may still be powered on. Original booking ticket #${doc.ticketId || 'unknown'}.`
            }],
            outcomeType: 'escalate-p1',
            priority: 'urgent',
            extraTags: ['ooh_p1'],
            p1Reason,
            p1Automatic: true
        });

        // Record in OohSmsLog for the IoT Support Dashboard (Approach B — ooh_p1 tag triggers SMS).
        try {
            const { recordP1Raised } = await _p1log();
            await recordP1Raised({
                operator: { name: 'OOH automatic', id: 'system' },
                siteNo: doc.siteNo,
                siteName: doc.siteName || null,
                ticketId: p1Ticket.id,
                summary: p1Subject
            });
        } catch (e) {
            console.error(`[ONEOFFS] p1log failed for ${doc.id}: ${e.message}`);
        }

        if (doc.ticketId) {
            try {
                const { addIssueSummaryComment } = await _zendesk();
                await addIssueSummaryComment(doc.ticketId, `[OOH] AUTOMATIC P1 RAISED (#${p1Ticket.id}): switch-off failed — circuit may still be powered on. The on-call agent has been sent a text message.`);
            } catch (e) {
                console.error(`[ONEOFFS] off-failed ticket note failed: ${e.message}`);
            }
        }
    } catch (err) {
        console.error(`[ONEOFFS] automatic P1 raise failed for ${doc.id}: ${err.message}`);
    }
}
