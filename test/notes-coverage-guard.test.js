/**
 * OOHDASH-119 (U11) — coverage guard: every api.post call to /api/outcomes or /api/query
 * in the client scripts must include the additionalNotes key.
 *
 * Reads flows.js, views.js and control.js as text and asserts:
 *  - Exactly 5 calls match the pattern (submitPendingOutcome + ambiguousCapture in flows/views,
 *    sendQuery in views, ctlFinish + ctlEscalate in control).
 *  - Each call's context (up to 500 chars after the opening parenthesis) contains "additionalNotes".
 *
 * Runs under `node --test`. No network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// OOHDASH-123: +1 for the DD-WAIT-HANDOFF ctlRelease outcome post (slow-class "sent, awaiting confirm").
const EXPECTED_CALL_COUNT = 6;

function checkFile(relPath) {
    const src = readFileSync(join(root, relPath), 'utf8');
    // Find every api.post(...) call targeting /outcomes or /query endpoints
    const callRe = /api\.post\s*\(\s*['"`][^'"`]*\/(outcomes|query)/g;
    const results = [];
    let m;
    while ((m = callRe.exec(src)) !== null) {
        // Extract up to 500 chars following the opening parenthesis of the call
        const start = m.index;
        const context = src.slice(start, start + 500);
        results.push({ file: relPath, context, hasAdditionalNotes: context.includes('additionalNotes') });
    }
    return results;
}

test('U11: every api.post call to outcomes/query in client scripts includes additionalNotes', () => {
    const allResults = [
        ...checkFile('public/js/flows.js'),
        ...checkFile('public/js/views.js'),
        ...checkFile('public/js/control.js')
    ];

    // Assert the total count is exactly EXPECTED_CALL_COUNT
    assert.equal(
        allResults.length,
        EXPECTED_CALL_COUNT,
        `Expected exactly ${EXPECTED_CALL_COUNT} api.post calls to /outcomes or /query, found ${allResults.length}. ` +
        `Check that all submit paths carry additionalNotes and that the regex covers them.\n` +
        `Found calls:\n${allResults.map(r => `  ${r.file}: ...${r.context.slice(0, 80)}...`).join('\n')}`
    );

    // Assert every call includes additionalNotes in its context
    for (const r of allResults) {
        assert.ok(
            r.hasAdditionalNotes,
            `MISSING additionalNotes in ${r.file}: "${r.context.slice(0, 120)}"`
        );
    }
});
