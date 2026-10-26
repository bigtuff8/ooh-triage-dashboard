/**
 * OOHDASH-144 C4 — pub heating agent-visible string guard.
 *
 * Checks that no banned words (design section 12 glossary) appear in
 * agent-visible strings or log sentences within the pub heating (boiler-panel) flow.
 *
 * Banned in agent-visible pub heating strings:
 *   - "panel" / "Panel"  (use "heating controls")
 *   - "forced" / "Forced" (use "switched off by hand")
 *   - "fallback" (use "back-up" or "timed back-up")
 *   - "Caller" as a subject/noun (use "Customer")
 *   - "caller" in agent-visible sentences (use "customer")
 *
 * The test extracts W1-W9 log sentences and other pub heating readout strings
 * from flows.js source by pattern-matching the known line structure, then asserts
 * none of the banned terms appear. JS comments and developer labels are excluded.
 *
 * PH-BW-1  No banned words in W1-W9 log sentences
 * PH-BW-2  Area question uses "customer" not "caller"
 * PH-BW-3  Readout "no reading" string uses "heating controls" not "panel"
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const flowsSrc = readFileSync(resolve(__dirname, '../public/js/flows.js'), 'utf8');

/**
 * Extract all bpLogSegs.push(...) string arguments from the flows.js source.
 * These are the W1-W9 log sentences shown in the "What we'll log" section.
 */
function extractLogSentences(src) {
    const re = /bpLogSegs\.push\((['"`])([\s\S]*?)\1\)/g;
    const results = [];
    let m;
    while ((m = re.exec(src)) !== null) {
        results.push(m[2]);
    }
    return results;
}

/**
 * Extract string arguments to specific stepq/zoneread div innerHTML from flows.js.
 */
function extractReadoutStrings(src) {
    const results = [];
    // "Pub heating controls" / "Pub boiler panel" - the no-reading label
    const noReadRe = /zoneread.*?small.*?>(.*?)<\/span>/g;
    let m;
    while ((m = noReadRe.exec(src)) !== null) results.push(m[1]);
    return results;
}

/* ── PH-BW-1: W1-W9 log sentences ──────────────────────────────────── */
test('PH-BW-1: W1-W9 log sentences contain no banned words (panel, forced, fallback, Caller)', () => {
    const sentences = extractLogSentences(flowsSrc);
    assert.ok(sentences.length >= 7, 'Expected at least 7 log sentences (W1-W9), got ' + sentences.length);

    const banned = [
        { word: /\bpanel\b/i, why: 'use "heating controls" (glossary)' },
        { word: /\bforced\b/i, why: 'use "switched off by hand" (glossary)' },
        { word: /\bfallback\b/i, why: 'use "timed back-up" (glossary)' },
        { word: /\bCaller\b/, why: 'use "Customer" (glossary); lowercase "caller" in internal context only' }
    ];

    for (const sentence of sentences) {
        for (const { word, why } of banned) {
            assert.ok(
                !word.test(sentence),
                `Log sentence contains banned term "${word}" (${why}): "${sentence}"`
            );
        }
    }
});

/* ── PH-BW-2: Area question uses "customer" ─────────────────────────── */
test('PH-BW-2: Area question uses "customer" not "caller" (C5 fix)', () => {
    // The area-chip question: "Which area is the customer talking about?"
    const areaQRe = /Which area is the (caller|customer) talking about\?/;
    const m = areaQRe.exec(flowsSrc);
    assert.ok(m, 'Expected to find the area question in flows.js');
    assert.equal(m[1], 'customer',
        'Area question must say "customer", found "' + m[1] + '" — C5 fix not applied');
});

/* ── PH-BW-3: No-reading label uses "heating controls" ──────────────── */
test('PH-BW-3: zoneread no-reading label uses "heating controls" not "Pub boiler panel"', () => {
    assert.ok(
        flowsSrc.includes('Pub heating controls — no reading') ||
        flowsSrc.includes('Pub heating controls -- no reading') ||
        flowsSrc.includes('Pub heating controls – no reading') ||
        flowsSrc.includes('Pub heating controls — no reading'),
        'Expected "Pub heating controls — no reading" in flows.js zoneread (C4 fix)'
    );
    assert.ok(
        !flowsSrc.includes('Pub boiler panel — no reading'),
        '"Pub boiler panel — no reading" must be gone after C4 fix'
    );
});

// PH-BW-4: the next-on clause reads "at 06:30 tomorrow", never "at tomorrow 06:30".
// Every ", which next comes on at " must be followed directly by a time value, not a day prefix.
test('PH-BW-4: next-on clause puts the time before the day', () => {
    const re = /', which next comes on at ' \+ ([A-Za-z0-9_.]+)/g;
    const found = [];
    let m;
    while ((m = re.exec(flowsSrc)) !== null) found.push(m[1]);
    assert.ok(found.length >= 5, `expected at least 5 next-on clauses, found ${found.length}`);
    for (const v of found) {
        assert.match(v, /time/i, `next-on clause must start with the time, got "${v}"`);
    }
});

// PH-BW-5: every agent-visible string in the pub heating screens follows the design §12 glossary.
// Scans string literals (HTML tags stripped) in the pub heating section of flows.js, the
// "We've changed the heating" banner in views.js, and the server messages the screens display.
const GLOSSARY_NEVER = /\b(boost|boosted|hold|holds|heat on|heat off|override|forc(e|ed|ing)|revert|undo|schedule|summer mode|back-up|backup|fallback|iot team|trg|chz\d|output\d|w[1-9]|setpoint|panel|caller|operator|doesn.t take|offline|gateway|salus|token)\b/i;
function visibleStringViolations(src) {
    const out = [];
    src.split('\n').forEach(function(line, i) {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        for (const m of line.matchAll(/(["'`])((?:\.|(?!\1).)*)\1/g)) {
            const text = m[2].replace(/<[^>]*>?/g, ' ').replace(/^[^<]*>/, ' ');
            if (!/[a-z]{2,} [a-z]{2,}/i.test(text) || /querySelector|getElementById|flowStep\(/.test(m[2])) continue;
            if (/^\[[A-Z ]+\]/.test(text.trim())) continue; // server log/alert prefixes, never shown
            const bad = text.match(GLOSSARY_NEVER);
            if (bad) out.push((i + 1) + ': [' + bad[0] + '] ' + text.trim().slice(0, 120));
        }
    });
    return out;
}
function between(src, startMarker, endMarker) {
    const a = src.indexOf(startMarker), b = src.indexOf(endMarker, a + 1);
    assert.ok(a >= 0 && b > a, 'section markers not found: ' + startMarker + ' .. ' + endMarker);
    return src.slice(a, b);
}

test('PH-BW-5: pub heating screens and banner use only glossary words', () => {
    const viewsSrc = readFileSync(resolve(__dirname, '../public/js/views.js'), 'utf8');
    const sections = [
        between(flowsSrc, 'function bpOutcomeCard(', 'function bpZoneContinue('),
        between(viewsSrc, 'function renderBoostHoldBanner(', 'function holdBannerKeep('),
        between(viewsSrc, 'function holdBannerConfirmYes(', '\n}\n'),
    ];
    const violations = sections.flatMap(visibleStringViolations);
    assert.deepEqual(violations, [], 'glossary words found:\n' + violations.join('\n'));
});

test('PH-BW-6: server messages shown on the pub heating screens use only glossary words', () => {
    const controlSrc = readFileSync(resolve(__dirname, '../services/control.js'), 'utf8');
    const windowSrc = readFileSync(resolve(__dirname, '../services/boost-window.js'), 'utf8');
    const messages = [];
    const boost = between(controlSrc, 'export async function dispatchBoilerBoost(', 'const clampResult');
    for (const m of boost.matchAll(/new Error\((["'`])((?:\.|(?!\1).)*)\1\)|message: (["'`])((?:\.|(?!\3).)*)\3/g)) messages.push(m[2] || m[4]);
    for (const m of windowSrc.matchAll(/message: (["'`])((?:\.|(?!\1).)*)\1/g)) messages.push(m[2]);
    assert.ok(messages.length >= 10, 'expected the boost refusal and error messages, found ' + messages.length);
    const bad = messages.filter(function(t) { return GLOSSARY_NEVER.test(t); });
    assert.deepEqual(bad, [], 'glossary words in server messages:\n' + bad.join('\n'));
});
