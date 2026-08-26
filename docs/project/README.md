# IOT OOH Dash

Independent project folder for the **Out-of-Hours (OOH) Triage Dashboard** — split out of
`Work/Zendesk Integration/` on 2026-07-27 to run as its own workstream to go-live.

## Folder map

| Path | What |
|------|------|
| `ooh-triage-dashboard/` | **The built app** — Node/Express, git repo `bigtuff8/ooh-triage-dashboard`, v1.1.0 on `feature/live-build-v1`. Finished + tested; needs app-side infra-alignment changes before deploy. |
| `OOH Dashboard/` | **Design & analysis** — capability analysis, flow designs, mockups, data dictionary, reference docs (fire-up/down times, cheat sheets, equipment image catalogue). |
| `handover/` | **Spencer's SD-586 handover** — implementation-and-deployment + auth-b2c-handoff (local copies), and the email-trail summary. The authoritative spec for what prod expects. |
| `discovery/` | **This cycle's discovery** — research log + the interactive shaping proposal (`shaping-proposal.html`). |
| `2026-07-27T12-29-00/` | Harness work folder (state, checkpoints, feature-list, progress). |
| `PROJECT_STATUS.md` | Current state, next steps, how to resume. |
| `DATA_DICTIONARY.md` | Config/secret surface, Cosmos containers, SD cross-refs. |

## One-paragraph orientation

The OOH Dashboard is **built and tested** (v1.1.0). On 22 Jul Spencer stood up the entire prod
platform (DNS, TLS, B2C, namespace, workload identity, Cosmos RBAC) at
**https://ooh.airedale-group.io** — currently a "coming soon" placeholder. He implemented a
*more secure* infra model than the app was originally coded for, so a defined set of **app-side
code changes** must land before the image is built and the tag switched. Most of that work is
**buildable now without Spencer**; a few items are genuinely gated (scoped TB write cred, B2C
handler accounts, ingress) or need a James decision (SMS gateway, P1 deep-link). See
`discovery/shaping-proposal.html`.
