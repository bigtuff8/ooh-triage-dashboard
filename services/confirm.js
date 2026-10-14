/**
 * OOHDASH-123 Rosetta Stone confirmation logic (design section 5, build plan WU4/WU5).
 *
 * The three-outcome settle model + the telemetry-based pre-dispatch check. The command write is the
 * SERVER_SCOPE Requested write (services/tb-client.js writeServerScopeAttribute); the confirm read is
 * readCommandState. A command ends in exactly one of three outcomes and only CONFIRMED is success:
 * CONFIRMED (status=accepted AND the device's own confirming telemetry matches AND its ts>dispatchTs),
 * NON-DELIVERY (a gate/vendor rejection) or INDETERMINATE (accepted-but-unproven at the per-class
 * confirm limit, decided by the watcher in services/control.js). Pure + injectable for testability.
 */

/* ================================================================================================ */
/* OOHDASH-123 Rosetta Stone — three-outcome confirmation model (design §5, build plan §4, WU4/WU5)   */
/* ================================================================================================ */

/** Normalise a boolean-ish value to 'on'/'off' so true/'true'/'on'/1 and false/'false'/'off'/0 match. */
export function normBool(v) {
    const s = String(v).toLowerCase().trim();
    if (s === 'true' || s === 'on' || s === '1') return 'on';
    if (s === 'false' || s === 'off' || s === '0') return 'off';
    return s;
}

/**
 * Does the device's own confirming telemetry equal the requested value, per the class compare rule?
 * number → numeric tolerance +/−0.25 C (compareRule 'numeric-0.25'); bool → on/off normalisation;
 * otherwise a case-insensitive string match. A null/undefined telemetry value never matches.
 */
export function telemetryMatches(telemetryValue, requested, contract) {
    if (telemetryValue === null || telemetryValue === undefined) return false;
    const vt = contract?.valueType;
    if (vt === 'number') {
        const a = Number(telemetryValue), b = Number(requested);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
        return Math.abs(a - b) <= 0.25;
    }
    if (vt === 'bool') return normBool(telemetryValue) === normBool(requested);
    return String(telemetryValue).toLowerCase() === String(requested).toLowerCase();
}

/**
 * The three-outcome instantaneous classifier. `state` = { status, statusTs, lastError, telemetryValue,
 * telemetryTs }, every ts a ThingsBoard server-assigned value. Returns one of:
 *   'CONFIRMED'    — status==='accepted' (fresh) AND confirming telemetry matches (fresh ts). BOTH required.
 *   'NON-DELIVERY' — status==='rejected' (fresh). The translated LastError is shown; raw goes to the ticket.
 *   'IN-FLIGHT'    — anything else: pending, accepted-only, echo-before-accepted, telemetry-match-pending-only.
 * INDETERMINATE (Not confirmed) is a time decision the watcher makes when IN-FLIGHT persists past the
 * confirm limit — it is NOT returned here (keeps this pure).
 *
 * Stale guard (design §5): a status or telemetry value whose own ts is at or before dispatchTs belongs
 * to a previous command and is ignored. This is what defeats the cross-clock false-success path: a
 * pre-command telemetry reading cannot CONFIRM because status stays pending/absent until the gate
 * processes THIS write and writes a fresh accepted.
 */
export function classifyOutcome(state, requestedValue, dispatchTs, contract) {
    const { status, statusTs, telemetryValue, telemetryTs } = state || {};
    const statusFresh = (typeof statusTs === 'number' && statusTs > dispatchTs) ? status : null;
    if (statusFresh === 'rejected') return 'NON-DELIVERY';
    const telemetryFresh = typeof telemetryTs === 'number' && telemetryTs > dispatchTs
        && telemetryMatches(telemetryValue, requestedValue, contract);
    if (statusFresh === 'accepted' && telemetryFresh) return 'CONFIRMED';
    return 'IN-FLIGHT';
}

/** True when the gate has (freshly) accepted the command — drives the in-flight "Accepted" sub-state. */
export function isAcceptedFresh(state, dispatchTs) {
    return !!state && state.status === 'accepted' && typeof state.statusTs === 'number' && state.statusTs > dispatchTs;
}

/**
 * Pre-dispatch check (design §6, build plan WU5). Judge "already satisfied" from the device's own
 * confirming telemetry, NOT from the Desired attribute, and NEVER dead-end (no 409 duplicate-pending).
 * Returns { outcome: 'already-satisfied', telemetryValue } when the device already reads the requested
 * value; otherwise { outcome: 'dispatch' }.
 */
export async function preDispatchCheck(tb, device, deviceType, requestedValue, contract) {
    const state = await tb.readCommandState(device, deviceType);
    if (telemetryMatches(state.telemetryValue, requestedValue, contract)) {
        return { outcome: 'already-satisfied', telemetryValue: state.telemetryValue, telemetryTs: state.telemetryTs };
    }
    return { outcome: 'dispatch' };
}
