/**
 * Service metrics (F022) + alert conditions (F021).
 *
 * Metrics are derived from the durable audit log so they survive restarts:
 *  - self-serve rate      = applied outcomes ÷ all call outcomes
 *  - control success rate = synced ÷ dispatched control actions
 *  - P1 SLA               = SMS dispatch → acknowledgement times
 *  - capture volume       = captured outcomes by class (feeds the F025 Spencer ask)
 *
 * Alerts are in-process conditions surfaced via /healthz detail and /api/alerts,
 * and rendered at the top of the F026 review queue:
 *  - write failed/rejected streak (≥3 within 30 minutes)
 *  - revert failure / revert blocked (raised by overrides.js)
 *  - SMS dispatch failure (raised by escalation.js)
 *  - DriftDetected overnight (recorded when reads surface it)
 */

import { randomUUID } from 'crypto';
import * as audit from './audit.js';

const CONTROL_OUTCOME_TYPES = ['setpoint-up', 'setpoint-down', 'setpoint-change', 'heating-off-frost', 'heating-off-mode', 'hw-boost'];
const CALL_OUTCOME_TYPES = [...CONTROL_OUTCOME_TYPES, 'capture', 'escalate-p1', 'scope-only', 'no-action'];

// Rolling in-process state for streak detection + active alerts
const recentFailures = [];
const alerts = new Map(); // alertId → alert

/**
 * Records a control-loop event for streak detection (called by control/overrides).
 */
export function recordControlEvent(kind) {
    if (['failed', 'rejected', 'timeout'].includes(kind)) {
        const now = Date.now();
        recentFailures.push(now);
        while (recentFailures.length && recentFailures[0] < now - 30 * 60 * 1000) recentFailures.shift();
        if (recentFailures.length >= 3) {
            raiseAlert('write-failure-streak', `${recentFailures.length} failed/rejected/timed-out device writes in the last 30 minutes`);
        }
    }
}

/**
 * Raises (or refreshes) an alert. Same code+message within an hour dedupes.
 */
export function raiseAlert(code, message) {
    const key = `${code}:${message}`;
    const existing = [...alerts.values()].find(a => a.key === key && !a.clearedAt);
    if (existing) { existing.lastSeenAt = new Date().toISOString(); existing.count++; return existing.id; }
    const id = randomUUID();
    alerts.set(id, { id, key, code, message, raisedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), count: 1, clearedAt: null });
    console.warn(`[ALERT] ${code}: ${message}`);
    return id;
}

/**
 * Clears an alert (IoT admin acknowledgement).
 */
export function clearAlert(alertId) {
    const a = alerts.get(alertId);
    if (a) a.clearedAt = new Date().toISOString();
}

/**
 * Active (uncleared) alerts, newest first.
 */
export function activeAlerts() {
    return [...alerts.values()].filter(a => !a.clearedAt).sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
}

/**
 * Computes the F022 service metrics over a trailing window (default 7 days).
 */
export async function computeMetrics(windowDays = 7) {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const entries = await audit.entriesSince(since);

    const callOutcomes = entries.filter(e => CALL_OUTCOME_TYPES.includes(e.OohActionType));
    const controls = entries.filter(e => CONTROL_OUTCOME_TYPES.includes(e.OohActionType));
    const applied = controls.filter(e => e.outcome === 'synced');
    const failed = controls.filter(e => ['failed', 'rejected', 'timeout'].includes(e.outcome));
    const captures = entries.filter(e => e.OohActionType === 'capture');
    const p1s = entries.filter(e => e.OohActionType === 'escalate-p1');

    const captureByClass = {};
    for (const c of captures) {
        // c.captureClass covers audit entries written before the 1.0.2 field rename (dev stores only)
        const cls = c.OohCaptureClass || c.captureClass || c.zone || 'unclassified';
        captureByClass[cls] = (captureByClass[cls] || 0) + 1;
    }

    // P1 SLA: dispatch → acknowledgement (ack times recorded on the SMS log entries)
    const p1AckMinutes = p1s
        .filter(e => e.p1AckAt && e.OohActionAt)
        .map(e => (new Date(e.p1AckAt) - new Date(e.OohActionAt)) / 60000);

    return {
        windowDays,
        since,
        totals: {
            callOutcomes: callOutcomes.length,
            controlActions: controls.length,
            captured: captures.length,
            p1Escalations: p1s.length,
            scopeOnly: entries.filter(e => e.OohActionType === 'scope-only').length,
            noAction: entries.filter(e => e.OohActionType === 'no-action').length
        },
        selfServeRate: callOutcomes.length ? +(applied.length / callOutcomes.length).toFixed(3) : null,
        controlSuccessRate: controls.length ? +(applied.length / controls.length).toFixed(3) : null,
        controlFailures: failed.length,
        p1SlaMedianMinutes: p1AckMinutes.length ? +median(p1AckMinutes).toFixed(1) : null,
        captureVolumeByClass: captureByClass
    };
}

function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
