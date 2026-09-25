<!-- gate:contract
SECTION: What this gate decides
This gate seeks approval of the OOHDASH-106 assessment: an evidence-based design of OOH's admin & access-control build and how it maps onto Spencer's platform shell infrastructure. It was produced from live code and live data only, with no speculation; the parts of Spencer's shell-hub editor that cannot be seen from live sources are held as decision-gated questions, not guessed. Approving it endorses the two-axis migration model, the proceed-now-vs-gated split, and the decision list to route to Spencer.
SECTION: The verified spine
OOH does not run a parallel identity system. It already consumes the shared platform: the same Azure B2C client, the same UserEnrichmentService connector, and the same Cosmos user container the whole estate uses. At request time OOH reads only the sign-in token, never a user store. The effective grant lives in the claims array, confirmed by a live read of 11 OOH users; the repo provisioning script writes a dead field and must be corrected. This is why OOH's own migration surface is small even though the platform work upstream is large.
SECTION: The two-axis model
Migration effort splits along two orthogonal axes. The container axis (does the shell hub write to the same shared user docs, or a new store) sizes the upstream platform and provisioning work, and is near-irrelevant to OOH's runtime because OOH reads only the token. The token-contract axis (the claim field shape, the admin-vs-handler granularity, and the sign-in flow and client) sizes OOH's own code change. Only the second axis touches OOH code, and then only at most one line, provided the auth protocol is preserved and admin-vs-handler stays as two distinct areas.
SECTION: Proceed now versus gated
OOHDASH-104 can proceed now with no dependency on Spencer: build the two-tier admin and normal surface on the existing admin and handler boundary, and land the provisioning-script field fix. The shell-hub migration build (OOHDASH-107) must not be scoped until Spencer answers the decision list, because its whole shape depends on those answers. This decoupling keeps near-term delivery moving while the platform question is resolved.
SECTION: Key risks the review surfaced
The single running replica holds sessions in memory, so any environment re-point or rollback restarts the one pod, logs out every live handler, and cannot be pre-validated because applying the change is itself the cut-over; the honest options are an off-production rehearsal or a bounded-outage window with a pre-captured rollback. The provisioning write lands in the shared estate-wide container, so it must be a single-claim conditional write with targeted-removal rollback. There is exactly one admin (kill-switch) holder today, a single point of failure that must gain a second holder and a break-glass path before any cut-over.
SECTION: Review assurance
The design was hardened before this gate: three rounds of adversarial critical-thinking review resolved to a clean pass, then two full committee rounds across testability, deployment, programme, risk and architecture lenses resolved to unanimous approval. The full design document is linked in the body below for depth.
DECISION: Approve the OOHDASH-106 assessment — the two-axis migration model, the proceed-now-104 / gate-107-on-Spencer split, and routing the D1–D8 decision list to Spencer? | Approve | Request changes
-->

# OOH Admin & Access Control — design gate (current state and shell-infrastructure migration)

**Stage:** Design. **Date:** 2026-09-25. **Epic:** OOHDASH-106 (shell-hub alignment assessment). **Related:** OOHDASH-104 (build OOH's own admin), OOHDASH-107 (migration build). **Repo:** C:\repos\ooh-triage-dashboard.

**Full design document (mobile-friendly, hosted):** [OOH Admin & Access Control — full design doc](https://home-desktop-jb-new.tail30d2e6.ts.net/review/ooh-admin-shellhub-design.html)

This gate artefact is the governance summary and decision surface. The linked design document holds the full evidence, gap analysis, phased plan, risk register and the complete question bank. Everything below is drawn from live code and a live Cosmos read on 2026-09-25; nothing about the unseen shell-hub editor is asserted as fact.

---

## The decision in one line

Approve this assessment so OOHDASH-104 proceeds now and the D1–D8 decision list goes to Spencer to unblock the OOHDASH-107 migration.

---

## Why the OOH migration surface is small

OOH already runs on the shared identity plane. It authenticates against the shared Azure B2C client, its role arrives already-serialised in the sign-in token by the platform's UserEnrichmentService, and it reads that token only — it never queries a user store at runtime. So whatever the shell hub changes upstream, OOH's own runtime change is at most an environment re-point plus at most one line of code — and only when two conditions both hold (see the model below). The heavy lifting (authoring areas, minting identifiers, back-filling the shared store) is upstream and Spencer-owned.

A live read on 2026-09-25 confirmed the effective grant is carried in the `claims` array, not the `AreaClaim` field the repo provisioning script writes; that script's write is therefore a dead write and is fixed as a proceed-now item.

## The two-axis migration model

| Axis | What it is | What it sizes | Touches OOH code? |
|---|---|---|---|
| Container axis | Does the hub write the same shared `user.claims[]`, or a new store | Upstream platform + provisioning work | No — OOH reads only the token |
| Token-contract axis | Claim field shape, admin-vs-handler granularity, sign-in flow/client | OOH's own code change | Yes — at most one line, conditionally |

The one-line bound holds only if the auth protocol is preserved and the admin-vs-handler distinction stays as two distinct areas. A new sign-in flow, or that distinction moving into sub-fields the role mapper discards today, is a scoped rewrite, not a one-liner.

## Proceed now versus gated on Spencer

| Workstream | Status | Note |
|---|---|---|
| OOHDASH-104 — two-tier admin/normal surface | Proceed now | Built on the existing admin/handler boundary; not throwaway under any migration outcome |
| Provisioning-script field fix (claims not AreaClaim) | Proceed now (land), gate the run | Landing is safe; running it against live is gated on the tenant/container checks |
| OOHDASH-107 — migration build | Gated | Do not scope until the D1–D8 answers land |

## The decision list to route to Spencer

| # | Decision only Spencer (or Spencer/James) can make |
|---|---|
| D1 | Does the permissions editor exist today, and what identifiers does it mint for the OOH area (1500) and IoT area (1400)? |
| D2 | Does the hub write to the same shared user docs the enrichment reads, or a new field, container or account? |
| D3 | Does the token contract change, or stay the current shape keyed on claimArea? |
| D4 | Is admin-vs-handler still two distinct areas, or re-expressed via sub-fields within one area? |
| D5 | Same B2C flow, connector and client — protocol preserved, and is OOH's callback registered on any new client? |
| D6 | Will the platform read the live claims array rather than the dead field? |
| D7 | Write authority and lifecycle — does OOH keep native admin, or delegate fully to the editor? |
| D8 | Sole-admin single point of failure — confirm the live admin count (one today) and agree a second holder plus break-glass before any cut-over. |

## Key risks the review surfaced

| Risk | Why it matters | Mitigation |
|---|---|---|
| Single-replica session flush | Any re-point or rollback restarts the one pod and logs out live handlers; it cannot be pre-validated | Rehearse off-production, or take a bounded-outage window with a pre-captured rollback |
| Estate-wide provisioning write | The user container is shared across every hub | Single-claim conditional write; targeted-removal rollback, not a whole-doc restore |
| Sole-admin single point of failure | Exactly one admin (kill-switch) holder today | Provision a second holder and a break-glass path before any cut-over |
| Wrong tenant or account on a live write | A wrong-tenant issuer is a total lockout | Confirm the tenant and account before any live write and before the issuer re-point |

## Review assurance

| Stage | Rounds | Outcome |
|---|---|---|
| CT/CX adversarial review | 3 | PASS (clean) |
| Full committee (tester, release, coordinator, retro, design) | 2 | Unanimous APPROVE |

## Recommended next action

On approval: James routes the D1–D8 list to Spencer, and OOHDASH-104 (admin surface + provisioning field fix) proceeds in parallel. The migration build (OOHDASH-107) is scoped once Spencer answers.
