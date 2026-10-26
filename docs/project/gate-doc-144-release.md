# OOHDASH-144 Release Gate: v1.6.0, pub heating on the new agent-screen standard

<!-- gate:contract
SECTION: What this releases
Version 1.6.0, which replaces 1.5.4. It is a minor version because it adds features. It brings the pub heating work you approved through the design, build, three fix and test gates (PRs #151, #157, #158, #159 and #160):
- agents can turn heating on or off for a set time, for one zone or all zones;
- they can put it back to normal early;
- they see each zone's timetable, and "off until it's next due on" where the timetable is the same every day;
- each issue gets one ticket through "Check and log";
- every pub heating screen follows the new headline, "Say to the customer" and "Good to know" standard.

Other flows are unchanged; they move to the standard under OOHDASH-146.

SECTION: Goes live straight away
Turning the pub heating on or off has been switched on in production since 1.5.x, and nothing turns it off. So the new screens go live the moment the release deploys. No settings change: writes stay enabled exactly as they are today.

SECTION: How it is released
The standard release script runs from main. It bumps the version to 1.6.0, tags it, builds the image, and points the registry's "latest" image at it. It then rolls out the new image by its commit, never by "latest". It swaps only the image. Afterwards I check that the live health page reports 1.6.0 with every part healthy, and that the deployed image is the new commit.

SECTION: If something goes wrong
Rollback is one command, back to the exact 1.5.4 image running now, named by its fixed image fingerprint rather than a tag, so it can't drift. It takes about a minute. Nothing pulls the "latest" image: the deployment names a fixed version, and any extra copies use the same setting. I would only do it with your go, or if the health page shows the app down. Tickets created automatically in the meantime stay in Zendesk.

SECTION: Timed changes survive a rollback
If heating is mid-change when we roll back, it still goes back to normal on time. The switch-back is not tied to the running version. Each timed change is saved in the shared database, and a background worker puts it back when it's due. Version 1.5.4 runs that same worker (added in OOHDASH-141, file services/overrides.js), and 1.6.0 doesn't change how timers are saved. So a 1.5.4 pod picks up any timer 1.6.0 set and switches it back on time. I proved this with a test that runs both versions. Version 1.6.0 code set three timers: both zones off on one demo site, and one zone on at the other. Version 1.5.4 code, reading the same store, then switched all three back to automatic on time.

SECTION: The three skipped tests
None of them touches pub heating or anything that sends changes to the heating. The unit test skipped checks refrigeration profiles, and needs a cellar-profile file that isn't in this repository. The two browser tests skipped are the notes box on the general device controls (TF-18 and TF-19). The demo site has no device control tile, so they skip; they were already skipped before this work. My earlier gate documents called the unit skip "U13". That was wrong, and this is the correct one.

SECTION: A note for the agents
Agents will see new screens, a new "Check and log" step and new messages on the next pub heating call. I recommend sending the draft note below when the release deploys, so nobody meets the new screens cold during a live call. It's for you to send; I won't send it.

SECTION: Checks done
Every gate is approved and merged. CI passed both required checks on main for the exact commit being released (250f7ab). Unit tests 840 of 841 pass and browser tests 202 of 204 pass, with none failing. All nine cards match the design wording, word for word. A failed or unconfirmed change never says "That's done". Nothing writes a timetable or the boiler.

DECISION: Release v1.6.0 | Go: release and deploy v1.6.0 now (recommended) | Hold: approve, but don't deploy until I say
DETAIL: Approving with Go is your explicit go to deploy. I will run the release script, verify the live health page and the deployed image, and report back. With Hold, I will cut nothing until you say.
-->

## Release facts

| Item | Value |
|---|---|
| Release | v1.5.4 (live, image `72baa82`) → v1.6.0 (`npm run release:minor`) |
| Source | main `250f7ab` (CI green), then the `release v1.6.0` version commit |
| Image tags | `<sha>`, `v1.6.0`, `latest` |
| Deploy | `kubectl set image` by `<sha>` only; env untouched (WRITES_DISABLED stays false, as live today) |
| Settings | none new; turning heating on or off is enabled by default (no BOILER_BOOST_* env set in production) |
| Script note | The script warns that writes are not disabled. That is expected: writes have been enabled since 2026-09-24. |
| Verify | `/healthz` version 1.6.0, subsystems healthy; deployed image is `<sha>` |
| Rollback | `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard@sha256:06012d2fd1ec5655bd371f9872b7ebe0df175e1eb0f34bc96bb044bffa88a365` (the running pod's digest; tags `v1.5.4`, `72baa82` and the current `latest` all resolve to it today) |
| Rollback proven | a cross-version test: v1.6.0 code set timers for 9010 (both zones off) and 9011 (zone 1 on); the v1.5.4 revert worker, on the same store, reverted all three to automatic (0) |
| latest | not used by the deployment (pinned to `72baa82`, 1 replica); `latest` is re-pointed to v1.6.0 by the release script |
| Gates | design #151, build #157, fixes #158 and #159, test #160, release (this PR) |

## Draft note for the agents (for James to send, or not)

| Line |
|---|
| Pub heating calls now look a little different on the OOH dashboard. |
| Each answer has a short headline and one blue "Say to the customer" box. Read that box out. "Good to know" is for you only. |
| If the customer is too hot or too cold, you can turn the heating on or off for a set time, for one zone or all zones. If they don't know which zone, choose "All zones". |
| If we've already changed the heating, you'll see it at the top with "Put back to normal now". |
| Every issue ends with "Check and log". If a ticket was already raised automatically, it adds to that same ticket, so there's one ticket per issue. The ticket number is always shown. |
| If the heating can't be reached, the screen says so. Never tell the customer it's done unless the screen says "That's done". |
