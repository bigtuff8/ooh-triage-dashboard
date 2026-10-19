# Build Specification

<!-- gate:contract
SECTION: Build Artefact Summary
This document records the build metadata and scope for the OOH Triage Dashboard demo run. It identifies the harness run, project, release, and phase, and lists the key build deliverables for operator awareness.
-->

| Field    | Value                              |
|----------|------------------------------------|
| Run ID   | ooh-triage-dashboard-R1-mvfv1rr2   |
| Project  | ooh-triage-dashboard               |
| Release  | R1                                 |
| Phase    | build                              |

## Build Content

- **Dashboard scaffold** — Base HTML/CSS/JS structure for the OOH triage dashboard, including layout grid, header, and navigation shell.
- **Triage data panel** — Core UI component rendering triage entries with status indicators (pending, in-progress, resolved) and priority badges.
- **Demo data layer** — Static fixture data wired to the dashboard so the prototype is fully interactive without a live backend dependency.
