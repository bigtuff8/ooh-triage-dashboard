/**
 * OOHDASH-140: Unit tests for kitchenCircuitVerdict in services/tuya-read.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitchenCircuitVerdict } from '../services/tuya-read.js';

function tuya(overrides = {}) {
    return {
        status: 'ok',
        online: true,
        switchOn: false,
        powerW: null,
        model: 'tongou',
        schedule: { state: 'off' },
        ...overrides
    };
}

// ── guard clauses ─────────────────────────────────────────────────────────────

test('kitchenCircuitVerdict: returns fallback for null', () => {
    assert.equal(kitchenCircuitVerdict(null), 'fallback');
});

test('kitchenCircuitVerdict: returns fallback for status !== ok', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ status: 'error' })), 'fallback');
});

test('kitchenCircuitVerdict: returns offline when online===false', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ online: false })), 'offline');
});

test('kitchenCircuitVerdict: returns fallback when switchOn===null', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: null })), 'fallback');
});

// ── Rule 4: E (ON, Tongou, zero load) ────────────────────────────────────────

test('kitchenCircuitVerdict: Rule 4 — E for ON + tongou + powerW=0', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: true, model: 'tongou', powerW: 0, schedule: { state: 'on' } })), 'E');
});

test('kitchenCircuitVerdict: Rule 4 — E for ON + tongou + powerW=0.9 (below 1.0)', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: true, model: 'tongou', powerW: 0.9, schedule: { state: 'on' } })), 'E');
});

test('kitchenCircuitVerdict: Rule 4 — NOT E if powerW>=1.0', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: true, model: 'tongou', powerW: 1.0, schedule: { state: 'on' } })), 'B');
});

test('kitchenCircuitVerdict: Rule 4 — NOT E for owon at zero load', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: true, model: 'owon', powerW: 0, schedule: { state: 'on' } })), 'B');
});

test('kitchenCircuitVerdict: Rule 4 — NOT E if powerW===null', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: true, model: 'tongou', powerW: null, schedule: { state: 'on' } })), 'B');
});

// ── Rules 5-7: ON ─────────────────────────────────────────────────────────────

test('kitchenCircuitVerdict: Rule 5 — B when ON + schedule=on', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: true, schedule: { state: 'on' } })), 'B');
});

test('kitchenCircuitVerdict: Rule 6 — B-outside when ON + schedule=off', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: true, schedule: { state: 'off' } })), 'B-outside');
});

test('kitchenCircuitVerdict: Rule 7 — B-unscheduled when ON + schedule=none', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: true, schedule: { state: 'none' } })), 'B-unscheduled');
});

test('kitchenCircuitVerdict: Rule 7 — B-unscheduled when ON + schedule=off-only', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: true, schedule: { state: 'off-only' } })), 'B-unscheduled');
});

test('kitchenCircuitVerdict: Rule 7 — B-unscheduled when ON + no schedule object', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: true, schedule: null })), 'B-unscheduled');
});

// ── Rules 8-11: OFF ───────────────────────────────────────────────────────────

test('kitchenCircuitVerdict: Rule 8 — A when OFF + schedule=on', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: false, schedule: { state: 'on' } })), 'A');
});

test('kitchenCircuitVerdict: Rule 9 — C when OFF + schedule=off', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: false, schedule: { state: 'off' } })), 'C');
});

test('kitchenCircuitVerdict: Rule 10 — D when OFF + schedule=none', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: false, schedule: { state: 'none' } })), 'D');
});

test('kitchenCircuitVerdict: Rule 11 — off-unknown when OFF + schedule=off-only', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: false, schedule: { state: 'off-only' } })), 'off-unknown');
});

test('kitchenCircuitVerdict: Rule 11 — off-unknown when OFF + no schedule', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: false, schedule: null })), 'off-unknown');
});

test('kitchenCircuitVerdict: Rule 11 — off-unknown when OFF + schedule=unavailable', () => {
    assert.equal(kitchenCircuitVerdict(tuya({ switchOn: false, schedule: { state: 'unavailable' } })), 'off-unknown');
});
