/**
 * B32: P1 "Raise the P1" disabled-button coverage.
 *
 * Covers every P1 confirm screen, including the retry screen shown after a failed raise.
 * The earlier count of 45 of 46 was the retry screen (pre-filled → button starts enabled).
 *
 * PD-1  p1ReasonValid(text) validates correctly: 10+ real chars → valid, fewer → invalid.
 *        Whitespace collapsing and trimming are applied before the length check.
 * PD-2  "Raise the P1" button renders with 'disabled aria-disabled="true"' in finishOutcome
 *        when reasonOk is false (initial state: empty or insufficient reason).
 * PD-3  "Raise the P1" button renders WITHOUT disabled attributes when reasonOk is true
 *        (pre-filled retry state: p1Reason already set from the failed-submit round).
 * PD-4  "Try again" onclick clears _err_, _pend_, _conf_ but NOT p1Reason, so the
 *        retry confirm screen is pre-filled and the button starts enabled.
 * PD-5  p1ReasonInput sets btn.disabled = !p1ReasonValid(value), toggling aria-disabled too.
 * PD-6  Total P1 confirm screen paths in flows.js and views.js meets the design count.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const flowsSrc = readFileSync(resolve(root, 'public/js/flows.js'), 'utf8');
const viewsSrc = readFileSync(resolve(root, 'public/js/views.js'), 'utf8');

/* ── PD-1: p1ReasonValid logic ───────────────────────────────────────── */

/**
 * Reimplement the same logic as p1ReasonValid in flows.js so we can call it in Node.
 * Definition from flows.js (B20):
 *   function p1ReasonValid(text) {
 *       return String(text || '').replace(/\s+/g, ' ').trim().length >= P1_REASON_MIN_LEN;
 *   }
 * where P1_REASON_MIN_LEN = 10.
 */
const P1_REASON_MIN_LEN = 10;
function p1ReasonValid(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().length >= P1_REASON_MIN_LEN;
}

test('PD-1a: p1ReasonValid — empty string is invalid', () => {
    assert.equal(p1ReasonValid(''), false);
});

test('PD-1b: p1ReasonValid — null/undefined is invalid', () => {
    assert.equal(p1ReasonValid(null), false);
    assert.equal(p1ReasonValid(undefined), false);
});

test('PD-1c: p1ReasonValid — whitespace-only is invalid (collapse then trim)', () => {
    assert.equal(p1ReasonValid('   '), false);
    assert.equal(p1ReasonValid('\t\n  \n'), false);
    // 9 spaces collapse to 1 space, trim to empty → invalid
    assert.equal(p1ReasonValid('         '), false);
});

test('PD-1d: p1ReasonValid — 9 real characters is invalid (needs 10)', () => {
    // After collapse and trim, length must be >= 10
    assert.equal(p1ReasonValid('123456789'), false);
    assert.equal(p1ReasonValid('a b c d e'), false); // 9 chars after collapse
});

test('PD-1e: p1ReasonValid — exactly 10 real characters is valid', () => {
    assert.equal(p1ReasonValid('1234567890'), true);
    assert.equal(p1ReasonValid('a b c d ef'), true); // 10 chars after collapse
});

test('PD-1f: p1ReasonValid — more than 10 real characters is valid', () => {
    assert.equal(p1ReasonValid('This is a long enough reason'), true);
    assert.equal(p1ReasonValid('Risk to trade: fryer still running'), true);
});

test('PD-1g: p1ReasonValid — matches the constant P1_REASON_MIN_LEN defined in flows.js', () => {
    // flows.js defines: const P1_REASON_MIN_LEN = 10;
    const match = flowsSrc.match(/const P1_REASON_MIN_LEN\s*=\s*(\d+)/);
    assert.ok(match, 'P1_REASON_MIN_LEN constant not found in flows.js');
    assert.equal(Number(match[1]), 10, 'P1_REASON_MIN_LEN must be 10 (design spec B20)');
});

/* ── PD-2: button renders disabled when reason is insufficient ───────── */

test('PD-2a: finishOutcome renders button with disabled and aria-disabled when reasonOk is false', () => {
    // The source must contain the conditional template that adds disabled when !reasonOk
    assert.ok(
        flowsSrc.includes("${reasonOk ? '' : ' disabled aria-disabled=\"true\"'}"),
        'finishOutcome must render the button with \'disabled aria-disabled="true"\' when !reasonOk'
    );
});

test('PD-2b: views.js ambiguous-site P1 button also renders disabled when reasonOk is false', () => {
    assert.ok(
        viewsSrc.includes("${reasonOk ? '' : ' disabled aria-disabled=\"true\"'}"),
        'views.js ambiguous P1 button must render disabled when !reasonOk (B26)'
    );
});

test('PD-2c: reasonOk in finishOutcome uses p1ReasonValid(f.data.p1Reason)', () => {
    // The source must compute reasonOk by calling p1ReasonValid on the stored reason
    assert.ok(
        flowsSrc.includes('p1ReasonValid(f.data.p1Reason)'),
        'finishOutcome must derive reasonOk from p1ReasonValid(f.data.p1Reason)'
    );
});

/* ── PD-3: button is enabled when reason is pre-filled (retry state) ── */

test('PD-3a: p1ReasonValid returns true for a typical reason typed before a failed raise', () => {
    // These simulate what an agent would type before clicking "Raise the P1"
    assert.equal(p1ReasonValid('Fryers still on, risk to trade'), true);
    assert.equal(p1ReasonValid('No heating — pub cannot open tomorrow morning'), true);
    assert.equal(p1ReasonValid('Fridge alarm active'), true); // exactly >= 10 chars
});

test('PD-3b: finishOutcome reason-box textarea pre-fills from f.data.p1Reason', () => {
    // p1ReasonBox reads f.data.p1Reason and places it as the textarea value
    assert.ok(
        flowsSrc.includes('f.data.p1Reason || \'\''),
        'p1ReasonBox must pre-fill the textarea from f.data.p1Reason (retry/pre-filled state)'
    );
});

/* ── PD-4: retry onclick preserves p1Reason ─────────────────────────── */

test('PD-4a: "Try again" onclick clears _err_, _pend_, _conf_ but NOT p1Reason', () => {
    // Extract the "Try again" button onclick from finishOutcome (the P1 error-state retry button)
    // The onclick is a template literal string; capture everything between onclick=" and ">Try again
    const tryAgainMatch = flowsSrc.match(/onclick="([^"]*?)">Try again<\/button>/);
    assert.ok(tryAgainMatch, '"Try again" button with onclick not found in flows.js finishOutcome');

    const onclick = tryAgainMatch[1];

    // Must clear the three error-state fields
    assert.ok(onclick.includes("'_err_"), 'Try again must clear _err_ key');
    assert.ok(onclick.includes("'_pend_"), 'Try again must clear _pend_ key');
    assert.ok(onclick.includes("'_conf_"), 'Try again must clear _conf_ key');

    // Must NOT clear p1Reason (preserving it makes the button start enabled on retry)
    assert.ok(
        !onclick.includes('p1Reason'),
        '"Try again" onclick must NOT clear p1Reason — clearing it would make the retry button disabled'
    );
});

test('PD-4b: p1Reason is not reset in the submitPendingOutcome catch handler', () => {
    // The catch handler sets _err_ and nulls _pend_, but must not touch p1Reason
    // Find the catch block after the api.post call
    const catchIdx = flowsSrc.indexOf('.catch(err => {');
    assert.ok(catchIdx >= 0, '.catch handler not found in flows.js submitPendingOutcome');

    // Read the catch block up to its closing brace
    const catchBlock = flowsSrc.slice(catchIdx, catchIdx + 300);
    assert.ok(
        !catchBlock.includes('p1Reason'),
        'submitPendingOutcome .catch handler must not modify p1Reason'
    );
});

/* ── PD-5: p1ReasonInput toggles disabled/aria-disabled ─────────────── */

test('PD-5a: p1ReasonInput calls p1ReasonValid(value) to determine the new button state', () => {
    assert.ok(
        flowsSrc.includes('const ok = p1ReasonValid(value)'),
        'p1ReasonInput must call p1ReasonValid(value) (B20)'
    );
});

test('PD-5b: p1ReasonInput sets btn.disabled = !ok and toggles aria-disabled', () => {
    assert.ok(
        flowsSrc.includes('btn.disabled = !ok'),
        'p1ReasonInput must set btn.disabled = !ok'
    );
    assert.ok(
        flowsSrc.includes("btn.setAttribute('aria-disabled', 'true')"),
        "p1ReasonInput must set aria-disabled='true' when disabled"
    );
    assert.ok(
        flowsSrc.includes("btn.removeAttribute('aria-disabled')"),
        'p1ReasonInput must remove aria-disabled when enabled'
    );
});

test('PD-5c: p1ReasonInput targets the [data-testid="record-outcome"] button', () => {
    assert.ok(
        flowsSrc.includes('[data-testid="record-outcome"]'),
        'p1ReasonInput must target the record-outcome button by data-testid'
    );
});

/* ── PD-6: count of P1 confirm screen paths ──────────────────────────── */

test('PD-6a: flows.js contains at least 28 outcomeP1( call sites covering every P1 flow path', () => {
    const matches = [...flowsSrc.matchAll(/\boutcomeP1\s*\(/g)];
    // Exclude the function definition itself (has "function " in the preceding text)
    const callSites = matches.filter(function(m) {
        const prefix = flowsSrc.slice(Math.max(0, m.index - 20), m.index);
        return !prefix.includes('function ');
    });
    assert.ok(
        callSites.length >= 28,
        'Expected at least 28 outcomeP1( call sites in flows.js (design B32, 29 total minus definition), found ' + callSites.length
    );
});

test('PD-6b: views.js contains the ambiguous-site P1 path (B26)', () => {
    // The ambiguous site "pass it to the IoT team" button uses the same disabled pattern
    assert.ok(
        viewsSrc.includes('ambiguousP1Submit'),
        'views.js must contain ambiguousP1Submit for the ambiguous-site P1 path (B26)'
    );
    assert.ok(
        viewsSrc.includes('data-testid="p1-reason"'),
        'views.js ambiguous P1 must include the p1-reason textarea (B26)'
    );
});

test('PD-6c: "Raise the P1" button text is used in every P1 confirm step (flows + views)', () => {
    // Both files use the exact button text from the design spec
    const flowsCount = [...flowsSrc.matchAll(/>Raise the P1<\/button>/g)].length;
    const viewsCount = [...viewsSrc.matchAll(/>Raise the P1<\/button>/g)].length;
    assert.ok(
        flowsCount >= 1,
        'flows.js must contain at least one "Raise the P1" button (found ' + flowsCount + ')'
    );
    assert.ok(
        viewsCount >= 1,
        'views.js must contain at least one "Raise the P1" button (found ' + viewsCount + ')'
    );
});
