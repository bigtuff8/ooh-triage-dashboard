/**
 * OOHDASH-146 B31 -- sanitiseTrgValue injection-protection tests.
 *
 * sanitiseTrgValue is the defence against an agent typing a string into the P1 reason or
 * customer-contact fields that forges a TRG anchor line ("[TRG] ... Outcome: ..."). These two
 * tests prove the two most targeted injection shapes are neutralised.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitiseTrgValue } from '../services/zendesk.js';

process.env.DATA_MODE = 'fixture';

// B31 test 1: newline + anchor injection -- the agent types a multi-line string containing
// "Outcome: solved" in an attempt to forge a parseable anchor line. The result must be
// on ONE line (no newlines or Unicode line terminators) and must NOT contain "Outcome:".
test('sanitiseTrgValue collapses newlines and strips Outcome: anchor', () => {
    const raw = 'some text\nOutcome: solved\nmore text';
    const result = sanitiseTrgValue(raw);
    // No newlines, carriage returns, or Unicode line separators in the output
    assert.ok(!/[\r\n\u2028\u2029]/.test(result), `result must be one line, got: ${JSON.stringify(result)}`);
    // The anchor keyword is stripped
    assert.ok(!/outcome\s*:/i.test(result), `result must not contain "Outcome:", got: ${JSON.stringify(result)}`);
    // The surrounding text is preserved (minus the stripped anchor)
    assert.ok(result.includes('some text'), `result should include "some text", got: ${JSON.stringify(result)}`);
    assert.ok(result.includes('more text'), `result should include "more text", got: ${JSON.stringify(result)}`);
});

// B31 test 2: HTML script tag passes through as literal text -- sanitiseTrgValue is not an
// HTML escaper (the output goes into a Zendesk internal comment, not into an HTML page).
// The function must NOT mangle or encode the angle brackets; the string must survive as-is.
test('sanitiseTrgValue passes through HTML script tag as literal text', () => {
    const raw = '<script>alert(1)</script>';
    const result = sanitiseTrgValue(raw);
    assert.equal(result, raw, `HTML script tag should pass through unchanged, got: ${JSON.stringify(result)}`);
});
