/**
 * Test 10 (OOHDASH-72, tester feedback) — category tiles must carry the handler's typed words.
 *
 * Root cause fixed: the category tile rendered onclick="startFlow('${c.k}')" with NO free-text
 * argument, so state.smartEntryText never reached the flow and callerWords went null. The fix
 * routes the tile through startTileFlow(k) — symmetric with the "Sounds like" chip's
 * startSuggestedFlow(k) — so BOTH entry paths carry the typed text, and the text is NEVER
 * interpolated into the onclick attribute (quote-safety).
 *
 * Plus D-10a: the outcome confirmation card echoes the typed words (Recorded from the caller: "…"),
 * so note retention is verifiable at the handler's own screen.
 *
 * The client scripts are browser globals (no ESM), evaluated in a `vm` sandbox with stub globals —
 * the same seam hotwater-scope.test.js uses. No network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

// ---- client-script sandbox: evaluate public/js/flows.js + views.js with stub globals ----
function loadClient(workspace, { realFinishOutcome = false } = {}) {
    const captured = [];             // outcome payloads posted via finishOutcome
    const started = [];              // startFlow(k, freeText) calls
    const posts = [];                // api.post payloads (real-finishOutcome mode)
    const state = { flow: null, workspace, smartEntryText: '', me: { operator: { name: 'Handler One' } }, call: null };
    const sandbox = {
        state,
        $: () => ({ innerHTML: '', focus() {} }),
        esc: s => String(s),
        openControl: () => {},
        flowStep: () => {},
        render: () => {},
        toast: () => {},
        registerIssue: () => {},
        outButtons: () => '',
        // api.post is the real finishOutcome's sink; capture the payload and resolve a ticket so the
        // real echo-rendering .then() runs (used to assert the D-10a card echo end-to-end).
        api: { post: async (url, payload) => { posts.push(payload); captured.push(payload); return { ticket: { id: 900 + posts.length }, p1: null }; } },
        Promise, Date,
        window: {},
        console
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    const flowsSrc = readFileSync(new URL('../public/js/flows.js', import.meta.url), 'utf8')
        + '\n;globalThis.FLOWR = FLOWR;globalThis.CATS = CATS;';
    vm.runInContext(flowsSrc, ctx, { filename: 'flows.js' });
    // Capture the real startFlow AFTER load so we can observe the carried freeText, then delegate to
    // the real implementation so f.data.freeText is set exactly as production does.
    const realStartFlow = ctx.startFlow;
    sandbox.startFlow = (k, freeText) => { started.push({ k, freeText }); realStartFlow(k, freeText); };
    if (!realFinishOutcome) {
        // Default: override the async API sink to capture the payload and render the card synchronously.
        sandbox.finishOutcome = (f, key, payload, render) => {
            captured.push(payload);
            return render({ ticket: { id: 900 + captured.length }, p1: null });
        };
    }
    vm.runInContext(readFileSync(new URL('../public/js/views.js', import.meta.url), 'utf8'), ctx, { filename: 'views.js' });
    return { ctx, state, captured, started, posts };
}

// Drives the fridge non-risk (scope) outcome through the REAL finishOutcome and waits for the async
// echo-rendering .then() to settle, returning the rendered outcome HTML (f.data._outcomeHtml).
async function driveRealScopeOutcome(ctx, state, ws) {
    state.flow.stage = 1;
    state.flow.data.risk = 0;
    ctx.FLOWR.fridge(ws, state.flow);
    // let the api.post().then() microtask resolve and render
    for (let i = 0; i < 10 && !state.flow.data._outcomeHtml; i++) await Promise.resolve();
    return state.flow.data._outcomeHtml || '';
}

const WS = { site: { siteNo: '6832', siteName: 'The Red Lion' }, devices: [], scope: [] };

test('routing: startTileFlow carries state.smartEntryText into the flow (parity with the suggestion chip)', () => {
    const { ctx, state, started } = loadClient(WS);
    state.smartEntryText = 'the pub is freezing cold';
    ctx.startTileFlow('heating');
    assert.equal(started.length, 1, 'the tile route calls startFlow once');
    assert.equal(started[0].freeText, 'the pub is freezing cold', 'the typed text is carried through the tile route');
    assert.equal(state.flow.data.freeText, 'the pub is freezing cold', 'flow data holds the typed words (→ callerWords on the wire)');
});

test('routing: the tile HTML routes through startTileFlow and NEVER interpolates the typed text into onclick (quote-safety)', () => {
    const { ctx } = loadClient(WS);
    // renderWorkspace builds the tile grid; assert the onclick calls startTileFlow, carries only the
    // category key, and never the (quote-bearing) smartEntryText.
    const tileHtml = ctx.CATS.map(c => `startTileFlow('${c.k}')`);
    // The rendered tiles must use startTileFlow, not the bare startFlow that dropped the words.
    const viewsSrc = readFileSync(new URL('../public/js/views.js', import.meta.url), 'utf8');
    assert.match(viewsSrc, /data-testid="tile-\$\{c\.k\}" onclick="startTileFlow\('\$\{c\.k\}'\)"/,
        'the category tile onclick must call startTileFlow(key) — never startFlow with no words');
    assert.doesNotMatch(viewsSrc, /onclick="startFlow\('\$\{c\.k\}'\)"/, 'the words-dropping bare startFlow tile onclick is gone');
    // And smartEntryText is never interpolated into the tile attribute.
    assert.ok(!/onclick="[^"]*smartEntryText/.test(viewsSrc), 'typed text is never placed into an onclick attribute');
    assert.ok(tileHtml.length > 0);
});

test('callerWords: an outcome from a tile-started flow with typed text populates callerWords (real finishOutcome → api.post body)', async () => {
    const { ctx, state, posts } = loadClient(WS, { realFinishOutcome: true });
    state.smartEntryText = "won't heat up — it's freezing";  // deliberate quote + apostrophe
    ctx.startTileFlow('fridge');
    await driveRealScopeOutcome(ctx, state, WS);
    assert.equal(posts.length, 1, 'exactly one outcome posted');
    assert.equal(posts[0].callerWords, "won't heat up — it's freezing",
        'the carried typed words (incl. quotes/apostrophes) reach callerWords on the /api/outcomes body');
});

test('D-10a card echo: the outcome card echoes the typed words when present, esc-quoted (real finishOutcome)', async () => {
    const { ctx, state } = loadClient(WS, { realFinishOutcome: true });
    state.smartEntryText = 'stock is warming in the freezer';
    ctx.startTileFlow('fridge');
    const html = await driveRealScopeOutcome(ctx, state, WS);
    assert.match(html, /data-testid="outcome-callerwords"/, 'the card carries the caller-words echo element');
    assert.match(html, /Recorded from the caller: “stock is warming in the freezer”/,
        'the card echoes the exact typed words');
});

test('D-10a card echo: NO empty-quote artefact when the handler used a tile without typing anything (real finishOutcome)', async () => {
    const { ctx, state } = loadClient(WS, { realFinishOutcome: true });
    state.smartEntryText = '';
    ctx.startTileFlow('fridge');
    const html = await driveRealScopeOutcome(ctx, state, WS);
    assert.doesNotMatch(html, /data-testid="outcome-callerwords"/, 'no caller-words echo element when nothing was typed');
    assert.doesNotMatch(html, /Recorded from the caller/, 'never shows an empty-quote artefact');
});

test('parity: startTileFlow and startSuggestedFlow both carry the same state text (both entry paths fixed)', () => {
    const { ctx, state, started } = loadClient(WS);
    state.smartEntryText = 'no hot water in the kitchen';
    ctx.startSuggestedFlow('hotwater');
    ctx.startTileFlow('hotwater');
    assert.equal(started[0].freeText, 'no hot water in the kitchen');
    assert.equal(started[1].freeText, 'no hot water in the kitchen');
    assert.equal(started[0].freeText, started[1].freeText, 'both entry paths carry identical caller words');
});
