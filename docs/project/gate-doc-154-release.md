# v1.5.4 Hotfix Release Gate

<!-- gate:contract
SECTION: What this releases
v1.5.4, a fix-only release of the pub heating flow. The three blank heating cards (summer mode, back-up cycle, too hot but already off) show their approved wording and buttons again, and "End with no action" on pub heating cards records the call instead of failing. No wording changes, no settings changes, and nothing that sends commands to the heating. Production currently runs v1.5.2; v1.5.3 was rolled back this morning and its code was reverted, so it is not in this release.

SECTION: How it is released
The standard release script runs from main. It bumps the version to 1.5.4, tags it, builds the image, and points the registry's "latest" image at it. That retires the broken v1.5.3 "latest" so it can't be deployed by mistake. It then rolls the new image out. It swaps only the image: no environment settings change, and writes stay enabled exactly as they are today. Afterwards I check the live health page reports 1.5.4 with every subsystem healthy, and that the deployed image tag is the new version, not "latest".

SECTION: If something goes wrong
Rollback is one command, back to the v1.5.2 image that is running now. It takes about a minute, and I would only do it with your go or if the health page shows the app down.

SECTION: Checks done
The build gate (PR #154) and the test gate are on record. CI passed both required checks on main for the exact commit being released. The hands-on check in a real browser recorded "End with no action" as tickets on both sample sites.

DECISION: Release v1.5.4 | Go: release and deploy v1.5.4 now (recommended) | Hold: approve, but don't deploy until I say
DETAIL: Approving with Go is your explicit go to deploy. I will run the release script, verify the live health page, and report back. With Hold, I will cut nothing until you say.
-->

## Release facts

| Item | Value |
|---|---|
| Release | v1.5.2 (live) → v1.5.4. v1.5.3 was rolled back and reverted (PR #152) |
| Source | main `1e2f897`, then the `release v1.5.4` version commit from `scripts/release.sh patch` |
| Image tags | `<sha>`, `v1.5.4`, `latest` (retires the broken v1.5.3 `latest`) |
| Deploy | `kubectl set image` only; env untouched (WRITES_DISABLED stays false, as live today) |
| Script note | The script prints a warning if writes are not disabled. That is expected: writes have been enabled since 2026-09-24. |
| Verify | `/healthz` version 1.5.4, subsystems healthy; the deployed image is `<sha>` (never `latest`) |
| Rollback | `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:v1.5.2` |
| Gates | build PR #154 (merged), test gate (this release's companion PR), release (this PR) |
