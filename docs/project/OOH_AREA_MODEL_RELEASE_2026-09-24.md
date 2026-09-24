<!-- gate:contract
SECTION Decision first: This is the RELEASE gate for OOHDASH-82, the heating area-model redesign, cut as v1.3.0. All four prior gates are cleared and merged (discovery, design, build, test), and the version bump is already committed and tagged on main; nothing has been deployed yet. What this gate authorises is the live deploy of the code that is already reviewed and tested. The release ships CODE ONLY — it enables no device write and no SMS. WRITES_DISABLED stays true and SMS_PROVIDER stays log; the deploy uses set image, which cannot change either. If the panel clears, v1.3.0 goes to https://ooh.airedale-group.io and is verified against /healthz.
SECTION What ships in v1.3.0: Three related changes to the handler heating flow. First, the two-area model — the heating step now derives at most two caller-meaningful named areas (Accommodation, Bar-Restaurant) from a device area field and stores the handler choice by NAME, never by list index; serials and gateways are structurally excluded from the area candidate set, and a multi-device area surfaces its coldest online zone with an honest coldest-of-N note. Second, the gateway misclassification fix — the ASSET_INTENT match order is reordered so a paired Salus gateway is no longer mis-typed as a controllable thermostat, backstopped by an area allowlist. Third, aircon referral — all Intesis aircon control is removed; every aircon request (the in-context shortcut and a typed keyword) now becomes a captured aircon-referral ticket with a caller script and no control button anywhere. The net effect REDUCES the control surface.
SECTION Test evidence carried from the test gate (PR 46): Unit 252 pass, 0 fail, 1 skip (253 total) — re-run green on the release commit at bump time. Playwright 47 pass of 49; the two failures are one single PRE-EXISTING environment condition (the P1 SMS provider runs in log mode with no Twilio, so the honest text-not-sent wording renders where two legacy specs assert Twilio-sent wording), proven pre-existing by running those specs on the pre-build commit 7768535 where they fail identically — not a regression and not a product bug. The new area-model.spec.js is 8 of 8 green, driving a mixed site end to end on observed DOM and real network bodies.
SECTION The accepted live re-test condition: Per design section 10.3, three acceptance items (AC1 chip render, AC2 live coldest-zone read, AC4 referral ticket) carry a named handler-login Playwright re-test that cannot be exercised headlessly because they depend on live inventory and session state. The test gate approved on that basis and the condition travels into this release as a post-deploy handler spot-check — it is a tracked verification step, not a blocker to shipping the code.
SECTION How it deploys and the safety invariants: Deploy is the scoped path from the CIR deploy doc — build the image from a clean git-archive export into ACR, then kubectl set image on deployment ooh-dashboard in namespace iot-services via the deployer-ooh scoped kubeconfig. set image leaves the pod env block UNTOUCHED, so WRITES_DISABLED stays true and SMS_PROVIDER stays log by construction. One known drift risk is handled explicitly: set image preserves the pod OLD resource block, which previously caused an OOM crash-loop on a stale memory limit, so after rollout the live resources are checked against the committed manifest (512Mi limit) and corrected with set resources if they drifted. Post-deploy verification confirms four facts against /healthz — running version is 1.3.0, the pod is healthy and not crash-looping, WRITES_DISABLED is true, and SMS_PROVIDER is log. There is no automated rollback; a failed deploy is reported with the last-known-good image and left for the operator.
DECISION Approve the RELEASE of v1.3.0 (OOHDASH-82 area-model, gateway fix, aircon referral) to live — code-only, writes stay locked, SMS stays log, deployed by scoped set image with a post-rollout resource check and a four-fact /healthz verification? | Approve release and deploy v1.3.0 | Hold release
DETAIL Release cut state: version bumped 1.2.4 to 1.3.0 via npm run release:minor from clean main, commit b65560b, tag v1.3.0, both pushed to origin. Working tree was clean of tracked changes at cut; one untracked cross-stream WIP note was deliberately left untouched and excluded. Gate reference: this release maps to the test gate result in PR 46 (merged, main at a043031 before the bump). Deploy target: namespace iot-services, deployment ooh-dashboard, image apitechhub.azurecr.io/ooh-dashboard, live at https://ooh.airedale-group.io. No secrets appear in this artefact.
-->

# OOHDASH-82 Area-Model Redesign — RELEASE Gate (v1.3.0)

**Date:** 2026-09-24
**Release:** R1
**Version:** 1.3.0 (first genuine 1.3.0 — an earlier "1.3.0" was only a raw redeploy and was never a real cut)
**Release commit / tag:** b65560b / v1.3.0
**Gate reference:** Test gate PR #46 (merged; main at a043031 pre-bump)

---

## 1. Decision requested

Approve the live deploy of **v1.3.0** for OOHDASH-82. All four prior gates are cleared and merged. The version is already bumped, committed, tagged, and pushed on `main`; **nothing has been deployed**. This gate authorises the deploy of already-reviewed, already-tested code. The release is **code-only** — it enables no device write and no SMS.

## 2. What ships

- **Two-area heating model.** The heating step derives at most two caller-meaningful named areas (Accommodation, Bar-Restaurant) from a device area field and stores the handler's choice **by name, not by list index**. Serials and gateways are structurally excluded from the area candidate set. A multi-device area surfaces its **coldest online zone** with an honest "coldest of N zones" note; a single-device area degrades to exactly today's single read.
- **Gateway misclassification fix.** The `ASSET_INTENT` match order is reordered so a paired Salus **gateway** is no longer mis-typed as a controllable thermostat, backstopped by a structural area allowlist. The reorder only affects no-telemetry devices; real thermostats still classify capability-first.
- **Aircon referral (Intesis control removed).** All Intesis aircon control is removed. Every aircon request — the in-context shortcut and a typed keyword — becomes a captured **aircon-referral** ticket with a caller script and **no control button anywhere**. The net effect **reduces** the control surface.

## 3. Test evidence (carried from PR #46)

- **Unit:** 252 pass / 0 fail / 1 skip (253 total). Re-run green on the release commit at bump time.
- **Playwright (fixture mode):** 47 pass / 2 fail of 49. Both failures are a **single pre-existing environment condition** — the P1 SMS provider runs in **log mode** (no Twilio), so the honest "text not sent — phone the on-duty manager" wording renders where two legacy specs assert Twilio-sent wording. Proven pre-existing by running those specs on the pre-build commit `7768535`, where they fail identically. Not a regression; not a product bug.
- **New coverage:** `tests/area-model.spec.js` is 8 of 8 green, driving a mixed site (6218) end to end on observed DOM content and real network POST bodies — chips render as Accommodation / Bar-Restaurant (never serials or a gateway), the coldest-online read carries the honest note, the paired gateway is absent from the area set, and every aircon request lands as an `aircon-referral` capture with no control button.

## 4. Accepted live re-test condition (design §10.3)

Three acceptance items carry a named handler-login Playwright re-test that **cannot** be exercised headlessly because they depend on live inventory and session state:

- **AC1 — chip render:** on a live mixed site, the first heating step shows the named area chips (plus fallback chip if present) and an aircon shortcut, with no serials or gateway chips.
- **AC2 — live coldest-zone read:** choosing an area shows the live coldest online zone with the "coldest of N zones" note and a confirmed-area line that reads the area name, not a serial.
- **AC4 — referral ticket:** the aircon shortcut and a typed keyword each raise an `aircon-referral` capture ticket with no control button.

The test gate approved on that basis. This condition travels into the release as a **tracked post-deploy handler spot-check**, not a blocker to shipping the code.

## 5. Deploy method

Deploy follows the scoped path in the CIR deploy doc:

- Build the image in ACR from a **clean `git archive` export** (never the repo dir — the `.claude/worktrees` long-path breaks the tar walk), tagged with both the git sha and `v1.3.0`.
- Roll out with `kubectl set image` on `deployment/ooh-dashboard` in namespace `iot-services`, via the **deployer-ooh** scoped kubeconfig. `set image` leaves the pod env block untouched.
- **Resource-drift check.** `set image` preserves the pod's OLD resource block, which previously caused an OOM crash-loop on a stale memory limit. After rollout, live resources are checked against the committed manifest (512Mi limit) and corrected with `set resources` if they drifted.
- **No automated rollback.** A failed deploy is reported with the last-known-good image reference and left for the operator to decide.

## 6. Safety invariants (hard)

- **Writes stay locked.** `WRITES_DISABLED` stays `true`. The release enables no device actuation; Warmer/Cooler still routes to the write-locked capture path. The latent apply-to-all fan-out remains behind the write-lock and is flagged as a separate write-flip precondition — it is not part of this release.
- **SMS stays log.** `SMS_PROVIDER` stays `log`. No text is sent; the honest "phone the on-duty manager" wording is the intended behaviour.
- **`set image` cannot flip either** — env is untouched by construction. Both invariants are verified against `/healthz` after deploy.
- **No secrets** appear in this artefact or the release commit.

## 7. Post-deploy verification (four facts)

After rollout, confirm against `/healthz`:

- Running version reports **1.3.0**.
- Pod is **healthy** (rollout complete, not crash-looping).
- **`WRITES_DISABLED` is `true`**.
- **`SMS_PROVIDER` is `log`**.

## 8. Rollback reference

If the deploy misbehaves, roll back with `kubectl set image` to the previously-live image tag captured before rollout. No force operations, no automated recovery — the operator decides.
