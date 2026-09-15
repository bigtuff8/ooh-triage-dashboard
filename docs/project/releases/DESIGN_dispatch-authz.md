<!-- gate:contract
SECTION Scope: This design covers OOHDASH-67 ONLY — the control-dispatch authorisation decision. It contains no /healthz work and no CX/confirm-loop material. Carried conditions and blockers live in the register.
SECTION Hard gate: This design is HARD-GATED on R4 — the true sign-in-eligible population (B2C app-assignment / OIDC audience), owner Spencer, UNVERIFIED. The pattern is specified for review; it must NOT be committed or merged until R4 clears. R4 is not closed here.
SECTION Current state: Dispatch (POST /control/dispatch) is requireAuth-only with no role check (api.js:140). The only requireRole('iot') is the /admin sub-router (api.js:346). requireRole is exact-match (auth.js:223). Role precedence already exists as ROLE_PRECEDENCE (auth.js:175). All cited to file:line.
SECTION Recommendation: Option A2 — an app-level dispatch gate, rank-aware. Add a requireMinRole('handler') guard built on ROLE_PRECEDENCE, which admits handlers and iot and denies role-less authenticated users. This closes the any-authenticated-user hole regardless of how broad sign-in is.
SECTION Exact-match trap: A naive requireRole('iot') would, because of exact-match, lock out every handler — the opposite of today. This is why the rank-aware guard is required and why iot-only is a policy toggle, not a one-liner.
SECTION Policy knob and sizing: The same guard becomes requireMinRole('iot') if Decision 4 goes iot-only, but that needs iot provisioned to every intended dispatcher (an ops action). Small code surface, real ops dependency.
SECTION Tests: The authz matrix — handler permitted, iot permitted, role-less denied 403, admin stays iot-only, and the iot-only toggle behaviour. Runs behind the R4 gate before commit.
DECISION authz-recommendation: Option A2 — add an app-level dispatch gate to POST /control/dispatch via a rank-aware role guard (requireMinRole) built on ROLE_PRECEDENCE (auth.js:175), NOT a naive exact-match requireRole('iot') which would lock out all handlers (auth.js:223). Handler is the minimum dispatch rank; iot outranks it. Defence-in-depth independent of how broad sign-in is.
DECISION R4-gating: The authz decision is HARD-GATED on R4 — verifying the B2C app-assignment / OIDC audience (the true sign-in-eligible population), owner Spencer, UNVERIFIED. This design specifies the pattern but committing/merging it is BLOCKED until R4 is confirmed. R4 is not closed and must not be treated as closed.
-->

# Design — OOHDASH-67 dispatch authorisation (Option A2, rank-aware) — **HARD-GATED ON R4**

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Design · **Ticket:** OOHDASH-67 · **Date:** 2026-09-12
**Repo state (verified):** `main`, app v1.2.0. `POST /control/dispatch` is `requireAuth`-only (no role gate) at `routes/api.js:140`; the only `requireRole('iot')` is the `/admin` sub-router at `routes/api.js:346`.
**Scope:** exactly one thing — the dispatch authz decision. No `/healthz`, no CX, no confirm-loop timing. Carried conditions and pre-flip blockers (B0–B3) live in `RELEASE_CONDITIONS_REGISTER.md`, referenced here, not re-pasted.
**Method:** every code claim verified firsthand against deployed source on `main`, cited to `file:line`. R4 and any external-owned item is marked **UNVERIFIED** with its owner.

> **HARD GATE — R4.** This design is **presented for review, not for commit.** The final authz decision is hard-gated on **R4** — verifying the B2C app-assignment / OIDC audience (the true sign-in-eligible population), **UNVERIFIED**, owned by **Spencer**. See the register for R4's full row. **Do not merge the authz change, and do not treat R4 as closed.**

---

## 1. Verified current state

- `POST /control/dispatch` (`api.js:140`) sits behind `requireAuth` **only** — there is **no `requireRole`** on it. The route body calls `control.dispatch()` and returns the action (`api.js:140-147`).
- The sole `requireRole('iot')` in the file is the `/admin` sub-router: `admin.use(requireRole('iot'))` (`api.js:346`).
- `requireRole` is **exact-match**: `if (op.role !== role) return 403` (`auth.js:223`).
- Role precedence already exists: `const ROLE_PRECEDENCE = ['iot', 'handler']` (`auth.js:175`), used by `mapRole()` to resolve the higher-privilege role when a user holds both claims (`auth.js:197`); an unmapped/role-less user resolves to `null` (`auth.js:197`), which `/auth/callback` already 403s (`auth.js:321-323`).
- The header comment claims "privileged routes add `requireRole('iot')`" (`api.js:2-4`) — but that pattern is **not applied to dispatch**; it is applied only to `/admin`.

**Consequence.** The dispatch-capable population = **every authenticated user**, not the claimArea-1500 handler set. Conservative default until R4 proves otherwise: *"any authenticated tenant user can dispatch."* This strengthens the case for an app-level dispatch gate (defence-in-depth) over relying on sign-in restriction alone.

---

## 2. Recommendation — Option A2, rank-aware app-level dispatch gate

**The exact-match trap (why not a one-liner).** A naive `requireRole('iot')` on dispatch would, because of exact-match (`auth.js:223`), **exclude every handler** — the opposite of today, locking out all current operators unless each is also provisioned iot(1400). So iot-only via the existing guard is wrong.

**The design — a rank-aware `requireMinRole` guard built on `ROLE_PRECEDENCE`:**

- Add a new guard `requireMinRole(minRole)` alongside `requireRole` in `services/auth.js`, admitting any operator whose role **ranks at least as high as** `minRole` per `ROLE_PRECEDENCE` (`auth.js:175`). Because precedence is `['iot','handler']` (index 0 = highest), "rank at least as high as `minRole`" = `indexOf(op.role) <= indexOf(minRole)`, with unknown/`null` role denied.
- Gate `/control/dispatch` (`api.js:140`) with `requireMinRole('handler')` — this **admits handlers and iot**, denies any authenticated user with no OOH role (already `null` via `mapRole`, `auth.js:197`). This is the **minimum-viable dispatch gate** that does not lock out handlers.
- **Policy knob for tightening:** if Decision 4 later goes *iot-only*, the same guard becomes `requireMinRole('iot')` **without** the exact-match trap — but that still requires iot provisioned to everyone who should dispatch (an ops action), so it is a policy toggle, not the default. Default recommendation: gate at `handler`.
- **Align the ripple:** the header comment (`api.js:2-4`) and any UI affordance must be updated to the landed policy; the `/control/actions/:id` (`api.js:149`) and `/wait` (`api.js:155`) status routes are reads/extends — policy choice whether they inherit the same `requireMinRole('handler')` (recommended, for consistency).

**Why A2 over A1 (sign-in-restriction-only).** A1 relies entirely on R4 proving sign-in is tightly and durably restricted, with **no in-app defence** if the app is later assigned more broadly. A2 is independent of sign-in breadth — defence-in-depth. Given the conservative "any authenticated user" default, A2 is the safer commit.

**iot-only rework sizing (SHAPING condition "iot-only rework scope characterised").** One route gains a gate (`api.js:140`); the change is a new `requireMinRole` guard in `auth.js` (no rework of the exact-match `requireRole`, which stays for `/admin`). If iot-only is chosen, the extra cost is **ops provisioning of iot(1400)** to all intended dispatchers, plus the two-role test matrix in §4. Small code surface, real ops dependency.

---

## 3. What blocks commit

The pattern above is review-ready but **not committable** until R4 clears. Until then:

- the **minimum** at flip is the `requireMinRole('handler')` gate (closes the "any authenticated user" hole regardless of R4);
- the **choice between `handler`-min and `iot`-min** depends on who R4 says can sign in and whether the intent is handler-can-control or iot-only.

R4 and all other carried items (B0–B3, C1–C9, R0–R11, the 12 shaping conditions) live in `RELEASE_CONDITIONS_REGISTER.md` — refer there rather than re-pasting. **None is closed.**

---

## 4. Authz test matrix (runs behind the R4 gate before commit)

- `handler`-role user → `POST /control/dispatch` **permitted** (the exact-match trap is avoided).
- `iot`-role user → dispatch **permitted** (outranks handler).
- authenticated user with **no OOH role** (`mapRole → null`, `auth.js:197`) → dispatch **denied 403**.
- `/admin` kill-switch stays **iot-only** (unchanged, `api.js:346`).
- If iot-only policy is toggled: handler → **denied**, iot → **permitted** (proves the policy knob and confirms iot provisioning is required).

---

*All line numbers cited against repo `main`, 2026-09-12, verified firsthand for this artefact: `api.js:2-4,140,140-147,149,155,346`, `auth.js:175,197,219-228,223,321-323`. R4 is UNVERIFIED, owned by Spencer. This artefact specifies the authz pattern only; it does not invoke gates, open a PR, commit the change, or flip anything.*
