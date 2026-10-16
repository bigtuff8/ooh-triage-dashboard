/**
 * OOHDASH-134 — otherP1Summary (text-message summary for a "Something else" P1), AC3.
 * Pattern: vm sandbox (same as test/legacy-salus-flow.test.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

function loadClient() {
    const state = { flow: null, workspace: null };
    const sandbox = { state, esc: s => String(s), flowStep: () => {}, render: () => {}, console };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    const src = readFileSync(new URL('../public/js/flows.js', import.meta.url), 'utf8')
        + '\n;globalThis.otherP1Summary = otherP1Summary; globalThis.otherP1Reason = otherP1Reason; globalThis.otherP1Choice = otherP1Choice;';
    vm.runInContext(src, ctx, { filename: 'flows.js' });
    return sandbox;
}

const c = loadClient();

test('short text is prefixed and not cut', () => {
    assert.equal(c.otherP1Summary('Gas smell in cellar'), 'Something else: Gas smell in cellar');
});

test('exactly 80 characters including the prefix is not cut', () => {
    const body = 'x'.repeat(80 - 'Something else: '.length);
    const out = c.otherP1Summary(body);
    assert.equal(out.length, 80);
    assert.ok(!out.endsWith('...'));
});

test('140 characters with line breaks and double spaces -> exactly 80, ends "..."', () => {
    const text = ('Burning smell  from the plant room\nand the extractor\r\n has stopped   mid service ').repeat(2).slice(0, 140);
    const out = c.otherP1Summary(text);
    assert.equal(out.length, 80);
    assert.ok(out.endsWith('...'));
    assert.ok(!/\s{2,}|\n/.test(out));
    assert.ok(out.startsWith('Something else: Burning smell from the plant room and the extractor has'));
});

test('leading and trailing whitespace is trimmed', () => {
    assert.equal(c.otherP1Summary('   leak at bar  \n'), 'Something else: leak at bar');
});

test('empty input falls back defensively', () => {
    assert.equal(c.otherP1Summary(''), 'Something else - see ticket');
    assert.equal(c.otherP1Summary('   '), 'Something else - see ticket');
    assert.equal(c.otherP1Summary(undefined), 'Something else - see ticket');
});

test('reason guard: stage-0 text wins; blank/whitespace is no reason; placeholder never counts', () => {
    assert.equal(c.otherP1Reason({ data: { qraw: ' typed ', p1reason: 'x' } }), 'typed');
    assert.equal(c.otherP1Reason({ data: { qraw: '  ', p1reason: '  ' } }), '');
    assert.equal(c.otherP1Reason({ data: { q: '(not specified)', qraw: '' } }), '');
    assert.equal(c.otherP1Reason({ data: { qraw: '', p1reason: 'Ceiling leak' } }), 'Ceiling leak');
});

test('choice step: labels exact; P1 disabled when no reason, enabled with stage-0 text', () => {
    const blocked = c.otherP1Choice({ data: { qraw: '' } });
    assert.match(blocked, />P1 Escalation</);
    assert.match(blocked, />Raise a Normal Priority ticket</);
    assert.match(blocked, /data-testid="other-p1" onclick="raiseOtherP1\(\)" disabled aria-disabled="true"/);
    assert.match(blocked, /data-testid="other-p1-reason"/);
    const open = c.otherP1Choice({ data: { qraw: 'Leak' } });
    assert.doesNotMatch(open, /disabled/);
    assert.doesNotMatch(open, /other-p1-reason/);
    // Explainer is ASCII-safe
    const ex = open.slice(open.indexOf('p1-explainer'));
    assert.ok(/^[\x00-\x7F]*$/.test(ex));
});
