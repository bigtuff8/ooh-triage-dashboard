# D-2 — P1 deep-link ingress exemption spec (SD-586, F09)

**For:** Spencer / platform (owner of the **SD-330 IoT Support Dashboard** ingress)
**From:** OOH Dashboard go-live (SD-586)
**Status:** specification handed over. **No code change to either app is required for the canary.** An optional small OOH change (append a signed token to the P1 SMS link) is gated to go/no-go #4, not this release.
**Date:** 2026-07-27

---

## 1. Problem

The OOH Dashboard's P1 escalation SMS contains a deep-link to the ticket on the **IoT Support Dashboard** (the SD-330 consumer):

```
${IOT_DASH_BASE_URL}/?ticket={id}   →   https://zendesk-uat.airedale-api.co.uk/?ticket={id}
```

That dashboard's ingress sits behind an auth guard. An on-call handler tapping the link on a phone at 2am must reach the ticket **without** first hitting a basic-auth / SSO wall (or with only the lightest intended challenge).

## 2. What is being asked for

A **token-guarded path exemption** on the **SD-330 ingress** (consumer side). This is the one deliberate cross-product change agreed at the discovery gate (James decision D-2 = exempt).

## 3. Critical scoping constraint (IM-04) — do NOT get this wrong

An nginx-ingress auth exemption matches on **path**. Here the path is just `/` and `ticket` is a **query argument**. A naive "exempt any request that carries `?ticket=`" is a **whole-site auth bypass** — an attacker could append `?ticket=x` to *any* path and skip the ingress auth for the entire app.

**The exemption MUST be scoped to:**

> **exact path `/`  AND  presence of a valid signed `k` token**

(e.g. via an nginx `map` / `if ($arg_ticket)` combined with a token check). It must **never** be "query param present" alone.

## 4. Required token form

- The OOH app appends a short, rotating **signed token** when it builds the SMS link:
  ```
  /?ticket={id}&k={hmac}
  ```
  where `k` is an **HMAC over `ticket` + an expiry**, using a shared secret held on the SD-330 side.
- The token **expires** (suggested 24h) so a leaked SMS link does not grant indefinite access.
- The ingress/edge validates `k` before allowing the exemption.
- The **presence-of-query-param** form (allow-list on `?ticket=` alone) is **explicitly ruled out**.

## 5. Defence in depth (not a substitute for §3–4)

Downstream authorisation is unchanged: the SD-330 app still authorises the **viewer** for that ticket. The exemption only removes the *ingress-level* wall, not app-level authz. This app-level authz is the backstop — **not** a licence to loosen the ingress scope.

## 6. Ownership & sequencing

| Item | Owner | When |
|---|---|---|
| SD-330 ingress exemption (exact-path `/` + signed-token check) | Spencer / platform | before go/no-go #4 |
| Shared HMAC signing secret provisioned on the SD-330 side | Spencer / platform | before go/no-go #4 |
| OOH app appends `&k={hmac}` when composing the P1 SMS | OOH (small, optional change) | gated to go/no-go #4 — **not** this canary |
| Real-phone verification | James + on-call | go/no-go #4 |

## 7. Config / data-dictionary touch

- If the signed-token option is chosen, add **`IOT_DASH_LINK_SIGNING_SECRET`** to the OOH secret surface (`ooh-dashboard-secrets`). **Not** required for this canary — flagged for the go/no-go #4 change only.
- No new Zendesk fields. Uses the existing `IOT_DASH_BASE_URL` and the Zendesk ticket id.

## 8. Verification (go/no-go #4)

On a **real phone**:
1. Tap a P1 SMS link with a valid, unexpired token → lands on the correct ticket without an auth wall (or only the intended light challenge).
2. An **expired or absent** token → blocked at the ingress.
3. `?ticket=` appended to a **non-`/` path** → still blocked (proves the scope is exact-path, not param-presence).
