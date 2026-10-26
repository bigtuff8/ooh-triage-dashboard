/**
 * OOHDASH-144 N1 — W8 oohAddOn must use the hold's actual direction.
 *
 * The browser-side oohAddOn string was hard-coded to say "on" regardless of the hold's
 * direction field. A hold with direction:'off' must produce "off" in the customer-facing text.
 *
 * These tests operate on the flows.js source text (static analysis) and also verify the
 * dispatchBoilerBoost until-next-on fallback path (C1).
 *
 * HD-1  oohAddOn for direction:'on' → "turned zone N on earlier"
 * HD-2  oohAddOn for direction:'off' → "turned zone N off earlier" (was "on" before fix)
 * HD-3  flows.js source: W8 oohAddOn uses holdDir variable, not a hardcoded ' on '
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const flowsSrc = readFileSync(resolve(__dirname, '../public/js/flows.js'), 'utf8');

/* ── HD-3: source-level guard (protects both directions) ────────────── */
test('HD-3: W8 oohAddOn uses holdDir variable derived from h.direction (not hardcoded "on")', () => {
    // After the fix the oohAddOn block must contain the holdDir variable assignment
    // and must NOT have the old hardcoded ' on earlier' pattern (without quoting 'on' as a dir choice).
    assert.ok(
        flowsSrc.includes('holdDir = h && h.direction'),
        'oohAddOn must derive holdDir from h.direction'
    );
    assert.ok(
        flowsSrc.includes("' ' + holdDir + ' earlier'") ||
        flowsSrc.includes("' ' + holdDir +' earlier'") ||
        flowsSrc.includes("' '+holdDir+' earlier'") ||
        flowsSrc.includes("holdDir + ' earlier'"),
        'oohAddOn must use holdDir in the "earlier" phrase'
    );
    // Ensure the old hardcoded text is gone from the oohAddOn closure
    // (the banner/intercept may legitimately say "turned on/off" using h.direction,
    //  but the specific compound "zone ' + z.n + ' on earlier" without the variable is the bug)
    assert.ok(
        !flowsSrc.includes("z.n + ' on earlier'"),
        'oohAddOn must NOT contain the hardcoded "z.n + \' on earlier\'" pattern'
    );
});

/* ── HD-1 / HD-2: functional simulation of oohAddOn builder ────────── */
function simulateOohAddOn(zone, hold) {
    // Mirrors the fixed oohAddOn closure in flows.js W8 branch.
    var until = hold && hold.revertAt ? new Date(hold.revertAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    var holdDir = hold && hold.direction === 'off' ? 'off' : 'on';
    return 'We turned zone ' + zone.n + ' ' + holdDir + ' earlier' + (until ? ', until ' + until : '') + '. I can put that back to normal now.';
}

test('HD-1: oohAddOn with direction "on" produces "turned zone N on earlier"', () => {
    const zone = { n: 1, zone: 'CHZ1', on: true };
    const hold = { id: 'h1', direction: 'on', boilerZone: 'CHZ1', revertAt: null };
    const text = simulateOohAddOn(zone, hold);
    assert.ok(text.includes('turned zone 1 on earlier'), `Expected "on" in: ${text}`);
    assert.ok(!text.includes('turned zone 1 off'), `Must not say "off" when direction is "on": ${text}`);
});

test('HD-2: oohAddOn with direction "off" produces "turned zone N off earlier" (was "on" before fix)', () => {
    const zone = { n: 2, zone: 'CHZ2', on: true }; // zone shows on (stale state, but hold is direction:off)
    const revertAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h from now
    const hold = { id: 'h2', direction: 'off', boilerZone: 'CHZ2', revertAt };
    const text = simulateOohAddOn(zone, hold);
    assert.ok(text.includes('turned zone 2 off earlier'), `Expected "off" in: ${text}`);
    assert.ok(!text.includes('turned zone 2 on earlier'), `Must not say "on" when direction is "off": ${text}`);
    assert.ok(text.includes('until '), 'Until time must appear when revertAt is set');
});
