<!-- gate:contract
SECTION Scope: This design covers OOHDASH-24 ONLY — the /healthz stale-green read-health fix. It is the buildable, unblocked ticket in the live-control release. It contains no authz, no pre-flip blockers, no CX/confirm-loop material; those live in their own artefacts and in the shared conditions register.
SECTION The defect: Read health is a lazy latch. It starts false, flips true on the first successful call, and never re-evaluates unless a call is actually attempted. So a read credential that authenticated once and has since died presents as healthy/green on a quiet pod — a dead read shown as good. Cited to file:line.
SECTION The fix: Replace the lazy latch with an active read probe on the healthcheck path and a tri-state (unconfigured / unknown-amber / healthy-green / unhealthy-red). A configured-but-unexercised read reports amber, never green; a once-good-now-dead read flips to red on the next probe past the freshness TTL. HTTP stays 200 (K8s probe policy); the truth lives in the body.
SECTION Code surface: The exact files and functions the fix touches — tb-client.js (the latch and status emit), server.js (the degraded predicate), config.js (a new healthProbeTtlMs knob).
SECTION Tests: The four proving tests — unexercised-configured is amber not green; stale-green becomes unhealthy after the TTL with no intervening read; genuinely healthy stays green; all states return HTTP 200.
SECTION Carried condition: One pointer only — C3 (read-token expiry vs device-silence) is partially de-risked by the active probe. All other carried conditions and blockers live in the register, not here.
DECISION healthz-approach: Replace the lazy read-health latch with an ACTIVE probe plus tri-state (unconfigured / unknown / healthy / unhealthy). A configured-but-unexercised read is amber (never green); a read that authenticated once but whose cred has since died reports unhealthy on the next probe past the TTL. Never present a dead or unexercised read as green. Surface in the /healthz body; keep HTTP 200 per the K8s probe policy at server.js:63-65.
-->

# Design — OOHDASH-24 `/healthz` stale-green read-health fix

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Design · **Ticket:** OOHDASH-24 · **Date:** 2026-09-12
**Repo state (verified):** `main`, app v1.2.0. Read/write health is a lazy latch in `services/tb-client.js`; `/healthz` marks the pod degraded when `thingsboard.mode==='live' && thingsboard.read===false` (`server.js:66-70`).
**Scope:** exactly one thing — the `/healthz` stale-green read-health fix approach. **Nothing else.** No dispatch authz, no pre-flip blockers (B0–B3), no confirm-loop timing, no site-identity or hot-water CX — those are out of scope for this ticket and live in their own artefacts. Carried conditions live in `RELEASE_CONDITIONS_REGISTER.md`; this design references only the one that genuinely touches -24.
**Method:** every code claim verified firsthand against deployed source on `main`, cited to `file:line`.

---

## 1. The defect (verified)

Read health is a **lazy latch**. `tbSession()` holds a closure variable `let healthy = false` (`tb-client.js:28`). It flips to `true` only after a successful `getToken()` (`tb-client.js:34`) or a successful `request()` (`tb-client.js:47`), and back to `false` only when a `request()` throws (`tb-client.js:51`). `tbStatus()` then reports `read = readSession.isConfigured() && readSession.isHealthy()` (`tb-client.js:149`, where `isHealthy`/`isConfigured` are the closure accessors at `tb-client.js:55`). `/healthz` marks the pod degraded when the read flag is `false` in live mode (`server.js:70`).

Two failure shapes fall out of this:

- **False amber (today, benign-ish).** A *configured, valid, but unexercised* read cred reports `read=false` at boot (nothing calls the read session at start-up), so `/healthz` says `degraded` even though the cred is fine. Confusing, but fail-safe.
- **Stale green (the real risk — the OOHDASH-24 target).** Once the read session succeeds **once**, `healthy` latches `true`. If the cred is later revoked or expires and **no read runs** (e.g. a quiet overnight with no dispatch, so no `readControlState`, `tb-client.js:132`), `read` stays `true` — a **dead read cred presents as healthy/green**. `healthy` drops only on an *attempted* request that errors (`tb-client.js:51`); with no attempt, it never re-evaluates. A tester judging control-readiness off a green banner is misled.

---

## 2. The fix — active read probe + tri-state

Replace the binary lazy latch with a **tri-state health** driven by an **active probe on the healthcheck path**:

<table>
<thead><tr><th>State</th><th>Meaning</th><th>How derived</th></tr></thead>
<tbody>
<tr><td><code>unconfigured</code></td><td>No read creds present</td><td><code>!isConfigured()</code> — username/password absent (`tb-client.js:55`)</td></tr>
<tr><td><code>unknown</code> (amber)</td><td>Configured but not actively proven this cycle</td><td>Configured, and the last active probe is stale/never-run — <strong>never reported as green</strong></td></tr>
<tr><td><code>healthy</code> (green)</td><td>An auth/read succeeded within the freshness window</td><td>Last active probe (or a real read) returned OK inside <code>healthProbeTtlMs</code></td></tr>
<tr><td><code>unhealthy</code> (red)</td><td>The last active probe failed (401 / transport)</td><td>Active probe error — distinguishes a genuinely dead cred from merely-unexercised</td></tr>
</tbody>
</table>

**Concrete mechanism.** Add a lightweight **active read probe** — a cheap authenticated call on the read session (the existing `getToken()` login against `${config.thingsboard.url}/api/auth/login`, `tb-client.js:31`, or a minimal tenant read) — invoked (a) lazily from `tbStatus()` when the cached probe result is older than a TTL, or (b) on a low-frequency background timer, mirroring the existing eager store warm-up probe pattern at `server.js:126-128`. Record `{ ok, checkedAt }` and derive the tri-state from freshness + outcome so that:

- a **configured-but-unexercised** read is `unknown`/amber, never green;
- a **once-good-now-dead** read flips to `unhealthy` on the next probe rather than latching green;
- HTTP status stays **200** regardless — K8s liveness/readiness both hit `/healthz` and, at `replicas:1`, a non-2xx on a transient blip would restart/deregister the only pod (the policy documented at `server.js:63-65`). The truth lives in the body's `status`/`subsystems`; the degraded predicate at `server.js:66-70` is updated so read states `unknown` and `unhealthy` both count as not-green, with `unknown` surfaced distinctly from `unhealthy`.

---

## 3. Code surface

<table>
<thead><tr><th>File</th><th>Change</th></tr></thead>
<tbody>
<tr><td><code>services/tb-client.js</code></td><td>Replace the boolean <code>healthy</code> latch (`:28`, set at `:34`/`:47`/`:51`) with a probe-result record + freshness TTL; add an <code>activeReadProbe()</code> reusing <code>getToken()</code> (`:29-37`) or a minimal read; have <code>tbStatus()</code> (`:145-153`) emit the tri-state for <code>read</code>. The same mechanism applies to <code>write</code> as a bonus but that is out of -24 scope.</td></tr>
<tr><td><code>server.js</code></td><td>Update the <code>degraded</code> predicate (`:66-70`) to map the read tri-state — amber <code>unknown</code> is not green, <code>unhealthy</code> is degraded; keep HTTP 200 (`:63-65`). The current predicate only tests <code>read===false</code>.</td></tr>
<tr><td><code>config.js</code></td><td>Add a control/thingsboard knob <code>healthProbeTtlMs</code> (env-overridable, default e.g. 60000) alongside the existing control timers (`:112-116`).</td></tr>
</tbody>
</table>

---

## 4. Proving tests (design)

1. **Unexercised-configured → amber, never green.** Boot live-mode with valid read creds, run no read; assert `/healthz` `subsystems.thingsboard.read` is `unknown` (amber) and NOT `healthy`. *(The false-green-at-boot direction cannot present green.)*
2. **Stale-green cannot persist (the OOHDASH-24 core).** Prime the read session healthy (one successful probe), then make the cred fail (stub the read session to 401) with **no dispatch/read in between**; advance past `healthProbeTtlMs`; assert the next `/healthz` reports `unhealthy` (red), not stale `healthy`. *(A dead-but-once-good cred is caught without needing a device read to trigger it.)*
3. **Genuinely healthy stays green.** Valid cred, probe succeeds within TTL → `read: healthy`, `/healthz.status: ok`.
4. **HTTP 200 invariant.** All states return HTTP 200 (K8s probe safety, `server.js:63-65`).

*Stubbing note:* tests drive the read session via the existing fixture/live seam (`config.dataMode`, `tb-client.js:120,134`; fixture `tbStatus()` short-circuits to `read:true` at `tb-client.js:146`) — no live `portal.lhlive.co.uk` call in CI.

---

## 5. Carried condition (pointer only)

This ticket touches exactly **one** carried condition. See `RELEASE_CONDITIONS_REGISTER.md` for its full row, owner and resolve-before:

- **C3 — read-token expiry vs device-silence.** The active probe gives an independent read-auth signal, so an auth failure during the poll can later be surfaced as "read health/auth degraded" distinct from device silence. -24 **partially de-risks** C3; it does not close it (finalising the poll-path UX distinction is a separate design concern). This is the only carried item -24 relates to — B0–B3, R4/authz, DHW/hot-water scope, site-identity, confirm-loop timing and every other condition are **out of scope here** and tracked in the register.

---

*All line numbers cited against repo `main`, 2026-09-12, verified firsthand for this artefact: `tb-client.js:28,29-37,34,47,51,55,120,132,134,145-153`, `server.js:63-65,66-70,126-128`, `config.js:112-116`. This artefact decides the -24 fix approach only; it does not invoke gates, open a PR, or flip anything.*
