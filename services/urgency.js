/**
 * OOHDASH-146 D14 / B27: server entry to the shared urgency helper.
 *
 * public/js/urgency.js is a classic browser script (it attaches OohUrgency to globalThis). The server
 * evaluates that SAME file in an isolated vm context so the browser and the server run literally the
 * same code and can never drift. The server applies its own configuration (config.urgency); the
 * browser's answer is never trusted.
 */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { config } from '../config.js';

let _api = null;

function loadApi() {
    if (_api) return _api;
    const src = readFileSync(new URL('../public/js/urgency.js', import.meta.url), 'utf8');
    const sandbox = {};
    vm.runInNewContext(src, sandbox, { filename: 'public/js/urgency.js' });
    if (!sandbox.OohUrgency || typeof sandbox.OohUrgency.urgencyOf !== 'function') {
        throw new Error('public/js/urgency.js did not expose OohUrgency.urgencyOf');
    }
    _api = sandbox.OohUrgency;
    return _api;
}

/** The urgency options the browser needs (sent on GET /api/me) — same values the server uses. */
export function urgencyConfig() {
    const u = config.urgency;
    return {
        officeHours: u.officeHours,
        responseWorkingHours: u.responseWorkingHours,
        tz: u.tz,
        bankHolidays: [...u.bankHolidays]
    };
}

/**
 * urgencyOf(neededAt, now?, opts?) with the server's configuration. Returns a plain object
 * { urgent, urgency, label, earliestActionAt, neededAtMs } or null when neededAt cannot be read.
 */
export function urgencyOf(neededAt, now = Date.now(), opts = urgencyConfig()) {
    const r = loadApi().urgencyOf(neededAt, now, opts);
    return r ? { ...r } : null;
}
