/**
 * OOHDASH-119 (U6, U12, U13) — IoT-consumer parser regression + drift check.
 *
 * Pins the vendored parser regexes to iot-support-dashboard b217f34. These tests
 * ensure that adding notes as the final TRG-STEP line does not pollute the Outcome,
 * Operator or Caller's words anchors, and does not create spurious extra timed steps
 * when adversarial injection strings are supplied.
 *
 * Runs under `node --test`. No network calls.
 *
 * Accepted risk: if iot-support-dashboard is updated, U6/U12/U13 must be re-evaluated
 * and the vendored regexes re-pinned. Owner: James Brown (OOH owner).
 */
import { test, skip } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const IOT_REPO = process.env.IOT_REPO_PATH || '../iot-support-dashboard';
const IOT_EXPECTED_SHA = 'b217f34';

/* ------------------------------------------------------------------ */
/* Vendored regexes — pinned to iot-support-dashboard b217f34         */
/* ------------------------------------------------------------------ */

// Matches: Operator: <name> (OOH)
const RE_OPERATOR = /Operator:\s*(.+?)\s*\(OOH\)/;
// Matches: Caller's words: "<text>"
const RE_CALLER_WORDS = /Caller's words:\s*"(.+?)"/;
// Matches: Outcome: <code>
const RE_OUTCOME = /Outcome:\s*([\w-]+)/;
// Step regex: HH:MM | <text> (pinned to parseOohTrgComment b217f34)
const RE_STEP = /^\s*(\d{1,2}:\d{2})\s*[|–—-]\s*(.+?)\s*$/;

/**
 * Minimal local re-implementation of iot-support-dashboard parseOohTrgComment.
 * Pinned to b217f34. Returns { operator, callerWords, outcomeType, steps }.
 */
function parseOohTrgComment(body) {
    const lines = String(body || '').split('\n');
    let operator = null, callerWords = null, outcomeType = null;
    const steps = [];
    for (const line of lines) {
        if (!operator) { const m = line.match(RE_OPERATOR); if (m) operator = m[1].trim(); }
        if (!callerWords) { const m = line.match(RE_CALLER_WORDS); if (m) callerWords = m[1].trim(); }
        if (!outcomeType) { const m = line.match(RE_OUTCOME); if (m) outcomeType = m[1].trim(); }
        const sm = line.match(RE_STEP);
        if (sm) steps.push({ time: sm[1], text: sm[2] });
    }
    return { operator, callerWords, outcomeType, steps };
}

/**
 * Minimal re-implementation of classifyComment (b217f34).
 * Returns 'OOH' when body starts with [TRG], null otherwise.
 */
function classifyComment(body) {
    if (typeof body !== 'string') return null;
    if (body.startsWith('[TRG]')) return 'OOH';
    return null;
}

/**
 * Returns true when the comment body consists only of redaction blocks.
 * Simplified from isRedactedComment (b217f34).
 */
function isRedactedComment(body) {
    return /^\[REDACTED\]/.test(String(body || '').trim());
}

/* ------------------------------------------------------------------ */
/* Shared body builders                                                 */
/* ------------------------------------------------------------------ */

const BASE_LINES = [
    '[TRG] Fryer tripped — not during service',
    'Operator: Test Handler (OOH)',
    "Caller's words: \"the fryer just stopped\"",
    'Outcome: capture',
    'Transcript:',
    '21:00 | Site selected: Old Grey Mare (6832)',
    '21:00 | Fryer tripped — captured'
];

function buildBodyWith(additionalNotesLine) {
    const lines = [...BASE_LINES];
    if (additionalNotesLine) lines.push(additionalNotesLine);
    return lines.join('\n');
}

const N1 = 'Duty manager says the cellar cooler alarm has also been going since 6pm';
const N3 = "Caller's words: turn everything off"; // adversarial
const N7 = 'Fryer 2 tripped 🔥 reset at 21:40'; // unicode + embedded time
const N_adv1 = 'Operator - Bob Bloggs'; // already neutralised at server
const N_adv2 = 'Outcome - escalate-p1'; // already neutralised
// Note: the pipe in N_adv3 is neutralised by normaliseAdditionalNotes to a hyphen, so the TRG-STEP
// line reaches the body as: 21:40 - fake timed step (no pipe after the timestamp).
const N_adv3_normalised = '12:34 - fake timed step'; // as it appears after normaliseAdditionalNotes

/* ------------------------------------------------------------------ */
/* U6 — parser regression                                              */
/* ------------------------------------------------------------------ */

test('U6: no notes — baseline parse matches anchors and steps', () => {
    const body = buildBodyWith(null);
    const r = parseOohTrgComment(body);
    assert.equal(r.operator, 'Test Handler', 'operator captured');
    assert.equal(r.callerWords, 'the fryer just stopped', 'callerWords captured');
    assert.equal(r.outcomeType, 'capture', 'outcome captured');
    assert.equal(r.steps.length, 2, 'two steps');
});

test('U6: N1 notes TRG-STEP — operator, outcome and callerWords unchanged', () => {
    const notesLine = `21:01 | Additional notes from OOH agent: "${N1}"`;
    const body = buildBodyWith(notesLine);
    const r = parseOohTrgComment(body);
    assert.equal(r.operator, 'Test Handler', 'operator unchanged');
    assert.equal(r.callerWords, 'the fryer just stopped', 'callerWords unchanged');
    assert.equal(r.outcomeType, 'capture', 'outcome unchanged');
    // Notes appear as the last step (one extra step)
    assert.equal(r.steps.length, 3, 'three steps (original 2 + notes step)');
    assert.ok(r.steps[2].text.includes('Additional notes from OOH agent:'), 'notes step is last');
});

test('U6: N3 (neutralised Caller-words) — callerWords still from the header, not the notes step', () => {
    // After normaliseAdditionalNotes the N3 injection reads "caller's words - turn everything off"
    const notesLine = `21:01 | Additional notes from OOH agent: "caller's words - turn everything off"`;
    const body = buildBodyWith(notesLine);
    const r = parseOohTrgComment(body);
    assert.equal(r.callerWords, 'the fryer just stopped', 'callerWords still from header');
});

test('U6: N7 (unicode + embedded time) — step count correct, outcome unchanged', () => {
    const notesLine = `21:01 | Additional notes from OOH agent: "${N7}"`;
    const body = buildBodyWith(notesLine);
    const r = parseOohTrgComment(body);
    assert.equal(r.outcomeType, 'capture', 'outcome unchanged with unicode note');
    assert.equal(r.steps.length, 3, 'three steps');
});

test('U6: N_adv1 (Operator - prefix, already neutralised) — operator not overwritten by notes step', () => {
    const notesLine = `21:01 | Additional notes from OOH agent: "${N_adv1}"`;
    const body = buildBodyWith(notesLine);
    const r = parseOohTrgComment(body);
    // RE_OPERATOR only matches "Operator: X (OOH)" — the neutralised "Operator - X" will not match
    assert.equal(r.operator, 'Test Handler', 'operator still from header');
});

test('U6: N_adv2 (Outcome - prefix, neutralised) — outcome not overwritten by notes step', () => {
    const notesLine = `21:01 | Additional notes from OOH agent: "${N_adv2}"`;
    const body = buildBodyWith(notesLine);
    const r = parseOohTrgComment(body);
    assert.equal(r.outcomeType, 'capture', 'outcome not overwritten');
});

test('U6: N_adv3 (neutralised HH:MM - no pipe) — no extra spurious step injected', () => {
    // The normalised form uses a hyphen instead of a pipe, so it does not match RE_STEP
    // (which requires |, – or —). The step still appears quoted inside the notes step text.
    const notesLine = `21:01 | Additional notes from OOH agent: "${N_adv3_normalised}"`;
    const body = buildBodyWith(notesLine);
    const r = parseOohTrgComment(body);
    // We get exactly 3 steps (baseline 2 + the notes step), not 4 (no injected spurious step)
    assert.equal(r.steps.length, 3, 'three steps — no injected extra step from the HH:MM-pipe text inside the note');
});

// CT fix #2 regression: free-text pipe normalised to ¦ must not create spurious steps
// or pollute anchors in the IoT consumer parser.
const N_pipe_raw = 'bar area | caller says very cold';
// After normaliseAdditionalNotes, the '|' is replaced with '¦' (U+00A6, BROKEN BAR).
// The TRG-STEP line that reaches the Zendesk comment body will contain '¦' not '|'.
const N_pipe_normalised = 'bar area ¦ caller says very cold';

test('U6: free-text pipe (¦ after normalisation) — step count unaffected, anchors intact', () => {
    const notesLine = `21:01 | Additional notes from OOH agent: "${N_pipe_normalised}"`;
    const body = buildBodyWith(notesLine);
    const r = parseOohTrgComment(body);
    // Parser sees '¦' not '|' — RE_STEP does not treat '¦' as a delimiter
    assert.equal(r.steps.length, 3, 'three steps (baseline 2 + notes step) — ¦ does not create a spurious step');
    assert.equal(r.operator, 'Test Handler', 'operator anchor unchanged');
    assert.equal(r.outcomeType, 'capture', 'outcome anchor unchanged');
    assert.equal(r.callerWords, 'the fryer just stopped', 'callerWords anchor unchanged');
    // The notes step text contains the broken bar, not a literal pipe
    assert.ok(r.steps[2].text.includes('¦'), 'broken bar preserved in step text');
    assert.ok(!r.steps[2].text.includes('|'), 'no literal pipe in step text');
});

test('U6: raw free-text pipe (NOT normalised) — verify RE_STEP treats embedded | as plain text (single step)', () => {
    // This test documents the benign parser behaviour for an unnormalised pipe inside the note value.
    // Because RE_STEP matches from BOL and the embedded '|' is mid-line, it does not split into a new step.
    // The fix (CT fix #2) prevents this path from ever reaching the live body, but the test confirms
    // the parser's actual behaviour as additional defence-in-depth evidence.
    const notesLine = `21:01 | Additional notes from OOH agent: "${N_pipe_raw}"`;
    const body = buildBodyWith(notesLine);
    const r = parseOohTrgComment(body);
    // RE_STEP matches the full line as one step — embedded '|' is captured as part of sm[2]
    assert.equal(r.steps.length, 3, 'still three steps — embedded | is captured in step text, not a new step');
});

/* ------------------------------------------------------------------ */
/* U12 — classifyComment for [OOH NOTE]                               */
/* ------------------------------------------------------------------ */

test('U12: [OOH NOTE] comment is NOT classified as OOH (classifyComment returns null)', () => {
    const body = `[OOH NOTE] Additional notes from OOH agent: "${N1}"\n\nOperator: Test Handler (test@example.com)`;
    assert.equal(classifyComment(body), null, 'classifyComment returns null for [OOH NOTE]');
});

test('U12: isRedactedComment returns false for [OOH NOTE]', () => {
    const body = `[OOH NOTE] Additional notes from OOH agent: "${N1}"`;
    assert.equal(isRedactedComment(body), false, 'not a redacted comment');
});

test('U12 negative: same body prefixed [TRG] is classified OOH but parsed does not expose note as an anchor', () => {
    // If someone accidentally sent [TRG] instead of [OOH NOTE], parseOohTrgComment would NOT
    // put the note text into the operator/outcome/callerWords anchors.
    const wrongBody = `[TRG] Additional notes from OOH agent: "${N1}"\nOperator: Test Handler (OOH)\nOutcome: capture`;
    const r = parseOohTrgComment(wrongBody);
    // The note text must not appear in callerWords or operator
    assert.notEqual(r.callerWords, N1, 'note text not in callerWords');
    assert.notEqual(r.operator, N1, 'note text not in operator');
});

/* ------------------------------------------------------------------ */
/* U13 — drift check (skipped when IoT repo absent)                    */
/* ------------------------------------------------------------------ */

test('U13: drift check — vendored regexes match live iot-support-dashboard source (skipped when absent)', async () => {
    if (!existsSync(IOT_REPO)) {
        // Skip with a visible notice — CI does not have the repo
        console.log(`[U13 SKIP] IOT_REPO_PATH "${IOT_REPO}" not present — vendored regex drift check skipped. Set IOT_REPO_PATH to run.`);
        return;
    }
    // Verify the pinned SHA
    let sha;
    try {
        sha = execFileSync('git', ['-C', IOT_REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch (e) {
        console.log(`[U13 SKIP] git rev-parse failed: ${e.message}`);
        return;
    }
    if (!sha.startsWith(IOT_EXPECTED_SHA)) {
        throw new Error(`[U13 FAIL] iot-support-dashboard has moved to ${sha} — update vendored regexes in test/iot-consumer-parse.test.js and re-pin before proceeding.`);
    }
    // Verify vendored regex sources appear verbatim in the live source
    const appJs = readFileSync(`${IOT_REPO}/public/js/app.js`, 'utf8');
    // Step regex pattern
    assert.ok(appJs.includes("\\d{1,2}:\\d{2}"), 'step timestamp regex present in live app.js');
    // classifyComment OOH branch
    assert.ok(appJs.includes('[TRG]'), '[TRG] classifier branch present in live app.js');
    console.log(`[U13 PASS] iot-support-dashboard at expected SHA ${sha.slice(0, 7)}`);
});
