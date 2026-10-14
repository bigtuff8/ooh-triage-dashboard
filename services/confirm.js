/**
 * Shared confirm-loop edge/stale rules (design §3.2/§3.7, D3) — the ONE implementation of the
 * edge-trigger and fresh-echo settle logic that both control.pollOne and overrides.revert use.
 *
 * The bridge is EDGE-TRIGGERED (Spencer §3 rule 1): re-writing the same `*Desired` dispatches
 * NOTHING. Two rules fall out of that and out of the "no server timeout, states {pending, synced,
 * failed, rejected}" contract (Spencer §1):
 *
 *   1. Pre-dispatch classification (classifyPreDispatch) — read the current desired + confirm
 *      state BEFORE writing and decide whether a write would move anything:
 *        - already-satisfied : desired===requested ∧ synced ∧ reported===requested → no write,
 *          honest success-equivalent (audit 'already-set').
 *        - duplicate-pending : desired===requested but NOT confirmed → an identical change is in
 *          flight / never confirmed; re-sending won't move it (edge-triggered). No write.
 *        - dispatch          : the value differs → write it (dispatchTs = now).
 *
 *   2. Post-dispatch settle (isSettled) — a settle requires a FRESH echo: sync==='synced' ∧
 *      reported===value ∧ syncTs > dispatchTs. The syncTs>dispatchTs guard defeats the
 *      stale-synced / silently-ignored-value trap: a value the device never actually took lands
 *      no fresh echo, so it times out honestly instead of reading an old 'synced'.
 *
 * String() comparison throughout: TB echoes numbers/bools as strings on the timeseries path, so
 * `19` (desired) and `"19"` (reported) must compare equal, and `true`/`"true"` likewise.
 */

/** Loose equality tolerant of the number/bool→string coercion TB applies on the wire. */
export function valuesEqual(a, b) {
    if (a === undefined || a === null || b === undefined || b === null) return false;
    return String(a) === String(b);
}

/**
 * A post-dispatch settle: a FRESH synced echo of exactly the dispatched value.
 * `syncTs > dispatchTs` is load-bearing — it rejects a stale 'synced' left over from a previous
 * command (the stale-synced trap). A nullish syncTs never settles (lazy confirm keys, Spencer §3
 * rule 3: absence ≠ error, it just isn't confirmed yet).
 */
export function isSettled({ sync, reported, syncTs }, value, dispatchTs) {
    return sync === 'synced'
        && valuesEqual(reported, value)
        && typeof syncTs === 'number'
        && syncTs > dispatchTs;
}

/**
 * True when a failed/rejected outcome is FRESH (belongs to this dispatch, not a stale prior one).
 * Same syncTs>dispatchTs freshness gate as isSettled so a leftover 'failed' from a previous command
 * can't fail a brand-new dispatch.
 */
export function isFreshTerminal({ sync, syncTs }, dispatchTs) {
    return (sync === 'failed' || sync === 'rejected')
        && typeof syncTs === 'number'
        && syncTs > dispatchTs;
}

/**
 * Pre-dispatch edge classification. Reads the device's current desired attribute and its confirm
 * state, and returns one of:
 *   { outcome: 'already-satisfied' }  — no write needed; already confirmed at the requested value.
 *   { outcome: 'duplicate-pending' }  — desired already equals the request but isn't confirmed;
 *                                       a re-write is a no-op on the edge-triggered bridge.
 *   { outcome: 'dispatch' }           — the value differs; a real write is required.
 *
 * `tb` is the tb-client (injected so this stays pure/testable): needs readDesiredState(device,attr)
 * and readControlState(device,attr).
 */
export async function classifyPreDispatch(tb, device, attribute, value) {
    const { desired } = await tb.readDesiredState(device, attribute);
    // No current desired, or a different desired → a genuine change; dispatch.
    if (desired === undefined || desired === null || !valuesEqual(desired, value)) {
        return { outcome: 'dispatch', desired };
    }
    // Desired already equals the request — the bridge won't re-fire (edge-triggered). Distinguish
    // "already confirmed there" from "still in flight / never confirmed".
    const { sync, reported } = await tb.readControlState(device, attribute);
    if (sync === 'synced' && valuesEqual(reported, value)) {
        return { outcome: 'already-satisfied', desired, sync, reported };
    }
    return { outcome: 'duplicate-pending', desired, sync, reported };
}

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
