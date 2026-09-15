<!-- gate:contract
SECTION Scope: This design covers C2 ONLY — the confirm-token single-use safety property on the control-dispatch path. It contains no authz (-67), no /healthz (-24), no confirm-loop timing (R11) and no site-identity CX (B0/C9) material; those live in their own artefacts and in the shared register. C4 is referenced only where the token lifecycle touches dispatch-time freshness.
SECTION Honesty — C2 is NOT closed here: C2 is a pre-flip SAFETY PROPERTY, not a design-closable item. This artefact establishes the verified current behaviour, specifies the design of a single-use guarantee, and states the proof obligation that must pass before the OOHDASH-19 flip. It does NOT declare C2 met.
SECTION The defect (verified): The confirm token is minted at confirmSite() and stored in an in-memory map (resolution.js:57). The dispatch gate calls isConfirmed() (control.js:49), which is a PURE READ of that map (resolution.js:65-68) — it never deletes/marks the token. The token survives for the full 4-hour CONFIRM_TTL (resolution.js:20) and can be presented repeatedly. Each accepted dispatch performs an irreversible device write (control.js:74). Therefore a network retry or double-click CAN double-dispatch. Cited firsthand to file:line.
SECTION The design: The token must be ATOMICALLY consumed exactly once — marked used within the same critical section that admits the dispatch — BEFORE any device write (control.js:74). A second dispatch with the same token must be rejected (409) before the write. The consume must cover the concurrency case (two near-simultaneous requests, single-replica event loop) and the retry case (client resends after timeout while the first write actually succeeded).
SECTION The proof obligation (before flip): Single-use is PROVEN, not asserted, by tests that must pass: (1) replay — a second dispatch with a used token is rejected 409 with exactly one writeSharedAttribute call; (2) concurrency — two dispatches with the same token interleaved yield exactly one write; (3) the happy path still dispatches once. Plus the multi-replica caveat is stated honestly.
DECISION c2-consume-before-write: Change isConfirmed() from a pure lookup into an atomic check-and-consume (consumeConfirmation()) invoked at the top of dispatch() before any side effect, such that the confirm token is removed from the confirmations map on first successful dispatch and any subsequent dispatch with the same token is rejected 409 before killswitch/resolve/guardrail/write. This must run BEFORE tb.writeSharedAttribute (control.js:74). C2 is not closed by this design; it is closed only when the replay+concurrency proof tests pass and the named gate records it, pre-OOHDASH-19-flip.
DECISION c2-scope-boundary: Single-replica atomicity (Node single-threaded event loop, synchronous map delete) is sufficient for the current replicas:1 deployment and must be the proof baseline. Cross-replica single-use (shared store / DB unique constraint) is NOT designed here; it is flagged as a known limitation that release-preflight (C5) must accept or close before any scale-out. This design does not assume durability across a pod restart — an in-flight token is lost on restart, which is fail-safe (a lost token denies, it does not double-dispatch).
-->

# Design — C2 confirm-token single-use (pre-flip safety property)

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Design · **Condition:** C2 · **Date:** 2026-09-15
**Repo state (verified):** `origin/main`. The confirm token is minted in `resolution.confirmSite()` (`resolution.js:50-58`) and checked by `resolution.isConfirmed()` (`resolution.js:65-68`), called as the first dispatch gate in `control.dispatch()` (`control.js:49`). The device write is `tb.writeSharedAttribute(...)` (`control.js:74`).
**Scope:** exactly one thing — the confirm-token single-use property. No dispatch authz (-67), no `/healthz` (-24), no confirm-loop timeout (R11), no site-identity CX (B0/C9). C4 is touched only where the token lifecycle meets dispatch-time freshness. Carried conditions live in `RELEASE_CONDITIONS_REGISTER.md`, referenced by ID.
**Method:** every code claim verified firsthand against `origin/main`, cited to `file:line`.

> **HONESTY GATE — C2 is a pre-flip SAFETY PROPERTY, not design-closable.** This artefact does **not** claim to close C2. It (a) establishes the current behaviour firsthand, (b) specifies the single-use design, and (c) states the proof that must pass **before the OOHDASH-19 flip**. C2 clears only when that proof passes and the named gate records it. A replayable irreversible device write is **unacceptable pre-flip**.

---

## 1. Verified current behaviour — the token is NOT consumed

The confirm-token lifecycle, traced end to end on `origin/main`:

- **Minted.** `confirmSite(siteNo, operator)` resolves the site, then `const token = randomUUID()` and `confirmations.set(token, { siteNo, operatorId, at: Date.now() })` (`resolution.js:56-57`). `confirmations` is a module-level in-memory `Map` (`resolution.js:16`). TTL is `CONFIRM_TTL_MS = 4 * 60 * 60 * 1000` — four hours (`resolution.js:20`), pruned lazily by age only (`resolution.js:22-24`).
- **Checked.** `dispatch()` gates on `if (!resolution.isConfirmed(confirmToken, siteNo, operator.id)) throw 409` as its **first** check (`control.js:49-51`).
- **`isConfirmed` is a PURE READ.** It prunes by age, then `const c = confirmations.get(token); return !!c && c.siteNo === String(siteNo) && c.operatorId === operatorId` (`resolution.js:65-68`). **It never deletes the token and never marks it used.**
- **The write.** After the kill-switch, device-resolve and guardrail checks, dispatch performs the irreversible device write `await tb.writeSharedAttribute(device, check.attribute, check.value)` (`control.js:74`), then mints a fresh `actionId` and audit record.

**Consequence — replay is possible, verified.** Because the token stays in the map for up to 4 hours and `isConfirmed` is idempotent, **the same `confirmToken` can drive multiple dispatches.** The module comment claims tokens are "consumed by control dispatch" (`resolution.js:16`) and "one per confirm" — but the code does **not** consume them; the comment is aspirational, not implemented. Two concrete replay shapes:

- **Retry after timeout.** The client POSTs a dispatch; the network drops the *response* but the write at `control.js:74` already succeeded. The client (or a proxy/user) retries with the same token → a **second physical actuation** on a live pub.
- **Double-click / concurrency.** Two near-simultaneous dispatches carry the same token. Both pass `isConfirmed` (nothing removed between them) → two writes.

There is no idempotency key on the write path either: each dispatch mints a new `actionId` via `randomUUID()` (`control.js:76`), so nothing downstream de-duplicates. **The token is the only single-use lever, and today it is not one.**

---

## 2. The design — atomic check-and-consume before any write

Replace the pure-read gate with an **atomic check-and-consume** so a confirm token authorises **exactly one** dispatch.

- **Add `consumeConfirmation(token, siteNo, operatorId)` in `resolution.js`.** It prunes by age, reads the entry, validates `siteNo` + `operatorId` (as `isConfirmed` does today), and — on a match — **deletes the entry in the same synchronous step** before returning true; on no match returns false. Because Node runs a single-threaded event loop and `Map.get`+`Map.delete` here are synchronous with **no `await` between them**, this is atomic against concurrent dispatches on one replica: the first caller deletes, the second sees nothing.
- **Call it as the first side-effect-free gate in `dispatch()`**, replacing the `isConfirmed` call at `control.js:49`, and critically **before** `killswitch.writesBlocked` (`control.js:54`), the device resolve (`control.js:57`) and the write (`control.js:74`). The consume must happen **before the first `await` that can precede the write**, so that two interleaved dispatches cannot both pass the gate. On a false result throw the existing 409 ("site not confirmed") — the replayed second request is rejected before any device contact.
- **Keep `isConfirmed` (pure read) only if a non-consuming caller genuinely needs it** (e.g. a UI pre-check). If no such caller exists, remove it to avoid a second, replayable path. Verify callers before deciding — a stray read-only caller must NOT be on the dispatch path.
- **Consume must be all-or-nothing relative to the accept decision, not relative to write success.** The token is spent when the dispatch is *admitted*, not when the device echoes. Rationale: if we only consumed on write success, a retry after a real-but-unacknowledged success (the exact double-dispatch case) would find the token still live. Spending on admission means a retry is denied — the handler must explicitly re-confirm to act again, which is the safe default for an irreversible action. The cost is that a dispatch which fails *before* the write (e.g. kill-switch blocked at `control.js:54`, device offline at `control.js:64`) also spends the token; that is acceptable and fail-safe (it denies, never double-fires). If re-confirm-on-benign-rejection proves too coarse in review, a follow-up may re-issue a token on those specific pre-write rejections — but the default is spend-on-admission.

**Relationship to C4 and the confirm loop (boundary only).** The token proves *the handler confirmed this site/operator*; it does **not** prove device freshness — that is **C4** (`getSitesByNumber` TTL cache, `bridge.js:101,130`), designed elsewhere. Single-use and freshness are orthogonal: consuming the token does not re-fetch the device, and C4's dispatch-time re-fetch decision is out of scope here. The confirm **loop** (`pollAll`/`pollOne`, `control.js` sync tracker) is unaffected — it operates on `actionId`, minted after the write, and never re-reads the confirm token. So single-use touches neither C4 nor the loop beyond this boundary note.

---

## 3. Code surface

| File | Change |
|------|--------|
| `services/resolution.js` | Add `consumeConfirmation(token, siteNo, operatorId)` — the current `isConfirmed` body (`:65-68`) plus a synchronous `confirmations.delete(token)` on the matched path, returning true only after deletion. Update the module comment (`:16`) to state that dispatch **consumes** the token (making the existing aspirational comment true). Decide whether to retain `isConfirmed` (only if a verified non-dispatch caller needs a pure read). |
| `services/control.js` | Replace `resolution.isConfirmed(...)` at `:49` with `resolution.consumeConfirmation(...)`, keeping it as the first gate and ensuring it runs before the first pre-write `await` and before `tb.writeSharedAttribute` (`:74`). No change to `actionId`/audit minting. |

No new config knob is required. TTL (`resolution.js:20`) is unchanged — single-use is enforced by consumption, not by shortening the window (though a shorter TTL is a reasonable defence-in-depth follow-up, out of scope for C2).

---

## 4. Proof obligation — how single-use is PROVEN before the flip

C2 is **not** cleared by this design; it is cleared when these tests pass and the named gate records it (before the OOHDASH-19 flip). The proof obligation:

1. **Replay rejected (core).** Confirm a site → obtain a token → dispatch once (assert exactly **one** `tb.writeSharedAttribute` call). Dispatch **again** with the same token → assert **409** and assert `writeSharedAttribute` was **not** called a second time. This is the direct C2 defect reproduction turned into a guard.
2. **Concurrency — exactly one write.** Fire two `dispatch()` calls with the same token without awaiting the first to completion (interleaved on the event loop). Assert exactly **one** succeeds, one is rejected 409, and `writeSharedAttribute` is called **exactly once**. Proves the consume is atomic against near-simultaneous requests on a single replica.
3. **Retry-after-success is denied.** Simulate the first dispatch's write succeeding but its response lost; retry with the same token → **409**, no second write. Handler must re-confirm to act again (the intended safe behaviour).
4. **Happy path intact.** A single dispatch with a fresh token performs exactly one write and returns the pending action unchanged from today.
5. **Wrong-owner / wrong-site still denied.** A token used with a mismatched `siteNo` or `operatorId` is denied and **not consumed for the legitimate owner** (i.e. the mismatch path must not spend someone else's token) — confirm the delete only fires on a full match.

*Test seam:* drive `resolution` and `tb-client` via the existing fixture/live seam (`config.dataMode`); stub `tb.writeSharedAttribute` to count calls — no live `portal.lhlive.co.uk` write in CI.

**Honest limitation — single-replica only.** This design guarantees single-use on **one** replica (Node single-threaded, in-memory map, synchronous delete). At `replicas:1` that is sufficient and is the proof baseline. **Cross-replica** single-use (two pods sharing one token via a load balancer) is **not** provided by an in-memory map and is **not** designed here; it would need a shared store or a DB unique constraint on the token. This is flagged for **release-preflight / C5** to accept (given `replicas:1`) or close before any scale-out. A pod restart drops in-flight tokens — fail-safe (denies, never double-fires).

---

## 5. Conditions referenced

- **C2** — the subject. Pre-flip safety property; this design specifies the consume-before-write guarantee and the proof obligation. **Not closed here.**
- **C5** (no interlock binding safety probes to the flip; release-preflight) — the **cross-replica** single-use gap and the "proof tests green before flip" checklist belong to C5's release-preflight gate. Cross-referenced, not designed here.
- **C4** (dispatch-time freshness) — orthogonal; token single-use does not re-fetch the device. Boundary noted in §2, designed elsewhere.
- **OOHDASH-19 flip** — a replayable irreversible write is unacceptable pre-flip; C2's proof tests are a precondition for the flip alongside B0–B3/C5.

---

*All line numbers cited against `origin/main`, 2026-09-15, verified firsthand for this artefact: `resolution.js:16,20,22-24,50-58,56-57,65-68`, `control.js:47,49-51,54,57,64,74,76`. This artefact specifies the C2 single-use design and its proof obligation only; it does not invoke gates, open a PR, commit the change, close C2, or flip anything.*
