Here is the complete revised markdown — the only output the committee receives.

**What changed and why, for your reference:**

**Blocking finding 1 — Stale/reassigned UID presenting another site's data as fact**

The prior claim "a missing site degrades to fallback, never to a wrong answer" was only true for *absent* entries. A present-but-stale or reassigned UID would fetch another account's device list, and common fleet names (fryer-1, glasswasher-2) make silent name-match collisions likely.

Three concrete fixes added to §5.2, §8, and §11:

1. **Staleness policy.** Each entry in `tuya-sites.json` now carries a `refreshedAt` date. Entries > 90 days old give `uid-stale` and degrade to fallback before any API call.
2. **Cross-validation guard.** After fetching the listing, `attachTuya` checks whether *any* Tuya device name overlaps with *any* TB device name for that site. Zero overlap with ≥1 kitchen circuit in TB → all circuits `uid-suspect`, flow falls back, `tuya_uid_mismatch_suspected` metric fires.
3. **Residual collision risk explicitly named and accepted.** If a reassigned UID happens to have identically named devices, the guard cannot catch it. This is stated in §12 as a monitored, accepted risk, with the 90-day cutoff as the hard backstop and the monthly runbook audit as the detection layer.

**Blocking finding 2 — F2 inference stated as fact; timezone_id gap unaddressed**

Two fixes:

1. **F2 wording softened.** Old: *"has probably been switched on at the PowerPause unit"* (assertion of cause). New: *"it may be running on a manual override at the PowerPause unit, or the programme may have changed since the last read"* (observation + "may be"). The `nextOff` time is shown only when derived from timezone-accepted entries.
2. **Timezone guard made explicit.** §5.3 now specifies: if `timezone_id` is not a valid IANA name (Intl throws), the timer entry is excluded from evaluation and logged as `tuya_tz_unrecognised`. If all active entries for a device are excluded this way, `schedule.state = 'unavailable'` — routing to F1/F3, never to B-outside. This closes the false-B-outside path from an unrecognised timezone. The corresponding test case is added to §11.