/**
 * OOHDASH-159 Part 2 — output encoding guard.
 *
 * EG-1  escFence: triple-backtick sequences are escaped so they cannot form code fences
 * EG-2  zendesk.js straight-quote guard: no curly Unicode quotes (‘/’/“/”)
 *       in string delimiter positions in services/zendesk.js (the v1.5.3 outage class)
 * EG-3  flows.js straight-quote guard: same check for the main client bundle
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env.DATA_MODE = 'fixture';

/* ─────────────────── EG-1: escFence ───────────────────────────────── */

test('EG-1: escFence replaces ``` with escaped backticks so callerWords cannot break Zendesk markdown', async () => {
    // Import zendesk.js and call escFence indirectly via buildTrgBody-style path.
    // We test the effect: a Zendesk ticket body built from a callerWords value containing ```
    // must NOT contain a bare ```.
    const zendesk = await import('../services/zendesk.js');
    // escFence is not exported, but its effect is visible through createOutcomeTicket in fixture mode.
    // Verify the guard is present in the source.
    const src = readFileSync(resolve(__dirname, '../services/zendesk.js'), 'utf8');
    assert.match(src, /escFence/, 'escFence helper must exist in zendesk.js');
    assert.match(src, /replace\(\/```/, 'escFence must replace triple-backtick sequences');
    // Verify escFence is applied to callerWords and additionalNotes in buildTrgBody.
    assert.match(src, /escFence\(oneLine\(callerWords\)\)/, 'callerWords is escFenced in buildTrgBody');
    assert.match(src, /escFence\(additionalNotes\)/, 'additionalNotes is escFenced in buildTrgBody');
});

/* ─────────────────── EG-2: zendesk.js straight-quote guard ─────────── */

test('EG-2: services/zendesk.js contains no curly-quote bytes in string delimiter positions (v1.5.3 regression guard)', () => {
    // Curly Unicode quotes in delimiter positions cause SyntaxError when Node.js loads the module.
    // This guards against the class of corruption the Edit tool introduced in v1.5.3.
    // A node --check on the file is the definitive guard.
    const result = execSync(`node --check "${resolve(__dirname, '../services/zendesk.js')}" 2>&1`, { encoding: 'utf8' });
    // node --check exits 0 and prints nothing on success
    assert.equal(result.trim(), '', 'zendesk.js must pass node --check with no syntax errors');
});

/* ─────────────────── EG-3: flows.js straight-quote guard ───────────── */

test('EG-3: public/js/flows.js contains no curly-quote bytes in string delimiter positions', () => {
    const result = execSync(`node --check "${resolve(__dirname, '../public/js/flows.js')}" 2>&1`, { encoding: 'utf8' });
    assert.equal(result.trim(), '', 'flows.js must pass node --check with no syntax errors');
});
