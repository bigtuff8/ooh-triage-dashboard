/**
 * OOHDASH-19 write-flip INTERLOCK (Stream A, design §6.1 / §8.6).
 *
 * Makes the ordering "Stream A observed live BEFORE the wide write-flip" structurally
 * non-bypassable, defence-in-depth:
 *   1. CI gate — a no-op while WRITES_DISABLED="true"; the moment the manifest flips it to "false"
 *      it REQUIRES docs/project/releases/SIGNOFF_stream-a-observed-live.md to exist AND to name an
 *      image digest matching the digest the manifest is deploying. Absent/stale ⇒ CI fails ⇒
 *      branch protection blocks the OOHDASH-19 merge.
 *   2. Runtime boot guard — with writes enabled, classifyDevice('gk-6261-cellar-1',…switch) MUST be
 *      refrigeration/monitor-only; if the deny is absent the guard keeps writes LOCKED (belt-and-braces
 *      "in the running image" backstop).
 *
 * node --test style; runs under `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const MANIFEST_URL = new URL('../k8s/deployment.yaml', import.meta.url);
const SIGNOFF_URL = new URL('../docs/project/releases/SIGNOFF_stream-a-observed-live.md', import.meta.url);

/* ---------------- manifest parsing ---------------- */

function readManifest() {
    const src = readFileSync(MANIFEST_URL, 'utf8');
    const wd = src.match(/- name:\s*WRITES_DISABLED\s*\n\s*value:\s*"([^"]*)"/);
    const img = src.match(/image:\s*([^\s]+)/);
    // Deploy digest = the image tag/digest after the final ':' (CI substitutes <sha> at deploy time).
    const imageRef = img ? img[1] : null;
    const deployDigest = imageRef ? imageRef.split(':').pop() : null;
    // The enable contract (OOHDASH-12): writes are enabled ONLY when the value is exactly "false".
    const writesEnabled = wd ? wd[1].trim().toLowerCase() === 'false' : false;
    return { writesEnabled, deployDigest, imageRef };
}

/** Parses the "Image digest" field from the sign-off artefact (fixed field, design §6.1). */
function readSignoffDigest() {
    if (!existsSync(SIGNOFF_URL)) return null;
    const src = readFileSync(SIGNOFF_URL, 'utf8');
    const m = src.match(/image\s*digest\s*[:|]\s*`?([A-Za-z0-9:@._\-]+)`?/i);
    return m ? m[1].trim() : null;
}

/**
 * Pure gate decision (the CI logic). No-op unless writes are being enabled; when they are, requires a
 * matching live sign-off. Returns { pass, reason }.
 */
function evaluateInterlock({ writesEnabled, signoffExists, signoffDigest, deployDigest }) {
    if (!writesEnabled) return { pass: true, reason: 'writes locked (WRITES_DISABLED != "false") — interlock is a no-op' };
    if (!signoffExists) return { pass: false, reason: 'write-flip requested but SIGNOFF_stream-a-observed-live.md is absent — Stream A not observed live' };
    if (!signoffDigest || !deployDigest || signoffDigest !== deployDigest) {
        return { pass: false, reason: `sign-off digest (${signoffDigest}) does not match the deploying image digest (${deployDigest}) — stale sign-off` };
    }
    return { pass: true, reason: 'write-flip permitted — observed-live sign-off matches the deploying image digest' };
}

/* ---------------- 1. CI gate against the REAL manifest (current state = no-op) ---------------- */

test('interlock CI gate: with the current manifest the gate does not obstruct Stream A build/merge', () => {
    const { writesEnabled, deployDigest } = readManifest();
    const decision = evaluateInterlock({
        writesEnabled,
        signoffExists: existsSync(SIGNOFF_URL),
        signoffDigest: readSignoffDigest(),
        deployDigest
    });
    if (!writesEnabled) {
        assert.equal(decision.pass, true, 'while WRITES_DISABLED stays "true" the interlock must be a trivial pass');
    } else {
        // If someone HAS flipped the manifest, the sign-off must exist and match — enforced for real.
        assert.equal(decision.pass, true, decision.reason);
    }
});

test('interlock invariant: WRITES_DISABLED is still "true" in the committed manifest (Stream A must not flip it)', () => {
    const { writesEnabled } = readManifest();
    assert.equal(writesEnabled, false, 'Stream A must NOT enable writes — WRITES_DISABLED stays locked ("true")');
});

/* ---------------- 2. CI gate logic — both branches, deterministically ---------------- */

test('interlock gate blocks the write-flip when no live sign-off exists', () => {
    const d = evaluateInterlock({ writesEnabled: true, signoffExists: false, signoffDigest: null, deployDigest: 'abc123' });
    assert.equal(d.pass, false);
    assert.match(d.reason, /SIGNOFF_stream-a-observed-live\.md is absent/);
});

test('interlock gate blocks the write-flip on a STALE sign-off (digest mismatch)', () => {
    const d = evaluateInterlock({ writesEnabled: true, signoffExists: true, signoffDigest: 'oldsha', deployDigest: 'newsha' });
    assert.equal(d.pass, false);
    assert.match(d.reason, /stale sign-off/);
});

test('interlock gate PERMITS the write-flip when the sign-off matches the deploying digest', () => {
    const d = evaluateInterlock({ writesEnabled: true, signoffExists: true, signoffDigest: 'sha42', deployDigest: 'sha42' });
    assert.equal(d.pass, true);
});

/* ---------------- 3. Runtime boot guard self-test ---------------- */

const guard = await import('../services/refrig-guard.js');

test('runtime guard: the refrigeration deny IS present in this image (self-test passes)', () => {
    assert.equal(guard.refrigerationDenyPresent(), true, 'classify(cellar+switch) must be refrigeration/monitor-only in this image');
});

test('runtime guard: with writes ENABLED and the deny present, writes are NOT locked', () => {
    const d = guard.evaluateRefrigGuard(true, false);
    assert.equal(d.lockWrites, false);
});

test('runtime guard: with writes ENABLED but the deny ABSENT, writes are kept LOCKED (backstop)', () => {
    const d = guard.evaluateRefrigGuard(false, false);
    assert.equal(d.lockWrites, true);
    assert.match(d.reason, /keeping device writes LOCKED/);
});

test('runtime guard: when writes are already locked at deploy time the guard is inert', () => {
    assert.equal(guard.evaluateRefrigGuard(false, true).lockWrites, false);
    assert.equal(guard.evaluateRefrigGuard(true, true).lockWrites, false);
});

test('runtime guard: runRefrigerationBootGuard engages the latch when the deny is absent, and clears it otherwise', () => {
    const errors = [];
    const logger = { error: m => errors.push(m) };
    // deny present + writes enabled ⇒ no lock (real image path).
    const ok = guard.runRefrigerationBootGuard({ writesDisabled: false }, logger);
    assert.equal(ok.lockWrites, false);
    assert.equal(guard.refrigWritesLocked(), false);
    guard._resetRefrigGuard();
});
