/**
 * Refrigeration switch-deny RUNTIME BOOT GUARD (Stream A / OOHDASH-19 interlock, design §6.1).
 *
 * The "in the running image" backstop. On boot, if device writes are ENABLED
 * (WRITES_DISABLED !== "true") the app self-tests that the refrigeration switch-deny is actually
 * present in THIS image by classifying a known cellar+switch device. If the deny is NOT present
 * (Stream A skipped / reverted), the guard KEEPS WRITES LOCKED (an in-process latch that
 * killswitch.writesBlocked() consults) and logs a hard startup error. This ties the OOHDASH-19
 * write-flip to Stream A being present in the DEPLOYED image, not merely merged — belt-and-braces
 * behind the CI sign-off gate (test/interlock-stream-a.test.js).
 *
 * Fail-closed: when writes are already locked at deploy time the guard is inert (the global lock
 * already covers everything); it only ever LOCKS, never enables.
 */

import { classifyDevice } from './tb-device.js';

// The canonical cellar+switch probe device (design §6.1). A correct image classifies this as
// refrigeration / monitor-only regardless of the switch signal.
const PROBE_NAME = 'gk-6261-cellar-1';

let refrigLock = false;

/**
 * True when the refrigeration switch-deny is present in this running image — i.e. a cellar unit
 * carrying a switch signal classifies as monitor-only refrigeration (design §6.1 self-test).
 */
export function refrigerationDenyPresent() {
    const c = classifyDevice(PROBE_NAME, 'default', { switchReported: true });
    return !!c && c.deviceType === 'refrigeration' && c.controllable === false;
}

/**
 * Pure decision — kept separate so BOTH branches (deny present / absent) are deterministically
 * unit-testable without needing to physically remove the deny from the image.
 * Returns { lockWrites, reason }.
 */
export function evaluateRefrigGuard(present, writesDisabled) {
    if (writesDisabled) {
        // Writes are already locked at deploy time — the deploy-time lock covers everything.
        return { lockWrites: false, reason: null };
    }
    if (!present) {
        return {
            lockWrites: true,
            reason: '[REFRIG-GUARD] Refrigeration switch-deny is NOT present in this image but writes are ENABLED — '
                + 'keeping device writes LOCKED (Stream A / OOHDASH-19 interlock). Deploy the Stream A image before enabling writes.'
        };
    }
    return { lockWrites: false, reason: null };
}

/**
 * Boot guard — runs the self-test, sets the in-process latch, and logs a hard error if it must lock.
 * Called from server.js start(). Returns the decision for logging/tests.
 */
export function runRefrigerationBootGuard(cfg, logger = console) {
    const present = refrigerationDenyPresent();
    const decision = evaluateRefrigGuard(present, cfg.writesDisabled);
    refrigLock = decision.lockWrites;
    if (decision.lockWrites) logger.error(decision.reason);
    return { present, ...decision };
}

/** True when the boot guard has engaged the runtime write-lock (consumed by killswitch.writesBlocked). */
export function refrigWritesLocked() {
    return refrigLock;
}

/** Test/ops helper — clears the runtime latch (test isolation). */
export function _resetRefrigGuard() {
    refrigLock = false;
}
