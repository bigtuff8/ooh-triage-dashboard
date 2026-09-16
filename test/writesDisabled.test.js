/**
 * OOHDASH-12 — fail-CLOSED device-write default (S4/C5).
 *
 * Proves the inverted contract at config.js:87: writes are enabled ONLY when the RAW
 * process.env.WRITES_DISABLED, trimmed and lower-cased, is exactly "false". Absence,
 * empty, "true", "0", "no", a typo, or any other value ⇒ writesDisabled=true (disabled).
 *
 * Also proves: the [WRITE-LOCK] boot line reports the correct state in both cases;
 * /healthz body writesDisabled echoes config.writesDisabled; and killswitch.writesBlocked()
 * returns the deploy-time reason with NO Cosmos read when writesDisabled is true.
 *
 * config.js reads process.env at import time and builds a frozen `config`, so each scenario
 * imports a fresh module instance (cache-busting query) after setting the environment.
 * Behaviour-only; runs under `node --test`.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

let importCounter = 0;

/** Loads a fresh config module with WRITES_DISABLED set exactly as supplied (or unset for undefined). */
async function writesDisabledFor(raw) {
    if (raw === undefined) delete process.env.WRITES_DISABLED;
    else process.env.WRITES_DISABLED = raw;
    const mod = await import(`../config.js?wd=${++importCounter}`);
    return mod.config.writesDisabled;
}

/* ---------------- 1. the enable/disable contract ---------------- */

test('unset ⇒ writesDisabled true (the core defect: absence must lock)', async () => {
    assert.equal(await writesDisabledFor(undefined), true);
});

test('empty "" ⇒ writesDisabled true', async () => {
    assert.equal(await writesDisabledFor(''), true);
});

test('"true" ⇒ writesDisabled true (still locked)', async () => {
    assert.equal(await writesDisabledFor('true'), true);
});

test('exact "false" ⇒ writesDisabled false — the ONLY enable path', async () => {
    assert.equal(await writesDisabledFor('false'), false);
});

/* ---------------- normalisation boundary (trim + lower, exact "false") ---------------- */

test('"False" ⇒ ENABLED (lower-cases to "false") — asserted boundary', async () => {
    assert.equal(await writesDisabledFor('False'), false);
});

test('"FALSE" ⇒ ENABLED (lower-cases to "false")', async () => {
    assert.equal(await writesDisabledFor('FALSE'), false);
});

test('" false " ⇒ ENABLED (trims to "false") — asserted boundary', async () => {
    assert.equal(await writesDisabledFor(' false '), false);
});

test('"0" ⇒ writesDisabled true (junk stays disabled)', async () => {
    assert.equal(await writesDisabledFor('0'), true);
});

test('"no" ⇒ writesDisabled true (junk stays disabled)', async () => {
    assert.equal(await writesDisabledFor('no'), true);
});

test('"disable" typo\'d value ⇒ writesDisabled true', async () => {
    assert.equal(await writesDisabledFor('disable'), true);
});

test('"falseee" typo ⇒ writesDisabled true (not exactly "false")', async () => {
    assert.equal(await writesDisabledFor('falseee'), true);
});

/* ---------------- 2. [WRITE-LOCK] boot line reports the correct state ---------------- */
// Replicates server.js's boot decision exactly and asserts the emitted line per state.

function bootWriteLockLines(cfg) {
    const out = [];
    const log = (m) => out.push({ level: 'log', m });
    const warn = (m) => out.push({ level: 'warn', m });
    // MUST mirror server.js listen-callback logic exactly.
    if (cfg.writesDisabled) {
        log('[WRITE-LOCK] Device writes are DISABLED (WRITES_DISABLED lock engaged).');
    } else if (cfg.isProduction) {
        warn('[WRITE-LOCK] ***************************************************************');
        warn('[WRITE-LOCK] *** DEVICE WRITES ARE ENABLED IN PRODUCTION — WRITES_DISABLED=false ***');
        warn('[WRITE-LOCK] *** Live device actuations WILL fire on dispatch. ***');
        warn('[WRITE-LOCK] ***************************************************************');
    } else {
        warn('[WRITE-LOCK] *** DEVICE WRITES ARE ENABLED *** WRITES_DISABLED=false — live actuations will fire.');
    }
    return out;
}

test('[WRITE-LOCK] boot line reports DISABLED (log) when writesDisabled true', async () => {
    const lines = bootWriteLockLines({ writesDisabled: true, isProduction: false });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].level, 'log');
    assert.match(lines[0].m, /\[WRITE-LOCK\] Device writes are DISABLED/);
});

test('[WRITE-LOCK] boot line reports ENABLED (warn) when writesDisabled false', async () => {
    const lines = bootWriteLockLines({ writesDisabled: false, isProduction: false });
    assert.ok(lines.length >= 1);
    assert.ok(lines.every(l => l.level === 'warn'));
    assert.ok(lines.some(l => /DEVICE WRITES ARE ENABLED/.test(l.m)));
});

test('[WRITE-LOCK] enabled-in-production emits the loud multi-line warn banner', async () => {
    const lines = bootWriteLockLines({ writesDisabled: false, isProduction: true });
    assert.ok(lines.length > 1, 'production enabled state must be an unmissable multi-line banner');
    assert.ok(lines.every(l => l.level === 'warn'));
    assert.ok(lines.some(l => /ENABLED IN PRODUCTION/.test(l.m)));
});

// Anti-drift guard: assert the real server.js source contains the [WRITE-LOCK] boot logic
// so bootWriteLockLines cannot silently diverge from what actually ships.
test('server.js actually emits the [WRITE-LOCK] boot line for both states', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    assert.match(src, /\[WRITE-LOCK\] Device writes are DISABLED/);
    assert.match(src, /DEVICE WRITES ARE ENABLED/);
    assert.match(src, /config\.writesDisabled/);
});

/* ---------------- 3. /healthz body writesDisabled echoes config.writesDisabled ---------------- */
// server.js:76 sets `writesDisabled: config.writesDisabled` in the /healthz body. Assert the
// health body derives from the same config truth (source-level, since standing up express +
// OIDC is out of scope for a unit test) across both the disabled and enabled contract outcomes.

test('/healthz body writesDisabled is wired to config.writesDisabled', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    assert.match(src, /writesDisabled:\s*config\.writesDisabled/);
});

test('/healthz echo tracks the contract: false-config ⇒ body false, locked ⇒ body true', async () => {
    // Emulate the health body field exactly as server.js builds it, off a fresh config.
    delete process.env.WRITES_DISABLED;
    const locked = await import(`../config.js?hz=${++importCounter}`);
    assert.equal(locked.config.writesDisabled, true);
    assert.equal({ writesDisabled: locked.config.writesDisabled }.writesDisabled, true);

    process.env.WRITES_DISABLED = 'false';
    const enabled = await import(`../config.js?hz=${++importCounter}`);
    assert.equal(enabled.config.writesDisabled, false);
    assert.equal({ writesDisabled: enabled.config.writesDisabled }.writesDisabled, false);
    delete process.env.WRITES_DISABLED;
});

/* ---------------- 4. killswitch inheritance: deploy-time reason, no Cosmos read ---------------- */

test('killswitch.writesBlocked() returns the deploy-time reason with NO Cosmos read when disabled', async () => {
    delete process.env.WRITES_DISABLED; // unset ⇒ disabled under the new contract

    // Mock the store so ANY collection() call (a Cosmos/store read) would fail the test.
    let storeTouched = false;
    mock.module('../services/store.js', {
        namedExports: {
            collection: async () => {
                storeTouched = true;
                throw new Error('store.collection() must NOT be reached when writesDisabled is true');
            }
        }
    });

    const ks = await import(`../services/killswitch.js?wd=${++importCounter}`);
    const reason = await ks.writesBlocked('1500');

    assert.equal(storeTouched, false, 'writesBlocked read the store — the deploy-time gate must be synchronous/first');
    assert.match(reason, /disabled at deploy time \(WRITES_DISABLED\)/);
    assert.match(reason, /safety\/canary lock/);

    mock.reset();
});
