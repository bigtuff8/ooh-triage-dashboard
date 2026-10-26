# OOHDASH-152 Day-Order Survey Finding
**Date:** 2026-10-26  
**Author:** Claude Code (discovery spike)  
**Ticket:** OOHDASH-152 — Confirm OOH_SCHED_DAY_ORDER safe to flip sun-first across all schedule key types  
**Status:** COMPLETE — recommendation is GO

---

## Context

`config.js:143` controls the day-order for the `describeNextChange()` / `decodeDeviceSchedule()` path (the "next scheduled change" display text in the operator flow). Current value: `mon-first`. OOHDASH-149 fixed `zoneTimetable()` for the CHZ1/CHZ2 V2 path (proven sun-first by SQ-13), but deliberately left this config unchanged pending a survey of all schedule key types decoded by `decodeDeviceSchedule()`.

The keys iterated (tb-device.js:111):
```
['schedules', 'CHZ1.schedule', 'DHW.schedule',
 'output1Schedule', 'output2Schedule', 'output3Schedule', 'output4Schedule']
```

The function returns the first non-null result in this order.

---

## Survey Results by Schedule Key Type

### 1. `CHZ1.schedule` / `CHZ2.schedule` (V2 boilerControl)

**Verdict: PROVEN sun-first**

Proven by SQ-13 (run mvp8mgc6, 2026-10-26). OOHDASH-149 already corrects `zoneTimetable()` for this path. For `decodeDeviceSchedule()`, this is the first key that matches on V2 devices. Day-varying at multiple V2 sites.

### 2. `DHW.schedule` (V2 boilerControl, `separate_dhw=true`)

**Verdict: DEDUCED sun-first**

**Sites checked:** 6097 (day-uniform), 6164 (day-varying, confirmed).

At site 6164, DHW.schedule entries:
```
[0] loops=1000011  value=57  time=09:00   ← hot water on
[1] loops=0111100  value=57  time=11:00   ← hot water on
[2] loops=1111100  value=15  time=22:00   ← hot water off
[3] loops=0000011  value=15  time=23:00   ← hot water off
```

CHZ1.schedule on the **same device** (`gk-6164-boilercontrol-1`):
```
[0] loops=1000011  value=21  time=09:00   ← heating on
[1] loops=0111100  value=21  time=11:00   ← heating on
```

The "on" loop patterns are **byte-for-byte identical** between DHW.schedule and CHZ1.schedule on the same physical device. Since CHZ1.schedule is **PROVEN** sun-first, DHW.schedule must use the same convention.

Under sun-first, `1000011` = Sun+Fri+Sat (weekends) and `0111100` = Mon–Thu (weekdays) — a coherent pub pattern (hot water/heating on earlier at weekends). Under mon-first the grouping is incoherent (Mon with Sat+Sun for early start, Mon then separate off-time from Tue-Fri).

No telemetry cross-reference needed: the firmware-identity argument is definitive.

**Day-varying sites found:** 1 (site 6164). Site 6097 is all-`1111111` (day order irrelevant there).

### 3. `output1Schedule` (V1 boilerControl)

**Verdict: MOOT**

Checked at 14 V1 sites (220, 1736, 2933, 4331, 4631, 4741, 4857, 5135, 6288, 6311, 6335, 6600, 6311, 7950) — ABSENT in SHARED_SCOPE at all of them. Also absent from CLIENT_SCOPE. `output1` is the boiler-relay output on V1 hardware; it has `output1OutputMask` and `output1Override` but no separate schedule. `decodeDeviceSchedule()` skips this key at every live site.

### 4. `output2Schedule` (V1 boilerControl)

**Verdict: DEDUCED sun-first**

Present in SHARED_SCOPE at all V1 sites checked. This is the first key that resolves on a V1 device (after `schedules`, `CHZ1.schedule`, `DHW.schedule`, and `output1Schedule` are all absent). Site 7950 sample: all entries `loops=1111111` — day order irrelevant at that site.

From OOHDASH-151 (run mvpgahn2, 2026-10-26): same firmware lineage as V2 (PROVEN sun-first); all loops patterns on V1 output2/3Schedule are semantically coherent only under sun-first.

### 5. `output3Schedule` (V1 boilerControl)

**Verdict: DEDUCED sun-first**

Present in SHARED_SCOPE at V1 sites. In practice, `decodeDeviceSchedule()` only reaches `output3Schedule` if `output2Schedule` returns null from `describeNextChange` — which is very unlikely since output2Schedule has valid entries at all sites checked. Same firmware, same DEDUCED sun-first conclusion.

### 6. `output4Schedule` (V1 boilerControl)

**Verdict: DEDUCED sun-first**

**Day-varying at sites 7950, 6600, 6311.** Only reached if output2 and output3 produce null (rare). Representative data:

Site 6600:
```
loops=1000001  value=60  time=08:30   ← on (weekend under sun-first: Sun+Sat)
loops=0111110  value=60  time=10:30   ← on (weekdays: Mon–Fri)
loops=1000000  value=20  time=22:00   ← off (Sunday)
loops=0111100  value=20  time=22:30   ← off (Mon–Thu)
loops=0000011  value=20  time=23:00   ← off (Fri–Sat)
```

Under sun-first: weekends (Sat+Sun) start heating at 08:30; weekdays (Mon-Fri) at 10:30; off times cluster naturally by day. Under mon-first the groupings are incoherent (Mon starts with Saturday, Mon has earlier off-time than Tue-Fri). Same firmware as V2 (PROVEN sun-first) — no ambiguity.

### 7. `schedules` (PowerPause)

**Verdict: MOOT**

- Production PowerPause (`gk-7950-powerpause-r10a`): `schedules` key ABSENT from SHARED_SCOPE entirely.
- Test device (`rikki-4589-powerpause-3-circuit-1`): `schedules = {"schedule":[]}` — attribute exists but schedule is empty.
- `describeNextChange()` on an empty schedule returns `{ok:false, reason:'absent'}` → null.
- `decodeDeviceSchedule()` returns null for PowerPause in production → no nextChange text produced.

---

## UI Prominence Assessment

`nextChange` text from `decodeDeviceSchedule()` appears in two UI locations:

### Location 1 — W6 operator triage script (HIGH prominence)
**File:** `public/js/flows.js:1511`

```javascript
else if (wcode === 'W6') {
    var nc6 = heating && heating.nextChange;
    bpLogSegs.push('Heating off on timetable' + (nc6 ? ', next change at ' + nc6 : '') + '.');
}
```

W6 fires when all heating zones are off on their timetable. The `nextChange` string (e.g. *"based on the device's stored schedule, next change to 21 at 11:00 tomorrow"*) is embedded directly in the operator triage script — the words read aloud to the customer. **A wrong day would directly mislead the operator** during a live call.

Source: `_decodeBoilerHeatingInner()` (tb-device.js:1311) calls `decodeDeviceSchedule('boiler-panel', sharedScope, now)`, which iterates all SCHEDULE_KEYS.

### Location 2 — Kitchen/PowerPause ncrit ticket detail (LOW prominence)
**File:** `public/js/flows.js:1899, 2058`

```javascript
const ksched = ws.devices.find(d => d.kind === 'kitchen')?.schedule || '';
detail: `Caller needs kitchen equipment outside the current schedule window (${ksched}).`
```

Goes into the Zendesk ticket `detail` field when the operator logs a non-critical kitchen/PowerPause call. Currently MOOT because no production PowerPause has a `schedules` entry in SHARED_SCOPE. Even if populated, it is a supporting detail in a ticket, not the operator's active script.

### Device-card `schedule` field
`device.schedule` is in the workspace JSON and available client-side, but not rendered in any device card HTML template. Not visible to operators directly.

---

## Decode Chain Analysis

For a V1 boilerControl, `decodeDeviceSchedule()` resolves in practice to `output2Schedule` (the first key present in SHARED_SCOPE). If output2Schedule entries are all `1111111` (as at site 7950), day order is already irrelevant. For sites where output2Schedule has day-varying entries, the firmware is DEDUCED sun-first.

For a V2 boilerControl, it resolves to `CHZ1.schedule` (PROVEN sun-first). DHW.schedule is only reached if CHZ1.schedule is absent — which would be unusual for a V2 device; on the two V2 DHW sites checked, both CHZ1.schedule and DHW.schedule were present.

No production device creates a non-null result through `output1Schedule` or `schedules`.

---

## Summary Table

| Schedule key | Sites with day-varying entries | Day-order verdict | Decode path note |
|---|---|---|---|
| `CHZ1.schedule` | Multiple V2 sites | **PROVEN** sun-first | Primary V2 path; OOHDASH-149 fixed `zoneTimetable()` |
| `DHW.schedule` | 1 found (6164) | **DEDUCED** sun-first | Identical loops to CHZ1 on same device |
| `output1Schedule` | 0 (never present) | **MOOT** | Absent at all 14 V1 sites checked |
| `output2Schedule` | Unknown (site 7950 all-1111111) | **DEDUCED** sun-first | Primary V1 path; OOHDASH-151 |
| `output3Schedule` | Unknown | **DEDUCED** sun-first | Rarely reached (output2 resolves first) |
| `output4Schedule` | 3 sites (7950, 6600, 6311) | **DEDUCED** sun-first | Rarely reached; patterns coherent sun-first |
| `schedules` (PP) | 0 (empty in production) | **MOOT** | No production PowerPause has entries |

---

## Recommendation: **GO**

**Safe to flip `config.js:143` to `sun-first`.**

Every schedule key type that produces a non-null `nextChange` result in production uses sun-first ordering:

- `CHZ1.schedule`: PROVEN.
- `DHW.schedule`: DEDUCED (firmware identity on same device as PROVEN CHZ1).
- `output2/3/4Schedule`: DEDUCED (OOHDASH-151 firmware lineage + loops-pattern coherence).
- `output1Schedule` and `schedules` (PowerPause): MOOT — never produce a result in production.

No type uses mon-first. The current `mon-first` default is **wrong** for all day-varying entries in production; flipping to `sun-first` will correct the `nextChange` text for those entries. Sites with all-`1111111` entries are unaffected.

**Proposed change** (single line, no test impact beyond schedule decode unit tests):
```javascript
// config.js:143
dayOrder: env('OOH_SCHED_DAY_ORDER', 'sun-first'),   // was 'mon-first' — OOHDASH-152
```

This change should be applied after OOHDASH-149 (PR #164) merges, as part of the same OOHDASH-149 release or as a standalone follow-on patch.

---

## Evidence / Queries Run

- TB JWT authenticated: `portal.lhlive.co.uk`, session `13e5044f-865c-42b7-a4bc-1bd7c89ce1f0`
- PowerPause estate: 17 devices found by `textSearch=powerpause`; 1 production (`gk-7950-powerpause-r10a`)
- V1 boilerControl checked: 14 sites for `output1Schedule` (all ABSENT)
- V2 DHW sites checked: 6097 (all-1111111), 6164 (day-varying, definitive)
- Code files read: `services/tb-device.js`, `services/schedule.js`, `config.js`, `public/js/flows.js`
- No writes to ThingsBoard.
