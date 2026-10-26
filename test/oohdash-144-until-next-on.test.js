/**
 * OOHDASH-144 C1 — until-next-on must resolve to the timetable's nextOn, not 07:00.
 *
 * In fixture mode, getSitesByNumber did not enrich boilerControl zones with timetable data.
 * dispatchBoilerBoost reads site.boilerControl.heating.zones[].timetable.nextOn.atMs —
 * without the fix, nextOnMs was always null → clampBoostWindow fell back to until-0700.
 *
 * UNO-1  clampBoostWindow with valid nextOnMs returns revertAtMs == nextOnMs (not 07:00)
 * UNO-2  clampBoostWindow with null nextOnMs falls back to 07:00 (baseline: old behaviour)
 * UNO-3  clampBoostWindow with nextOnMs > 11h cap falls back to 07:00
 * UNO-4  getSitesByNumber in fixture mode enriches boilerControl zones with timetable
 * UNO-5  the timetable on the enriched zone has nextOn.atMs set (not null) for the 9010 schedule
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';
process.env.WRITES_DISABLED = 'false';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

const { clampBoostWindow } = await import('../services/boost-window.js');
const tb = await import('../services/tb-device.js');

// ── UNO-1: valid nextOnMs → revertAtMs = nextOnMs ─────────────────── */
test('UNO-1: clampBoostWindow until-next-on with valid nextOnMs uses nextOnMs not 07:00', () => {
    const nowMs = new Date('2026-10-25T21:00:00Z').getTime(); // 21:00 UTC, 22:00 BST
    const nextOnMs = nowMs + 8 * 60 * 60 * 1000; // 8 h from now → within [15 min, 11 h]
    const result = clampBoostWindow(nowMs, 'off', 'until-next-on', 'Europe/London', nextOnMs);
    assert.equal(result.ok, true, 'Should succeed');
    assert.equal(result.revertAtMs, nextOnMs, 'revertAtMs must equal nextOnMs (timetable value)');
    assert.equal(result.fallback, undefined, 'Must not fall back to until-0700');
});

// ── UNO-2: null nextOnMs → falls back to 07:00 ────────────────────── */
test('UNO-2: clampBoostWindow until-next-on with null nextOnMs falls back to until-0700', () => {
    const nowMs = new Date('2026-10-25T21:00:00Z').getTime();
    const result = clampBoostWindow(nowMs, 'off', 'until-next-on', 'Europe/London', null);
    assert.equal(result.ok, true, 'Should succeed (fallback is safe)');
    assert.equal(result.fallback, 'until-0700', 'Should fall back to until-0700 when nextOnMs is null');
    // The revertAtMs should be around 07:00 London time
    const d = new Date(result.revertAtMs);
    const londonHour = d.toLocaleString('en-GB', { hour: '2-digit', timeZone: 'Europe/London', hour12: false });
    assert.equal(londonHour, '07', 'Fallback must land at 07:00 London time');
});

// ── UNO-3: nextOnMs > 11h → falls back to 07:00 ──────────────────── */
test('UNO-3: clampBoostWindow until-next-on with nextOnMs > 11h falls back to until-0700', () => {
    const nowMs = new Date('2026-10-25T21:00:00Z').getTime();
    const nextOnMs = nowMs + 12 * 60 * 60 * 1000; // 12 h > 11 h cap
    const result = clampBoostWindow(nowMs, 'off', 'until-next-on', 'Europe/London', nextOnMs);
    assert.equal(result.ok, true, 'Should succeed (fallback is safe)');
    assert.equal(result.fallback, 'until-0700', 'Should fall back when nextOnMs exceeds 11h cap');
});

// ── UNO-4 + UNO-5: getSitesByNumber enriches fixture zones with timetable ── */
test('UNO-4 + UNO-5: getSitesByNumber fixture mode attaches timetable.nextOn.atMs to boilerControl zones', async () => {
    // Site 9010 has CHZ1/CHZ2 schedules (06:30 on / 23:00 off, every day).
    const sites = await tb.getSitesByNumber('9010');
    assert.equal(sites.length, 1, 'Site 9010 must be found in fixture');
    const bc = sites[0].boilerControl;
    assert.ok(bc?.heating?.zones?.length, 'Site 9010 must have boilerControl.heating.zones');

    for (const zone of bc.heating.zones) {
        assert.ok(zone.timetable != null,
            `Zone ${zone.zone} must have timetable after C1 fix (was null in fixture before fix)`);
        assert.ok(zone.timetable.nextOn != null,
            `Zone ${zone.zone} timetable.nextOn must be set (schedule has 06:30 on entry)`);
        assert.ok(typeof zone.timetable.nextOn.atMs === 'number' && zone.timetable.nextOn.atMs > Date.now(),
            `Zone ${zone.zone} timetable.nextOn.atMs must be a future timestamp`);
        // The zone key must match 'CHZ1'/'CHZ2' as used by dispatchBoilerBoost
        assert.ok(zone.zone === 'CHZ1' || zone.zone === 'CHZ2',
            `Zone key must be 'CHZ1' or 'CHZ2', got '${zone.zone}'`);
    }
});
