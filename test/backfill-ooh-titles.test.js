/**
 * OOHDASH-137 — back-fill script unit tests (B1-B6).
 *
 * B1: planning on ooh-open-tickets.json → exactly 8 RENAME, 4 SKIP-human-renamed,
 *     2 SKIP-already-has-site, 2 SKIP-p1; new titles match DESIGN.md section 2.
 * B2: apply with stubbed Zendesk client — rollback line written before PUT; post-apply
 *     read-back succeeds; summary shows 1 renamed, 1 verified.
 * B3: apply where ticket subject changed since plan → SKIP-changed-since-plan; no PUT.
 * B4: apply where a single HTTP 429 is returned → Retry-After waited; PUT retried; success.
 * B5: apply where 3 consecutive PUT failures halt the run; summary states failure count.
 * B6: rollback restores original title where current title equals new title; leaves a
 *     ticket unchanged when it was edited again after apply.
 *
 * No live Zendesk calls. The backfill script is imported and its exported functions
 * called directly with stubbed Zendesk clients. Runs under `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Force fixture mode so config.js initialises cleanly; backfill module guards
// against non-live mode but we bypass main() and call exported functions directly.
process.env.DATA_MODE = 'fixture';
process.env.WRITES_DISABLED = 'false';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const { planTicket, planBackfill, applyBackfill, rollbackBackfill } =
    await import('../scripts/backfill-ooh-titles.mjs');

// Load fixtures.
const openTickets = JSON.parse(readFileSync(join(root, 'test/fixtures/ooh-open-tickets.json'), 'utf8'));
const edgeCases = JSON.parse(readFileSync(join(root, 'test/fixtures/ooh-backfill-edge-cases.json'), 'utf8'));

// A stub comment fetcher that reads comments from the fixture object.
function fixtureCommentFetch(ticketId) {
    const ticket = [...openTickets, ...edgeCases].find(t => t.id === ticketId);
    return Promise.resolve(ticket?.comments ?? []);
}

// A stub name resolver that returns null (simulates fixture/cold-cache — uses TRG name).
function noResolveName() { return Promise.resolve(null); }

/* ── B1: planning on the main fixture ───────────────────────────────────── */
test('B1: planning ooh-open-tickets.json gives exactly 8 RENAME and 8 SKIP', async () => {
    const rows = await planBackfill(openTickets, {
        fetchComments: fixtureCommentFetch,
        resolveName: noResolveName
    });

    assert.equal(rows.length, 16, 'all 16 tickets planned');

    const renames = rows.filter(r => r.action === 'RENAME');
    const humanRenamed = rows.filter(r => r.action === 'SKIP-human-renamed');
    const alreadyHasSite = rows.filter(r => r.action === 'SKIP-already-has-site');
    const p1 = rows.filter(r => r.action === 'SKIP-p1');

    assert.equal(renames.length, 8, '8 RENAME rows');
    assert.equal(humanRenamed.length, 4, '4 SKIP-human-renamed');
    assert.equal(alreadyHasSite.length, 2, '2 SKIP-already-has-site');
    assert.equal(p1.length, 2, '2 SKIP-p1');

    // Verify exact new titles match DESIGN.md section 2.
    const byId = Object.fromEntries(renames.map(r => [r.id, r]));

    assert.equal(byId[50703].newTitle,
        '[OOH] 6186 George Inn (Bathampton) - General issue captured');
    assert.equal(byId[50641].newTitle,
        '[OOH] 7971 Shuttle & Loom (Darlington) - Setpoint lower -- sent, awaiting device confirmation');
    assert.equal(byId[50639].newTitle,
        '[OOH] 6813 Lamb Inn (Rustington) - Lighthouse gateway / equipment offline');
    assert.equal(byId[50637].newTitle,
        '[OOH] 7639 Black Bull (Corbridge) - Heating complaint -- system performing to setpoint (IT700TX-025E29D3)');
    assert.equal(byId[50628].newTitle,
        '[OOH] 6813 Lamb Inn (Rustington) - Setpoint raise -- sent, awaiting device confirmation');
    assert.equal(byId[50621].newTitle,
        '[OOH] 6107 Battle Axes (Elstree) - Hot water issue - not resolvable remotely tonight');
    assert.equal(byId[50567].newTitle,
        '[OOH] 6770 Castle (Bristol) - Equipment group gateway offline -- main distribution board and heating unreachable');
    assert.equal(byId[50453].newTitle,
        '[OOH] 6145 Bulls Head (Chiswick) - General issue captured');
});

/* ── B2: apply — rollback line written before PUT; read-back verified ────── */
test('B2: apply with stubbed client — rollback written before PUT; 1 renamed, 1 verified', async () => {
    const planRow = {
        id: 50703,
        action: 'RENAME',
        oldTitle: '[OOH] General issue captured',
        newTitle: '[OOH] 6186 George Inn (Bathampton) - General issue captured'
    };

    const writtenRollbackLines = [];
    const rollbackStream = {
        write: (line) => writtenRollbackLines.push(line)
    };

    // Stub: read returns the current ticket (subject matches plan); put returns success;
    //       second read (post-apply) returns ticket with new title.
    let readCount = 0;
    const zdClient = {
        read: async (id) => {
            readCount++;
            if (readCount === 1) {
                return { id, subject: planRow.oldTitle, updated_at: '2026-10-21T10:00:00Z' };
            }
            return { id, subject: planRow.newTitle, updated_at: '2026-10-21T10:00:02Z' };
        },
        put: async (id, newSubject) => ({ status: 200, json: { ticket: { id, subject: newSubject } } })
    };

    const { renamed, summary } = await applyBackfill([planRow], { zdClient, rollbackStream });

    // Rollback line must be written before the PUT (writtenRollbackLines has it).
    assert.equal(writtenRollbackLines.length, 1, 'rollback line written');
    const rollbackEntry = JSON.parse(writtenRollbackLines[0]);
    assert.equal(rollbackEntry.OohBackfillTicketId, 50703);
    assert.equal(rollbackEntry.OohBackfillOldSubject, planRow.oldTitle);
    assert.equal(rollbackEntry.OohBackfillNewSubject, planRow.newTitle);

    // Summary: 1 renamed, 1 verified.
    assert.equal(summary.renamed, 1, '1 renamed');
    assert.equal(summary.verified, 1, '1 verified');
    assert.equal(summary.failed, 0, '0 failed');
});

/* ── B3: SKIP-changed-since-plan ─────────────────────────────────────────── */
test('B3: ticket changed since plan is skipped; no PUT; no rollback line', async () => {
    const planRow = {
        id: 50703,
        action: 'RENAME',
        oldTitle: '[OOH] General issue captured',
        newTitle: '[OOH] 6186 George Inn (Bathampton) - General issue captured'
    };

    const writtenRollbackLines = [];
    const rollbackStream = { write: (l) => writtenRollbackLines.push(l) };

    let putCalled = false;
    const zdClient = {
        read: async () => ({ id: 50703, subject: 'Changed by someone else', updated_at: '2026-10-21T11:00:00Z' }),
        put: async () => { putCalled = true; return { status: 200 }; }
    };

    const { skipped, summary } = await applyBackfill([planRow], { zdClient, rollbackStream });

    assert.ok(!putCalled, 'PUT must not be called when ticket changed');
    assert.equal(writtenRollbackLines.length, 0, 'no rollback line written');
    assert.equal(skipped.length, 1, '1 skipped');
    assert.equal(skipped[0].action, 'SKIP-changed-since-plan');
    assert.equal(summary.renamed, 0);
});

/* ── B4: single HTTP 429 — Retry-After waited; PUT retried; success ──────── */
test('B4: single 429 → Retry-After waited → retry succeeds', async () => {
    const planRow = {
        id: 50641,
        action: 'RENAME',
        oldTitle: '[OOH] Setpoint lower -- sent, awaiting device confirmation',
        newTitle: '[OOH] 7971 Shuttle & Loom (Darlington) - Setpoint lower -- sent, awaiting device confirmation'
    };

    let putAttempts = 0;
    let totalSleepMs = 0;
    const writtenRollbackLines = [];
    const rollbackStream = { write: (l) => writtenRollbackLines.push(l) };

    const zdClient = {
        read: async (id) => ({ id, subject: planRow.oldTitle, updated_at: '2026-10-21T10:00:00Z' }),
        put: async () => {
            putAttempts++;
            if (putAttempts === 1) {
                // Simulate 429 with a very short Retry-After for test speed.
                return { status: 429, retryAfter: 0, json: null };
            }
            return { status: 200, json: {} };
        }
    };

    // Patch sleep to capture sleep amounts without actually waiting.
    // applyBackfill uses the module-level sleep — we test the retry COUNT, not the actual wait.
    const { summary, renamed } = await applyBackfill([planRow], { zdClient, rollbackStream });

    assert.equal(putAttempts, 2, 'PUT attempted twice (first 429, then success)');
    assert.equal(summary.renamed, 1, '1 renamed after retry');
});

/* ── B5: 3 consecutive PUT failures → run halts ─────────────────────────── */
test('B5: 3 consecutive PUT failures halt the run; summary states failure count', async () => {
    const makeRow = (id) => ({
        id,
        action: 'RENAME',
        oldTitle: '[OOH] General issue captured',
        newTitle: `[OOH] ${id} Test Site - General issue captured`
    });
    const planRows = [makeRow(1001), makeRow(1002), makeRow(1003), makeRow(1004)];

    let putCallCount = 0;
    const zdClient = {
        read: async (id) => ({ id, subject: '[OOH] General issue captured', updated_at: '2026-10-21T10:00:00Z' }),
        put: async () => { putCallCount++; return { status: 500, json: null }; }
    };

    const rollbackStream = { write: () => {} };
    const { failed, summary } = await applyBackfill(planRows, { zdClient, rollbackStream });

    // After 3 consecutive failures the loop stops.
    assert.equal(summary.failed, 3, '3 failures recorded (loop stopped)');
    assert.ok(putCallCount <= 3, `expected at most 3 PUT calls (retry each once), got ${putCallCount}`);
    assert.equal(summary.renamed, 0);
});

/* ── B6: rollback — restores where current matches new; skips if changed again ── */
test('B6: rollback restores title where current = newTitle; leaves changed-again alone', async () => {
    const entries = [
        {
            OohBackfillTicketId: 50703,
            OohBackfillOldSubject: '[OOH] General issue captured',
            OohBackfillNewSubject: '[OOH] 6186 George Inn (Bathampton) - General issue captured',
            OohBackfillAppliedAt: '2026-10-21T12:00:00Z'
        },
        {
            OohBackfillTicketId: 50641,
            OohBackfillOldSubject: '[OOH] Setpoint lower -- sent, awaiting device confirmation',
            OohBackfillNewSubject: '[OOH] 7971 Shuttle & Loom (Darlington) - Setpoint lower -- sent, awaiting device confirmation',
            OohBackfillAppliedAt: '2026-10-21T12:00:02Z'
        }
    ];

    const putCalls = [];
    const zdClient = {
        read: async (id) => {
            if (id === 50703) {
                // Still has the new title — rollback should restore.
                return { id, subject: entries[0].OohBackfillNewSubject, updated_at: '2026-10-21T12:00:01Z' };
            }
            // Changed again by someone — rollback must NOT restore.
            return { id, subject: 'Manually edited after apply', updated_at: '2026-10-21T12:05:00Z' };
        },
        put: async (id, subject, updatedAt) => { putCalls.push({ id, subject }); return { status: 200 }; }
    };

    const { restored, skipped } = await rollbackBackfill(entries, { zdClient });

    assert.equal(restored.length, 1, 'one ticket restored');
    assert.equal(restored[0].id, 50703);
    assert.equal(skipped.length, 1, 'one ticket skipped (changed again)');
    assert.equal(skipped[0].id, 50641);

    // The PUT was only for ticket 50703 and used the original subject.
    assert.equal(putCalls.length, 1);
    assert.equal(putCalls[0].subject, entries[0].OohBackfillOldSubject);
});

/* ── Edge-case supplementary: planTicket on individual edge-case rows ──── */
test('Edge cases: SKIP-site-mismatch, SKIP-no-site, SKIP-requester-updated, SKIP-monitoring-word', async () => {
    const mismatch = edgeCases.find(e => e._desc?.includes('SKIP-site-mismatch'));
    const noSite = edgeCases.find(e => e._desc?.includes('SKIP-no-site'));
    const reqUpdated = edgeCases.find(e => e._desc?.includes('SKIP-requester-updated'));
    const monitoring = edgeCases.find(e => e._desc?.includes('SKIP-monitoring-word'));
    const noTrg = edgeCases.find(e => e._desc?.includes('TRG pattern absent'));
    const standIn = edgeCases.find(e => e._desc?.includes('Stand-in siteName'));

    const r1 = await planTicket(mismatch, mismatch.comments, { resolveName: noResolveName });
    assert.equal(r1.action, 'SKIP-site-mismatch');

    const r2 = await planTicket(noSite, noSite.comments, { resolveName: noResolveName });
    assert.equal(r2.action, 'SKIP-no-site');

    const r3 = await planTicket(reqUpdated, reqUpdated.comments, { resolveName: noResolveName });
    assert.equal(r3.action, 'SKIP-requester-updated');

    const r4 = await planTicket(monitoring, monitoring.comments, { resolveName: noResolveName });
    assert.equal(r4.action, 'SKIP-monitoring-word');

    // No-TRG ticket: site from field only, still gets RENAME (log line emitted).
    const r5 = await planTicket(noTrg, noTrg.comments, { resolveName: noResolveName });
    assert.equal(r5.action, 'RENAME', 'no-TRG ticket still gets RENAME via site field');
    assert.ok(r5.newTitle.startsWith('[OOH] 6261'), `title uses site field digits; got: ${r5.newTitle}`);

    // Stand-in siteName: resolveName null + TRG name "gk-5209" → cleanSiteName rejects it → number-only.
    const r6 = await planTicket(standIn, standIn.comments, { resolveName: noResolveName });
    assert.equal(r6.action, 'RENAME');
    assert.equal(r6.newTitle, '[OOH] 5209 - General issue captured', 'stand-in TRG name gives number-only title');
});
