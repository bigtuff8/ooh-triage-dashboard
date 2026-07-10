/**
 * Server-side capability & value-guardrail registry (F009, IM-03/TQ-1).
 *
 * This is the primary guard: every command is validated here BEFORE dispatch.
 * The bridge's edge capability-gating is the backstop, never the only check.
 *
 * App policy reconciles the design guardrails (±3°C of current, cap 25°C) with the
 * SD-492 device ranges (Salus 5–35, Intesis 16–30, HW boost 0–9).
 */

const REGISTRY = {
    'salus-it500': {
        label: 'Salus IT500',
        commands: ['setpoint', 'frost'],
        deviceRange: { min: 5, max: 35 },
        frostSetpoint: 5,
        stepC: 0.5
    },
    'salus-it700': {
        label: 'Salus IT700',
        commands: ['setpoint', 'frost'],
        deviceRange: { min: 5, max: 35 },
        frostSetpoint: 5,
        stepC: 0.5,
        slowEcho: true // slow to echo *SyncStatus — timeout handling applies (CR-03)
    },
    'salus-it500-dhw': {
        label: 'Salus IT500 DHW',
        commands: ['hwboost'],
        boostRange: { min: 0, max: 9 } // 0 cancels
    },
    'intesis': {
        label: 'Intesis',
        commands: ['setpoint', 'mode'],
        deviceRange: { min: 16, max: 30 },
        modes: ['Off', 'Heat', 'Cool', 'Auto', 'Fan'],
        stepC: 0.5
    },
    // No remote command path — capture & escalate only (SD-515 / SR-4)
    'tuya': { label: 'Tuya (PowerPause/kitchen)', commands: [] },
    'boiler-panel': { label: 'Pub boiler panel', commands: [] },
    'tb-rulechain': { label: 'TB rule-chain (lighting/fans)', commands: [] },
    'gateway': { label: 'Lighthouse gateway', commands: [] }
};

const APP_POLICY = {
    setpointDeltaMax: 3,   // ±3°C of the current setpoint
    setpointCap: 25        // absolute app-policy ceiling
};

/**
 * Returns the registry entry for a device type (null if unknown).
 */
export function capabilitiesFor(deviceType) {
    return REGISTRY[deviceType] || null;
}

/**
 * Computes the allowed setpoint window for a device given its current setpoint.
 */
export function setpointWindow(deviceType, currentSetpoint) {
    const entry = REGISTRY[deviceType];
    if (!entry || !entry.commands.includes('setpoint')) return null;
    const lo = Math.max(entry.deviceRange.min, currentSetpoint - APP_POLICY.setpointDeltaMax);
    const hi = Math.min(APP_POLICY.setpointCap, currentSetpoint + APP_POLICY.setpointDeltaMax, entry.deviceRange.max);
    return { min: lo, max: hi, step: entry.stepC };
}

/**
 * Validates a proposed command against capability and value guardrails.
 * Returns { ok:true, attribute, value } or { ok:false, reason }.
 */
export function validateCommand(device, command, value) {
    const entry = REGISTRY[device.deviceType];
    if (!entry) return { ok: false, reason: `Unknown device type "${device.deviceType}" — command rejected` };

    switch (command) {
        case 'setpoint': {
            if (!entry.commands.includes('setpoint')) return { ok: false, reason: `${entry.label} does not support remote setpoint changes` };
            const current = device.telemetry?.heatingSetpoint;
            if (typeof current !== 'number') return { ok: false, reason: 'Current setpoint unknown — cannot apply the ±3°C guardrail safely' };
            const w = setpointWindow(device.deviceType, current);
            const v = Number(value);
            if (!Number.isFinite(v)) return { ok: false, reason: 'Setpoint must be a number' };
            if (v < w.min || v > w.max) return { ok: false, reason: `Setpoint ${v}°C is outside the allowed ${w.min}–${w.max}°C window (±3°C of current, max 25°C)` };
            return { ok: true, attribute: 'setpointDesired', value: v };
        }
        case 'frost': {
            if (!entry.commands.includes('frost')) return { ok: false, reason: `${entry.label} does not support a frost-hold` };
            return { ok: true, attribute: 'setpointDesired', value: entry.frostSetpoint };
        }
        case 'mode': {
            if (!entry.commands.includes('mode')) return { ok: false, reason: `${entry.label} does not support mode changes (Intesis only)` };
            if (!entry.modes.includes(value)) return { ok: false, reason: `Mode "${value}" is not one of ${entry.modes.join('/')}` };
            return { ok: true, attribute: 'modeDesired', value };
        }
        case 'hwboost': {
            if (!entry.commands.includes('hwboost')) return { ok: false, reason: `${entry.label} is not a boostable hot-water device` };
            const v = Number(value);
            if (!Number.isInteger(v) || v < entry.boostRange.min || v > entry.boostRange.max) {
                return { ok: false, reason: `Boost hours must be a whole number ${entry.boostRange.min}–${entry.boostRange.max} (0 cancels)` };
            }
            return { ok: true, attribute: 'hwBoostHoursDesired', value: v };
        }
        default:
            return { ok: false, reason: `Unknown command "${command}"` };
    }
}

/**
 * Read-only registry mirror for the Admin page.
 */
export function registrySnapshot() {
    return {
        policy: APP_POLICY,
        deviceTypes: Object.entries(REGISTRY).map(([type, e]) => ({
            type,
            label: e.label,
            commands: e.commands,
            deviceRange: e.deviceRange || null,
            boostRange: e.boostRange || null,
            modes: e.modes || null,
            slowEcho: !!e.slowEcho
        }))
    };
}
