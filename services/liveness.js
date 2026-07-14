/**
 * Producer-liveness monitoring (F010 / R10).
 *
 * The frozen IoT Support dashboard renders an empty overnight window as green
 * "No OOH activity ✅" on total===0 (CT-I2, unfixable in the frozen consumer). A silently-dead
 * producer therefore looks identical to a genuinely quiet night. This module closes the gap with
 * a two-layer, fail-safe design:
 *
 *  Layer 1 — liveness (strong signal, INFRA): an external uptime check on /healthz during OOH
 *    hours. If /healthz is unreachable across an OOH period → producer-down. That case is invisible
 *    to the consumer and is owned by Spencer's monitoring (F008); the alert code is documented here
 *    so the wiring is agreed.
 *  Layer 2 — business-liveness (weak signal, SHIPPED HERE): at each OOH-period boundary, if the
 *    producer was healthy the whole period but created ZERO tickets against a non-zero trailing
 *    baseline, raise no-overnight-activity (suspect, not proof).
 *
 * Alerts surface via metrics.raiseAlert → /healthz detail + /api/alerts (rendered at the top of
 * the consumer's OOH review queue).
 */

import * as audit from './audit.js';
import { raiseAlert } from './metrics.js';
import { bridgeStatus } from './bridge.js';
import { zendeskStatus } from './zendesk.js';
import { storeStatus } from './store.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly; raiseAlert dedupes within an hour
const DEFAULT_BASELINE_PERIODS = 14;
const PERIOD_MS = 24 * 60 * 60 * 1000;

let monitorTimer = null;

/** Median of a numeric array (0 for empty). */
function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * OOH-period start boundaries, newest first: [current-period start, −1 period, −2, …].
 * Length is count+1 so there are `count` completed periods between consecutive boundaries.
 */
function periodBoundaries(now, count) {
    const current = audit.oohPeriodStart(now); // start of the in-progress period
    const bounds = [current];
    for (let i = 1; i <= count; i++) bounds.push(new Date(current.getTime() - i * PERIOD_MS));
    return bounds;
}

/**
 * Distinct OOH tickets created per completed period. counts[0] is the most recently completed
 * period (between the current-period start and one period before it).
 */
function countTicketsPerPeriod(entries, bounds) {
    const counts = [];
    for (let k = 0; k < bounds.length - 1; k++) {
        const hi = bounds[k].getTime();      // exclusive (start of the newer period)
        const lo = bounds[k + 1].getTime();  // inclusive (start of this period)
        const ids = new Set();
        for (const e of entries) {
            const t = new Date(e.OohActionAt).getTime();
            if (!Number.isNaN(t) && t >= lo && t < hi && e.ticketId != null) ids.add(e.ticketId);
        }
        counts.push(ids.size);
    }
    return counts;
}

/**
 * Pure decision: is a completed period "suspect"? Suspect = the producer was healthy but created
 * zero tickets against a non-zero baseline. A quiet night consistent with a zero baseline is fine.
 */
export function assessActivity({ current, baseline, healthy }) {
    return { suspect: !!healthy && Number(current) === 0 && Number(baseline) > 0 };
}

/**
 * Evaluates the most recently completed OOH period against the trailing baseline and raises the
 * no-overnight-activity alert when suspect. Returns the assessment for /healthz / diagnostics.
 */
export async function evaluateOvernightActivity(now = new Date(), { baselinePeriods = DEFAULT_BASELINE_PERIODS, healthy = true } = {}) {
    const bounds = periodBoundaries(now, baselinePeriods + 1);
    const entries = await audit.entriesSince(bounds[bounds.length - 1].toISOString());
    const counts = countTicketsPerPeriod(entries, bounds);
    const current = counts[0] ?? 0;
    const baseline = median(counts.slice(1));
    const { suspect } = assessActivity({ current, baseline, healthy });
    if (suspect) {
        raiseAlert('no-overnight-activity',
            `No OOH tickets were created in the last overnight period, but the typical volume is ~${baseline}. ` +
            'The producer may be silently down — verify it is running (a healthy producer + zero tickets must not read as "all clear").');
    }
    return { current, baseline: +baseline.toFixed(1), suspect, healthy, periodsAnalysed: counts.length };
}

/** Current subsystem health used as the layer-2 "was the producer healthy?" input. */
export function producerHealthy() {
    return bridgeStatus().healthy && zendeskStatus().healthy && storeStatus().healthy;
}

/**
 * Starts the hourly business-liveness self-check (idempotent). Layer-1 uptime is Spencer's.
 */
export function startLivenessMonitor() {
    if (monitorTimer) return;
    monitorTimer = setInterval(() => {
        evaluateOvernightActivity(new Date(), { healthy: producerHealthy() })
            .catch(err => console.error(`[LIVENESS] Overnight-activity check failed: ${err.message}`));
    }, CHECK_INTERVAL_MS);
    monitorTimer.unref?.();
}
