# v1.5.4 Hotfix Test Gate: blank heating cards and pub heating "End with no action"

<!-- gate:contract
SECTION: What was tested
The merged hotfix on main (commit 1e2f897, build gate PR #154). It fixes two live pub heating defects: three answer cards that show blank with no buttons (summer mode, back-up cycle, too hot but already off), and "End with no action", which fails on every pub heating card. No wording changed.

SECTION: Results
On main, CI passed both required checks on the exact commit being released: unit tests, and the full browser test suite. Locally, 751 of 752 unit tests pass and none fail; the one check that needs a copy of the IoT support dashboard runs only in CI. The new tests cover all nine heating cards, plus the fallback for an unknown code, with and without heating data and with turning on/off available or not. Each card has a headline, ticket wording and at least one button. "End with no action" sends a non-empty description from every card, and only those nine card codes can ever be produced.

SECTION: Hands-on check in a real browser
I ran this exact version of the app in demo mode (fake Zendesk, sample sites) and used it like an agent. On the two-zone sample site, too cold, "End with no action" then "Record outcome": the outcome recorded as ticket #45121 with the card's ticket wording as the description. On the other sample site, too hot, the same steps recorded ticket #45122. In production today, both of these fail with "Couldn't record the outcome". No sample site is in the summer, sensor-timer or already-off states, so I called the app's own card code in the browser for those three cards. Each returned its approved headline, two buttons and its ticket wording.

SECTION: What is not tested and why
The three restored cards are not reached by clicking through a sample site, because no sample site is in those states; the unit tests and the in-browser call above cover them. Nothing in this change touches the heating controls, ThingsBoard or any write path. It only changes what the agent sees and what gets logged.
-->

## Evidence

| Check | Result |
|---|---|
| Commit tested | main `1e2f897` (merge of build gate PR #154: `f878510` fix, `37393c2` tests) |
| CI on main, `unit tests` | success (run 40197391547) |
| CI on main, `e2e (playwright)` | success (run 40197391547) |
| Local unit suite | 752 tests, 751 pass, 0 fail, U13 skipped (needs a sibling repo) |
| Fixture walk-through, 9011, too cold, End with no action | recorded, ticket #45121, detail = W3 ticket sentence |
| Fixture walk-through, 9010, too hot, End with no action | recorded, ticket #45122, detail = W8 ticket sentence |
| In-browser render, W4 / W7 / W9 | headline present, 2 buttons each, ticket text present |
| Wording diff | none (2026-10-23 approved OOHDASH-139 wording) |
