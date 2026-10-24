# OOHDASH-143 Test Gate

<!-- gate:contract
SECTION: CI verdict

Both required CI checks passed on build/oohdash-143 (run 40124960237, 2026-10-24).

| Check | Result |
|---|---|
| unit tests | pass |
| e2e (playwright) | pass |

SECTION: Local test results

Unit suite (npm run test:unit): 675 pass, 1 pre-existing fail (U13 -- iot-consumer-parse drift check, failing on main before this branch), 1 skip. All BH tests pass.

E2e suite (npm test, Playwright): 194 tests, 192 pass, 2 skip, 0 fail. Exit code 0.

SECTION: Regression coverage

| Test | Description | Result |
|---|---|---|
| BH-14 | V1 zone excluded when mask[2]=false and NO schedule | pass (guard) |
| BH-16 | 6811 incident replay -- string overrides, zone 2 via schedule | pass |
| BH-17 | V1 string round-trip "true"/"false" | pass |
| BH-18 | V2 string integers "1"/"0" | pass |
| BH-19 | Zone 2 schedule-presence fallback | pass |

No existing tests changed or removed. 4 tests added.
-->
