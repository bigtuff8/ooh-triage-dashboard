# OOHDASH-116 F3 — Reword connection-check prompt as optional

**Ticket:** OOHDASH-116 F3  
**Complexity:** S  
**Scope:** `public/js/views.js` — one line changed  
**Status:** Design — ready for build

---

## Summary

The offline banner shown when site equipment is not responding contains a "Run connection check" button. Kelly (IoT support) interpreted the button as a required step before continuing triage. It is not required: Sam Day confirmed agents should feel free to go straight to the issue type. The fix is a single line of plain-English text added below the button, making the optional nature explicit. The button label, its behaviour, and the auto-divert logic in `FLOWR.connectivity` are all unchanged.

---

## Exact change

**File:** `public/js/views.js`  
**Line:** 170

### Before

```html
<div class="alert err" data-testid="offline-banner" style="display:flex;align-items:center;gap:10px;margin:0 0 10px">
  📡 <b>Some Lighthouse equipment at this site is not responding.</b>
  <button class="btn" style="margin-left:auto" onclick="startFlow('connectivity')">Run connection check</button>
</div>
```

(This is a single-line template literal in the source; split here for readability.)

### After

Replace the `offline-banner` div with a block layout that stacks the message row and the optional-text line:

```html
<div class="alert err" data-testid="offline-banner" style="display:flex;flex-direction:column;gap:6px;margin:0 0 10px">
  <div style="display:flex;align-items:center;gap:10px">
    📡 <b>Some Lighthouse equipment at this site is not responding.</b>
    <button class="btn" style="margin-left:auto" onclick="startFlow('connectivity')">Run connection check</button>
  </div>
  <p class="small" data-testid="offline-banner-optional-hint" style="margin:0">This step is optional — you can go straight to the issue.</p>
</div>
```

The outer div switches from `flex-direction: row` to `flex-direction: column`. The existing message row (icon + bold text + button) moves into an inner row div, preserving its current visual exactly. The new `<p>` sits below that row, left-aligned, in the existing `small` type style (muted, smaller than body).

---

## Wording

> This step is optional — you can go straight to the issue.

Plain English. No jargon. Matches Sam Day's verbal steer. No period ambiguity — the em dash reads as a natural spoken pause.

---

## Design rationale

**Token / cost efficiency:** Zero LLM involvement. This is a static HTML string change — no API calls, no background work, no recurring cost.

**Silent running:** Not applicable. There is no background or polling component in this change.

---

## Test spec

**File:** `tests/tonight-callback.spec.js`  
**Test case:** `'connection-check banner appears automatically for a hub-down site (Merlin House) and flow captures'` (line 125)

### Current assertions (lines 131-134)

```js
const banner = page.locator('[data-testid="offline-banner"]');
await expect(banner).toContainText('not responding');
await banner.locator('button:has-text("Run connection check")').click();
await expect(page.locator('[data-testid="connectivity-alert"]')).toContainText('gateway at this site is offline');
```

### Updated assertions — add one line after line 132

```js
const banner = page.locator('[data-testid="offline-banner"]');
await expect(banner).toContainText('not responding');
await expect(page.locator('[data-testid="offline-banner-optional-hint"]')).toBeVisible();
await banner.locator('button:has-text("Run connection check")').click();
await expect(page.locator('[data-testid="connectivity-alert"]')).toContainText('gateway at this site is offline');
```

The new assertion (`toBeVisible()` on `offline-banner-optional-hint`) is inserted between the existing banner-text check and the button click, so the test reads: banner is shown, hint is visible, button still works, flow still fires. No existing assertions are removed or altered.

---

## Edge cases

**Automatic-divert path vs operator-choice path.** The offline banner is rendered in `renderWorkspace()` at line 170 before `state.flow` is set. Once the agent clicks "Run connection check", `startFlow('connectivity')` fires and `renderWorkspace()` re-renders with `state.flow` truthy — the `flowHtml` block is then replaced by `renderFlow()`, so the banner (and the optional-text hint) naturally disappear at that point. The text is therefore:

- **Visible:** when the workspace first loads and `ws.anyOffline` is true, before any flow is started.
- **Not visible:** once any flow (connectivity or otherwise) has started — the banner is not rendered when `state.flow` is set.

This is the correct behaviour: the hint only needs to exist at the moment the agent sees the button and must decide whether to click it.

**Degraded-banner co-existence.** The `ws.degraded` banner (line 171) is rendered independently and is unaffected. Both banners can appear simultaneously; their vertical stacking is already handled by the surrounding flex column layout.

**No auto-divert logic change.** `FLOWR.connectivity` in `flows.js` (lines 671-780) is not touched. The hint does not gate or alter that flow.

---

## Open questions

None. Sam Day's direction is unambiguous: keep the button, add a line of text making it optional. Wording, placement, and test coverage are all resolved here.
