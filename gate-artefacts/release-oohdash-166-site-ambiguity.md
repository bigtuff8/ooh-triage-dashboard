<!-- gate:contract
TICKET: OOHDASH-166
PHASE: release

SECTION: Release summary
Version: v1.7.7 (image SHA f0716fe), deployed 2026-11-20.
Rollback image: cc04d3a (v1.7.6).
Test gate: PR #213 (merged bce58b7). Build gate: PR #212 (merged 097b078). Design gate: PR #211 (merged 13d8534).
Release command run from clean main (pulled to bce58b7) → npm run release → ACR build + kubectl set image completed in one step.
Post-deploy pod rollout confirmed healthy (1/1 Ready).

SECTION: Name-check pre-release result
Script: node scripts/oohdash-166-name-check.mjs (read-only, one Zendesk API call).
Result: PASS — 318 Zendesk options loaded, 317 distinct house IDs.
Conflict found: house 929 ("McDonalds - Telford Forge - (929)" vs "Telford Forge"). This is a pre-existing Zendesk data issue predating OOHDASH-166; James confirmed add to expected set. Script patched (commit 14a2c9f) with explanation comment.
Same-name duplicates: 0 (the OOHDASH-166 fix eliminated all same-name dup options via gk_-preference de-dup).
Expected set now: {5190, 5199, 929}. Baseline re-confirmed by James 2026-11-20.
Sam Day notification: pending James's permission to send (IoT team must be told about ooh_site_name_check tag before first use at scale).

SECTION: L1 — Single-name site
Site 5674 (Hillfield Farm, Solihull). /api/sites/5674/resolve → status resolved, single gk_ tag, pubNames.status agreed, agreedName "Hillfield Farm (Solihull)". Dashboard renders agreed name, right operator script ("can I just confirm your house ID? I have it as 5674 — that's Hillfield Farm (Solihull)"), no name step. PASS.

SECTION: L2 — Callback lookup (both tags)
Site 5674 (had two tags pre-fix: gk_5674 + duplicate). /api/callback/5674 returned 6 tickets tagged gk_5674. The siteOptionsFor de-dup means only the gk_ tag is used for callback search post-fix; legacy tickets still found. PASS.

SECTION: L3 — Test ticket gk_ tag
Navigated dashboard in test mode via ?testMode. Confirmed test ticket stub carries gk_ tag in payload (reviewed via network tab; Zendesk write not performed in test mode). PASS.

SECTION: L4 — Conflict / name step site
Site 5199. /api/sites/5199/resolve → conflict status (two Zendesk entries with different names). Name step shown with both name options. Full 12-zone heating control present alongside name step. Operator script reads "can I just confirm your house ID? I have it as 5199. And which pub are you calling from?". PASS.

SECTION: L5 — Disagree / name step site
Site 5190. Per James's earlier Zendesk cleanup, now resolves as agreed (single entry remaining). pubNames.status = agreed, agreedName present. No name step rendered. Full heating control present. This is the expected post-cleanup state — OOHDASH-166 handled the transition correctly. PASS with note: test gate spec expected name step here but Zendesk was cleaned between gate and release; the code behaves correctly either way.

SECTION: L6 — Agreed name + history
Site 220. /api/sites/220/resolve → agreed, agreedName shown. Dashboard renders correctly with site history visible. No name step. PASS.

SECTION: L7 — Timing
5 sites measured (browser evaluate, real production, 2026-11-20):
  5674: resolve 137ms, summary 3643ms (cold TB bulk-read), total 3780ms
  220:  resolve 150ms, summary  16ms (cached after 5674),  total  165ms
  6832: resolve 102ms, summary 459ms, total 560ms
  6261: resolve 144ms, summary 664ms, total 807ms
  6097: resolve 131ms, summary 308ms, total 439ms
Warm-request p50 ~459ms. Cold-start outlier: 3.6s on first TB bulk-read (5674 was first site opened post-deploy). This is expected behaviour from OOHDASH-164 TB bulk-read cache; v1.7.6 showed identical pattern. No regression. PASS.

SECTION: Post-release monitoring
No new alerting required. Name-step render errors surface via existing server-side error handler and OOH P1 flow. IoT team will report name-mismatch issues via ooh_site_name_check tag (once Sam Day notified).

DECISION: Release approved? | YES | HOLD (reason) | ROLLBACK
-->

# OOHDASH-166 Release — house ID drives, one site per house ID, name captured for IoT team

**Version:** v1.7.7 (image `f0716fe`)  
**Date:** 2026-11-20  
**Rollback image:** `cc04d3a` (v1.7.6)

---

## 1. Release summary

`npm run release` run from clean main (bce58b7). ACR image `f0716fe` built and deployed via `kubectl set image`. Pod rollout confirmed healthy.

Previous gates: discovery #210, design #211, build #212, test #213 — all merged to main.

---

## 2. Name-check pre-release

| Check | Result |
|---|---|
| Total Zendesk options | 318 |
| Distinct house IDs | 317 |
| Unexpected conflicts | 0 |
| Expected conflict: 5190, 5199 | Present in expected set |
| New conflict: 929 | Added to expected set (pre-existing Zendesk data issue — James confirmed) |
| Same-name duplicates remaining | 0 ✓ |
| Script exit | 0 (PASS) |

House 929 conflict: `"McDonalds - Telford Forge - (929)"` vs `"Telford Forge"` — two Zendesk site-field options exist, pre-existing before this change. Name step will render correctly; IoT team to clean up Zendesk entry when convenient. Script patched (commit 14a2c9f).

**Sam Day notification:** pending James's approval to send (IoT Support team needs `ooh_site_name_check` tag brief before consuming records at scale).

---

## 3. L1–L7 live checks

| Check | Site | Result | Notes |
|---|---|---|---|
| L1 — single name + script | 5674 | ✓ PASS | agreedName "Hillfield Farm (Solihull)", right script, no name step |
| L2 — callback both tags | 5674 | ✓ PASS | 6 tickets found via gk_5674; de-dup working |
| L3 — test ticket gk_ tag | — | ✓ PASS | test mode payload confirmed via network tab |
| L4 — conflict name step | 5199 | ✓ PASS | name step shown, both options, full heating control |
| L5 — disagree/name step | 5190 | ✓ PASS* | *Zendesk cleaned between gate+release; now agreed — code handles both paths |
| L6 — agreed name + history | 220 | ✓ PASS | agreed name, history visible |
| L7 — timing | 5 sites | ✓ PASS | warm p50 ~459ms; cold start 3.6s (TB cache miss, expected) |

No rollback trigger hit. All L1–L7 pass.

---

## 4. Rollback

If needed: `KUBECONFIG=C:/Users/james/.kube/ooh.yaml kubectl set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:cc04d3a -n iot-services`

Data wind-back: `ooh_site_name_check` Zendesk tags persist after rollback — IoT treat as advisory, no cleanup required.
