/**
 * Unit tests for services/schedule.js (OOHDASH-123, DD-SCHED-DISPLAY).
 *
 * Fixed reference: 2024-01-10T14:30:00Z = Wednesday 14:30 in Europe/London (UTC+0 in January).
 * JS weekday for Wednesday = 3 (0=Sun).
 * mon-first loops index for Wednesday = (3+6)%7 = 2.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeNextChange, describeNextChange } from '../services/schedule.js';

// Fixed deterministic reference time.
const NOW = new Date('2024-01-10T14:30:00Z'); // Wednesday 14:30 Europe/London
const TZ = 'Europe/London';

/* ---- SD-1: later today ---- */
test('next change later today returns ok:true with dayText today', () => {
  // loops '0010000' (mon-first): index 2 = Wednesday = active
  const schedule = {
    schedule: [{ value: 22, time: '15:00', loops: '0010000', timer_id: 't1' }]
  };
  const result = decodeNextChange(schedule, NOW, { tz: TZ });
  assert.equal(result.ok, true);
  assert.equal(result.timeText, '15:00');
  assert.equal(result.value, 22);
  assert.equal(result.dayText, 'today');
  assert.ok(result.at > NOW, 'at must be strictly after now');
  assert.ok(result.raw, 'raw entry must be included');
});

/* ---- SD-2: tomorrow (today entries exhausted) ---- */
test('next change tomorrow when only Thursday entry exists', () => {
  // loops '0001000' (mon-first): index 3 = Thursday
  const schedule = {
    schedule: [{ value: 18, time: '10:00', loops: '0001000', timer_id: 't2' }]
  };
  const result = decodeNextChange(schedule, NOW, { tz: TZ });
  assert.equal(result.ok, true);
  assert.equal(result.dayText, 'tomorrow');
  assert.equal(result.timeText, '10:00');
  assert.equal(result.value, 18);
});

/* ---- SD-3: day-order inversion ---- */
test('same loops string resolves to different day under mon-first vs sun-first', () => {
  // loops '1000000': index 0 is active
  //   mon-first -> Monday (jsDay=1), next Monday from Wednesday = daysAhead=5 -> 'Monday'
  //   sun-first -> Sunday (jsDay=0), next Sunday from Wednesday = daysAhead=4 -> 'Sunday'
  const schedule = {
    schedule: [{ value: 20, time: '09:00', loops: '1000000', timer_id: 't3' }]
  };
  const monFirst = decodeNextChange(schedule, NOW, { tz: TZ, dayOrder: 'mon-first' });
  const sunFirst = decodeNextChange(schedule, NOW, { tz: TZ, dayOrder: 'sun-first' });

  assert.equal(monFirst.ok, true);
  assert.equal(sunFirst.ok, true);
  assert.equal(monFirst.dayText, 'Monday', 'mon-first: index 0 = Monday');
  assert.equal(sunFirst.dayText, 'Sunday', 'sun-first: index 0 = Sunday');
  // The two results must differ
  assert.notEqual(monFirst.at.getTime(), sunFirst.at.getTime());
});

/* ---- SD-4: multiple entries in a day -> soonest upcoming chosen ---- */
test('multiple active entries on same day: soonest after now is chosen', () => {
  // Both entries active on Wednesday (loops index 2 = '1'), both after 14:30
  const schedule = {
    schedule: [
      { value: 22, time: '17:00', loops: '0010000', timer_id: 'ta' },
      { value: 18, time: '15:00', loops: '0010000', timer_id: 'tb' }
    ]
  };
  const result = decodeNextChange(schedule, NOW, { tz: TZ });
  assert.equal(result.ok, true);
  assert.equal(result.timeText, '15:00', 'must pick earlier of the two');
  assert.equal(result.value, 18);
  assert.equal(result.dayText, 'today');
});

/* ---- SD-5: absent / empty schedule ---- */
test('absent or empty schedule returns ok:false reason:absent; describeNextChange returns null', () => {
  assert.doesNotThrow(() => decodeNextChange(null, NOW, { tz: TZ }));
  assert.doesNotThrow(() => decodeNextChange(undefined, NOW, { tz: TZ }));
  assert.doesNotThrow(() => decodeNextChange({ schedule: [] }, NOW, { tz: TZ }));

  const r1 = decodeNextChange(null, NOW, { tz: TZ });
  assert.equal(r1.ok, false);
  assert.equal(r1.reason, 'absent');

  const r2 = decodeNextChange({ schedule: [] }, NOW, { tz: TZ });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'absent');

  assert.equal(describeNextChange(null, NOW, { tz: TZ }), null);
  assert.equal(describeNextChange(undefined, NOW, { tz: TZ }), null);
});

/* ---- SD-6: malformed JSON string -> ok:false reason:unsafe (no throw) ---- */
test('malformed JSON string returns ok:false reason:unsafe without throwing', () => {
  assert.doesNotThrow(() => decodeNextChange('{not valid json', NOW, { tz: TZ }));
  assert.doesNotThrow(() => decodeNextChange('{broken: true', NOW, { tz: TZ }));

  const result = decodeNextChange('{not valid json', NOW, { tz: TZ });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsafe');

  // describeNextChange must also return null and not throw
  assert.doesNotThrow(() => describeNextChange('{broken}', NOW, { tz: TZ }));
  assert.equal(describeNextChange('{broken}', NOW, { tz: TZ }), null);
});
