/**
 * OOHDASH-140: Unit tests for evaluateSchedule in services/schedule.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSchedule } from '../services/schedule.js';

// Fixed "now" for deterministic tests: Wednesday 2026-10-28 14:30:00 UTC
// BST ended last Sun Oct 25 2026 → now in GMT: 2026-10-28 14:30 UTC = 14:30 London
const NOW = new Date('2026-10-28T14:30:00Z');

function entry(time, loops, on, enabled = true) {
    return { time, loops, on, enabled };
}

// ── state:none ────────────────────────────────────────────────────────────────

test('evaluateSchedule: returns state=none for empty entries', () => {
    const r = evaluateSchedule([], NOW);
    assert.equal(r.state, 'none');
    assert.equal(r.entryCount, 0);
    assert.equal(r.lastChange, null);
    assert.equal(r.nextOn, null);
    assert.equal(r.nextOff, null);
});

test('evaluateSchedule: returns state=none for null entries', () => {
    const r = evaluateSchedule(null, NOW);
    assert.equal(r.state, 'none');
});

test('evaluateSchedule: returns state=none when all entries are disabled', () => {
    const r = evaluateSchedule([
        entry('08:00', '1111111', true, false),
        entry('22:00', '1111111', false, false)
    ], NOW);
    assert.equal(r.state, 'none');
    assert.equal(r.entryCount, 0);
});

test('evaluateSchedule: returns state=none when all loops are 0000000', () => {
    const r = evaluateSchedule([entry('08:00', '0000000', true, true)], NOW);
    assert.equal(r.state, 'none');
});

// ── state:off-only ────────────────────────────────────────────────────────────

test('evaluateSchedule: returns state=off-only when all active entries are OFF', () => {
    const r = evaluateSchedule([
        entry('08:00', '1111111', false, true),
        entry('22:00', '1111111', false, true)
    ], NOW);
    assert.equal(r.state, 'off-only');
    assert.equal(r.entryCount, 2);
});

// ── state:on ──────────────────────────────────────────────────────────────────

test('evaluateSchedule: returns state=on for always-on schedule', () => {
    // ON at 00:00 every day — 00:00 today fired before 14:30 → state=on
    const r = evaluateSchedule([entry('00:00', '1111111', true, true)], NOW);
    assert.equal(r.state, 'on');
    assert.ok(r.lastChange !== null);
    assert.equal(r.lastChange.dayText, 'today');
    assert.equal(r.lastChange.time, '00:00');
});

test('evaluateSchedule: returns state=on when last change was ON at 06:00', () => {
    // ON at 06:00 (< 14:30), OFF at 22:00 (> 14:30)
    const r = evaluateSchedule([
        entry('06:00', '1111111', true, true),
        entry('22:00', '1111111', false, true)
    ], NOW);
    assert.equal(r.state, 'on');
    assert.equal(r.lastChange?.time, '06:00');
    assert.equal(r.lastChange?.dayText, 'today');
});

// ── state:off ─────────────────────────────────────────────────────────────────

test('evaluateSchedule: returns state=off when OFF is most recent', () => {
    // OFF at 00:01 today (< 14:30) — more recent than ON at 23:00 yesterday
    const r = evaluateSchedule([
        entry('00:01', '1111111', false, true),
        entry('23:00', '1111111', true, true)
    ], NOW);
    assert.equal(r.state, 'off');
    assert.equal(r.lastChange?.time, '00:01');
    assert.equal(r.lastChange?.dayText, 'today');
});

// ── same-minute conflict ──────────────────────────────────────────────────────

test('evaluateSchedule: same-minute — OFF wins over ON', () => {
    const r = evaluateSchedule([
        entry('14:00', '1111111', true, true),   // ON at 14:00
        entry('14:00', '1111111', false, true)   // OFF at 14:00
    ], NOW);
    // Both fire at 14:00 today (< 14:30), OFF wins
    assert.equal(r.state, 'off');
});

// ── dayText ───────────────────────────────────────────────────────────────────

test('evaluateSchedule: reports "today" for same-day last change', () => {
    const r = evaluateSchedule([entry('00:00', '1111111', true, true)], NOW);
    assert.equal(r.lastChange?.dayText, 'today');
});

test('evaluateSchedule: reports "yesterday" for previous-day last change', () => {
    // Tuesday only (position 2 in sun-first = Tue), fired at 08:00 Tuesday = yesterday
    const r = evaluateSchedule([entry('08:00', '0010000', true, true)], NOW);
    assert.equal(r.lastChange?.dayText, 'yesterday');
});

test('evaluateSchedule: reports weekday name for older last change', () => {
    // Sunday only (position 0), now is Wednesday — 3 days ago
    const r = evaluateSchedule([entry('08:00', '1000000', true, true)], NOW);
    assert.equal(r.lastChange?.dayText, 'Sunday');
});

// ── nextOn / nextOff ──────────────────────────────────────────────────────────

test('evaluateSchedule: always-on schedule has no nextOff', () => {
    const r = evaluateSchedule([entry('00:00', '1111111', true, true)], NOW);
    assert.equal(r.nextOff, null);
});

test('evaluateSchedule: finds nextOn correctly when state=off', () => {
    // ON at 18:00 (> 14:30), OFF at 22:00 — current state is off
    const r = evaluateSchedule([
        entry('18:00', '1111111', true, true),
        entry('22:00', '1111111', false, true)
    ], NOW);
    assert.equal(r.nextOn?.time, '18:00');
    assert.equal(r.nextOn?.dayText, 'today');
});

test('evaluateSchedule: finds nextOff correctly when state=on', () => {
    // ON at 06:00, OFF at 22:00 — now 14:30 → state=on, nextOff=22:00 today
    const r = evaluateSchedule([
        entry('06:00', '1111111', true, true),
        entry('22:00', '1111111', false, true)
    ], NOW);
    assert.equal(r.nextOff?.time, '22:00');
    assert.equal(r.nextOff?.dayText, 'today');
});
