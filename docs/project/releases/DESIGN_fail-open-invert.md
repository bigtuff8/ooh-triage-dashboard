<!-- gate:contract
SECTION Scope: This design covers OOHDASH-12 ONLY — inverting the fail-OPEN default on the deploy-time device-write lock so that absence or ambiguity of the flag means writes DISABLED (fail-CLOSED). It contains no authz (-67), no /healthz read-health (-24) and no confirm-loop material; those live in their own artefacts and in the shared conditions register.
SECTION The defect: config.js:87 reads `writesDisabled: env('WRITES_DISABLED') === 'true'`. Because env() returns undefined for an unset/empty var (config.js:19-22), a missing, misspelled, empty or wrong-typed WRITES_DISABLED evaluates the whole expression to false — meaning writesDisabled=false — meaning writes are ON. For a system where a write is an irreversible physical actuation on a live pub, the safe default of absence must be writes-DISABLED, not writes-enabled. This is the single most dangerous line for the eventual flip.
SECTION The fix: Invert to an explicit-enable contract. Writes are permitted ONLY when WRITES_DISABLED is set to exactly the canonical string "false" (case/space-normalised); EVERYTHING else — unset, empty, "true", "False ", "0", "no", a typo, any other value — resolves to writesDisabled=true (fail-CLOSED). Absence never enables. The enable is a deliberate, spelled-out act, not the mere lack of a disable flag.
SECTION Boot visibility: server.js already logs auth/data/origin at listen (server.js:133-134) but NOT the write-lock state. Add a LOUD, unambiguous boot line announcing WRITES ENABLED vs WRITES DISABLED and, when enabled in production, a distinct warning — so a fail-closed-by-accident (or a fail-open-by-accident, now impossible by absence) is visible at boot, contrasting the stale-green problem -24 fixes. writesDisabled is already surfaced in the /healthz body (server.js:76).
SECTION S4 audit surface: This change is NOT safe to merge until every place the flag is (or should be) set is reconciled to the new contract: k8s/deployment.yaml (sets "true" — safe, but its VALUE now carries load-bearing meaning), .env.example (currently HAS NO WRITES_DISABLED line at all — must be added documenting the explicit-enable contract), Dockerfile (ENV NODE_ENV only — confirm no stray default), and dev/fixture/CI paths where DATA_MODE≠live means no device writes anyway. No docker-compose and no CI workflow exist in-repo — recorded as absent.
SECTION Tests: unset → disabled; "" → disabled; "true" → disabled; "false" → enabled; " false" / "FALSE" → decide per normalisation and test that exact contract; a typo'd var name → disabled. Plus the boot-log assertion and the /healthz writesDisabled echo.
DECISION fail-open-invert-contract: Replace `env('WRITES_DISABLED') === 'true'` (config.js:87) with a fail-CLOSED explicit-enable contract: `writesDisabled` is false ONLY when the normalised value of WRITES_DISABLED is exactly "false"; unset/empty/any-other-value ⇒ true (writes disabled). Absence or ambiguity means DISABLED. This keeps the eventual OOHDASH-19 flip a deliberate, auditable act (enable = explicitly writing "false"), preserves condition C5's B0–B3-green checklist as the human gate, and is gated on the S4 environment-config audit before merge.
-->

# Design — OOHDASH-12 invert the fail-open device-write default

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Design · **Ticket:** OOHDASH-12 · **Date:** 2026-09-15
**Repo state (verified):** `origin/main`, app v1.2.0. The deploy-time write lock is `writesDisabled: env('WRITES_DISABLED') === 'true'` (`config.js:87`); it is checked FIRST and synchronously on every device-write path (`services/killswitch.js:32-34`).
**Scope:** exactly one thing — inverting the fail-OPEN default so absence/ambiguity of the flag means writes DISABLED. **Nothing else.** No dispatch authz (-67), no `/healthz` read-health (-24), no confirm-loop timing. Carried conditions live in `RELEASE_CONDITIONS_REGISTER.md`; this design references only the rows that genuinely touch -12 (S4, C5).
**Method:** every code claim verified firsthand against `origin/main` (local `main` is stale), cited to `file:line`.

---

## 1. The defect (verified)

The env reader normalises unset **and** empty to `undefined`:

```js
const env = (key, fallback = undefined) => {
    const v = process.env[key];
    return v === undefined || v === '' ? fallback : v;   // config.js:19-22
};
```

The write lock then reads:

```js
writesDisabled: env('WRITES_DISABLED') === 'true',       // config.js:87
```

This is **fail-OPEN**. `env('WRITES_DISABLED')` is `undefined` when the var is unset, empty, or misspelled at the call site — and `undefined === 'true'` is `false`, so `writesDisabled` becomes **`false`**, which means **writes are ON**. The same falls out for any value that is not the exact string `'true'`: `'True'`, `'1'`, `'yes'`, a trailing space, or a typo in the *variable name* in the manifest. In every one of those cases the lock silently disengages.

**Consequence.** `killswitch.writesBlocked()` checks `config.writesDisabled` first and synchronously — the F005 deploy-time guarantee (`killswitch.js:31-34`). If that flag is `false` by *accident of absence*, the very first gate on an irreversible physical actuation is open. For a control plane whose write is a real boiler/actuation on a trading pub, "the flag was missing so we defaulted to ON" is exactly the wrong default. The comment at `config.js:83-86` even claims the design is "fail-safe by design" — it is not; the code fails open.

> The current manifest does set `WRITES_DISABLED=true` (`k8s/deployment.yaml:68-69`), so production is presently locked. This ticket removes the reliance on that value being present and correct — it makes *absence* safe, so a dropped line, a rename, or a hand-rolled apply cannot silently unlock writes.

---

## 2. The fix — invert to an explicit-enable (fail-CLOSED) contract

Replace the fail-open predicate with a contract where **writes are enabled only when the operator has explicitly and unambiguously spelled out enable**, and **everything else — unset, empty, typo, wrong value — means DISABLED**.

**Chosen truthy contract.** `writesDisabled` is `false` (i.e. writes permitted) **only** when the normalised value of `WRITES_DISABLED` is exactly the string `"false"`. Normalisation = read the raw `process.env.WRITES_DISABLED` (NOT via `env()`, whose empty→fallback collapse we must not inherit here), trim surrounding whitespace, lower-case, and compare to `"false"`. Any other outcome — `undefined`, `""`, `"true"`, `"0"`, `"no"`, `"disable"`, a mistyped value, or a var name typo (which yields `undefined`) — resolves to `writesDisabled = true`.

```js
// config.js:87 (replacement) — fail-CLOSED: writes enabled ONLY on an explicit, exact "false".
// Absence or ANY ambiguity ⇒ disabled. Read raw so unset/empty cannot masquerade as anything
// but "not exactly false".
writesDisabled: (process.env.WRITES_DISABLED ?? '').trim().toLowerCase() !== 'false',
```

**Why `"false"` as the enable token, not a bespoke `"ENABLE_WRITES"`.** The existing manifest, runbooks and DEPLOYMENT_REQUEST already model the flip as *"flip `WRITES_DISABLED` off"* — go/no-go #3 sets `WRITES_DISABLED=false` (`docs/project/DEPLOYMENT_REQUEST.md:57`). Keeping the same variable and the same intended flip value means the human procedure does not change; only the *default in absence* inverts. The name still reads correctly: `WRITES_DISABLED=false` = writes disabled? false = writes enabled. Introducing a second inverted variable would create two flags that must agree — a worse failure surface.

**Why exact-match, not "truthy-ish".** A permissive parse (treat `"0"`/`"no"`/`""` as enable) re-opens the same class of ambiguity we are closing. The whole point is that the *enable* side is narrow and deliberate and the *disable* side is the wide catch-all. Only one exact string opens the lock.

### 2.1 Interaction with the OOHDASH-19 flip and condition C5

The eventual flip (OOHDASH-19) becomes: set `WRITES_DISABLED=false` in the manifest as one line of a reviewed PR. Under the new contract this is a **deliberate, auditable act** — writes turn on because someone explicitly typed the enable token, never because a disable flag drifted away. This is precisely what **C5** requires: no interlock today binds the B0–B3-green probes to the flip, so the flip PR must carry an **explicit B0–B3-green checklist** as its human gate. This design does not create that checklist (it is a release-preflight artefact, per C5's row) but it **preserves the property C5 depends on**: the flip cannot happen by the *mere absence* of a disable flag — it now requires a positive, greppable `WRITES_DISABLED=false` diff that the checklist can be attached to.

### 2.2 Boot visibility

Today `server.js` logs `auth · data · origin` at listen (`server.js:133-134`) but says **nothing** about the write-lock state, and `validateConfig()` (`config.js:134-164`) does not mention it either. Add a **loud, unambiguous boot announcement** so a mis-set flag is caught at start-up rather than at first dispatch — the same "don't let a dangerous state hide behind a quiet green" lesson the `/healthz` stale-green fix (-24) applies:

- On start-up, after `validateConfig()`, log one clearly-marked line:
  - `writesDisabled === true` → `console.log('[WRITE-LOCK] Device writes are DISABLED (WRITES_DISABLED lock engaged).')`
  - `writesDisabled === false` → `console.warn('[WRITE-LOCK] *** DEVICE WRITES ARE ENABLED *** WRITES_DISABLED=false — live actuations will fire.')`, and in production (`config.isProduction`) make it a distinct, unmissable warning banner line.
- The state is already surfaced in the `/healthz` body as `writesDisabled` (`server.js:76`), so the boot log and the live probe agree; no change needed to the health contract itself.

This guarantees the enabled state is never silent, and the disabled state is positively confirmed at boot (so a fail-closed-by-accident is also visible, not just assumed).

---

## 3. Code surface

| File | Change |
|------|--------|
| `config.js` | Replace the fail-open predicate at `:87` with the fail-CLOSED explicit-enable contract (read raw `process.env.WRITES_DISABLED`, trim+lower, enabled only on exact `"false"`). Update the misleading "fail-safe by design" comment (`:83-86`) to describe the actual contract. |
| `server.js` | Add the loud `[WRITE-LOCK]` boot announcement after `validateConfig()` (near `:31-36` / the listen callback `:132-134`). No change to the `/healthz` body — it already echoes `writesDisabled` (`:76`). |
| `services/killswitch.js` | No logic change — `writesBlocked()` (`:31-34`) and `killSwitchState()` (`:53`) already consume `config.writesDisabled`; they inherit the safer default automatically. Verified, no edit needed. |

---

## 4. S4 — environment-config audit (REQUIRED; merge-blocking)

Condition **S4** requires an environment-config audit alongside this change. Because the change re-weights the *meaning of absence*, every place the flag is (or should be) set must be reconciled to the new contract before merge. Verified surface in this repo:

| Config source | Current state (verified) | Reconcile action |
|---|---|---|
| `k8s/deployment.yaml` | Sets `WRITES_DISABLED: "true"` (`:68-69`), under the "CANARY SAFETY LEVERS" comment (`:62-67`). | Safe under the new contract (`"true" ≠ "false"` ⇒ disabled). But the *value is now load-bearing*: the flip to `"false"` is the only enable. Update the comment to state the explicit-enable contract so a future editor cannot assume removing the line disables writes (it does — good — but the intent must be documented). |
| `.env.example` | **Has NO `WRITES_DISABLED` line at all** (verified — blob `54b1059`). Local dev runs `DATA_MODE=fixture`/`AUTH_MODE=dev` so no live device writes occur, but the template is silent on the flag. | **Add** a documented `WRITES_DISABLED=true` line (with a comment: "writes enabled ONLY when set to exactly `false`; unset/anything-else ⇒ disabled"). The template must teach the fail-closed contract; its current silence is the exact gap this ticket exists to close. |
| `Dockerfile` | Sets only `ENV NODE_ENV=production` (`:15`); all app config comes from K8s secrets/env (`:29`). No `WRITES_DISABLED` baked in. | Confirm no stray default is added at image-build time (an image-level enable would be invisible to the manifest reviewer). Leave the flag out of the image — the manifest is its single source. Verified clean. |
| dev / staging / CI paths | These run `DATA_MODE=fixture` (`config.js:31` default) or `dev` auth; `validateConfig()` refuses production with non-live data (`config.js:136-144`). No device writes fire regardless of the flag. | Document that non-live modes are write-inert; if any staging env runs `DATA_MODE=live`, it MUST carry an explicit `WRITES_DISABLED=true` under the new contract. |
| docker-compose · CI workflow env | **Absent from the repo** (verified: no `*compose*` file; no `.github/` workflows — the only `ci`-matching path is `services/reconciliation.js`). | Recorded as not-present. If a compose file or CI pipeline is added later that runs live mode, it inherits this contract and must set the flag explicitly. |

> **Merge gate.** Per S4, this change is **NOT safe to merge** until each row above is reconciled — in particular until `.env.example` documents the contract and the `k8s/deployment.yaml` comment states that the value is load-bearing. The register row (S4) closes only when its named gate records the audit done; the existence of this design does not close it.

---

## 5. Proving tests (design)

1. **Unset ⇒ disabled.** No `WRITES_DISABLED` in env → `config.writesDisabled === true`. *(The core defect: absence must now lock.)*
2. **Empty ⇒ disabled.** `WRITES_DISABLED=""` → `true`.
3. **`"true"` ⇒ disabled.** → `true` (still locked).
4. **Exact `"false"` ⇒ enabled.** `WRITES_DISABLED=false` → `writesDisabled === false`. *(The only enable path — the deliberate flip.)*
5. **Ambiguity ⇒ disabled.** `"False"`, `" false "`, `"0"`, `"no"`, `"disable"`, and a mistyped var name each → `true`; assert the exact normalisation contract (trim + lower-case, exact `"false"`) so `"FALSE"`/`" false"` resolve to *enabled* by that rule and are tested to prove the intended boundary, while un-normalisable junk stays disabled.
6. **Boot announcement.** Assert the `[WRITE-LOCK]` line reports DISABLED when locked and the loud WARN when enabled; assert `/healthz` body `writesDisabled` (`server.js:76`) matches `config.writesDisabled` in each case.
7. **Kill-switch inheritance.** `writesBlocked()` returns the deploy-time reason string (`killswitch.js:33`) whenever `writesDisabled` is `true`, with no Cosmos read — confirming the first synchronous gate honours the inverted default.

---

## 6. Carried conditions (pointers only)

See `RELEASE_CONDITIONS_REGISTER.md` for full rows, owners and resolve-before:

- **S4** — environment-config audit (dev/staging/CI + compose/.env templates + k8s manifest) before inverting the fail-open default. **Merge-blocking for -12** — enumerated in §4. Owner: build doer; resolves before OOHDASH-12 merges.
- **C5** — no interlock binds B0–B3-green to the `WRITES_DISABLED` flip; the flip PR needs an explicit B0–B3-green checklist. This design **preserves** the property C5 relies on (the flip must be a positive `=false` act, never absence) but does not create the checklist — that is a Release-preflight gate on OOHDASH-19.

All other carried items (B0–B3, C1–C4/C6–C9, R0–R11, the remaining shaping conditions) are **out of scope for -12** and tracked in the register. None is closed by this artefact.

---

*All line numbers cited against repo `origin/main`, 2026-09-15, verified firsthand for this artefact: `config.js:19-22,31,83-86,87,134-164`; `services/killswitch.js:31-34,53`; `server.js:31-36,76,132-134`; `k8s/deployment.yaml:62-69`; `.env.example` (blob `54b1059`, no `WRITES_DISABLED` line); `Dockerfile:15,29`; `docs/project/DEPLOYMENT_REQUEST.md:57`. This artefact decides the -12 fix approach only; it does not invoke gates, open a PR, commit the change, or flip anything.*
