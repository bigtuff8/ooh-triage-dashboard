/**
 * OOHDASH-137 — one-off back-fill script: rename open OOH Zendesk tickets that still
 * carry generic "[OOH] outcome" subjects to include the site number and pub name.
 *
 * USAGE
 *   node scripts/backfill-ooh-titles.mjs                       # dry run (default)
 *   node scripts/backfill-ooh-titles.mjs --apply --plan <file> # apply a plan
 *   node scripts/backfill-ooh-titles.mjs --rollback <file>     # restore originals
 *
 * REQUIREMENTS
 *   DATA_MODE=live must be set.  The script refuses to run in any other mode.
 *   Zendesk credentials sourced from the same environment variables that the app uses
 *   (ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN via config.js).
 *
 * SAFETY
 *   - Dry run makes no writes to Zendesk.
 *   - Apply re-reads each ticket before writing; skips any ticket whose subject
 *     changed since the plan was made (SKIP-changed-since-plan).
 *   - Uses safe_update so Zendesk rejects concurrent edits.
 *   - One write every 2 seconds; respects Retry-After on HTTP 429; stops after
 *     3 consecutive failures.
 *   - Rollback file is written before each PUT; copied to C:\harness-runs\iot-ooh-dash
 *     when the script finishes.
 *   - Never adds a comment to tickets (a comment would email the assignee).
 *   - P1 tickets (tagged ooh_p1) are excluded from planning and apply (D2).
 *
 * SKIP RULES (first match wins)
 *   SKIP-human-renamed       subject does not start "[OOH] "
 *   SKIP-already-has-site    after "[OOH] " the subject starts with the site number
 *   SKIP-p1                  tagged ooh_p1
 *   SKIP-requester-updated   tagged updated_by_requester or updated_by_repairs_admin
 *   SKIP-no-site             no site derivable from either source
 *   SKIP-site-mismatch       site field and [TRG] comment disagree on the number
 *   SKIP-monitoring-word     current subject matches /\bMonitoring\b/i
 *   RENAME                   all other tickets
 */

import { createWriteStream, writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// --- Config and title helpers ---
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let config;
try {
    ({ config } = await import('../config.js'));
} catch (err) {
    console.error('[backfill] Failed to load config.js:', err.message);
    process.exit(1);
}

import { buildOohTitle, normaliseSiteNo, cleanSiteName } from '../services/ticket-title.js';

/* ── Zendesk HTTP ─────────────────────────────────────────────────────────── */

const SITE_FIELD_ID = 11405878329244;
const OOH_TAG = 'ooh';

function authHeader() {
    const creds = Buffer.from(
        `${config.zendesk.email}/token:${config.zendesk.apiToken}`
    ).toString('base64');
    return { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' };
}

async function zdRequest(method, path, body) {
    const url = `https://${config.zendesk.subdomain}.zendesk.com/api/v2${path}`;
    const opts = {
        method,
        headers: authHeader(),
        body: body ? JSON.stringify(body) : undefined
    };
    const res = await fetch(url, opts);
    if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After') || 60);
        return { retryAfter, status: 429, json: null };
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Zendesk ${method} ${path} returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, retryAfter: null };
}

async function searchOohOpenTickets() {
    const query = encodeURIComponent(`type:ticket tags:${OOH_TAG} status<solved`);
    const tickets = [];
    let page = 1;
    while (true) {
        const { json } = await zdRequest('GET', `/search.json?query=${query}&page=${page}&per_page=100`);
        const results = json?.results ?? [];
        tickets.push(...results);
        if (!json?.next_page) break;
        page++;
    }
    return tickets;
}

async function fetchTicketComments(id) {
    const { json } = await zdRequest('GET', `/tickets/${id}/comments.json?sort_order=asc&per_page=5`);
    return json?.comments ?? [];
}

async function readTicket(id) {
    const { json } = await zdRequest('GET', `/tickets/${id}.json`);
    return json?.ticket ?? null;
}

async function putTicketSubject(id, newSubject, updatedStamp) {
    const body = { ticket: { subject: newSubject, safe_update: true, updated_stamp: updatedStamp } };
    return zdRequest('PUT', `/tickets/${id}.json`, body);
}

/* ── Site-name lookup ─────────────────────────────────────────────────────── */

// Thin wrapper — we import resolveSiteName from zendesk.js only if in live mode.
// For the backfill script, resolveSiteName is called directly in the service.
async function lookupSiteName(digits) {
    try {
        const { resolveSiteName } = await import('../services/zendesk.js');
        return await resolveSiteName(digits);
    } catch (_) {
        return null;
    }
}

/* ── Per-ticket planning logic ────────────────────────────────────────────── */

const TRG_SITE_RE = /Site selected:\s*(.+?)\s*\((\d{3,6})\)/;

/**
 * Plans one ticket. Returns a row object:
 *   { id, action, oldTitle, newTitle? }
 * action is one of: RENAME | SKIP-human-renamed | SKIP-already-has-site |
 *   SKIP-p1 | SKIP-requester-updated | SKIP-no-site | SKIP-site-mismatch |
 *   SKIP-monitoring-word
 */
export async function planTicket(ticket, comments, { resolveName = lookupSiteName } = {}) {
    const { id, subject: oldTitle, tags = [], custom_fields = [] } = ticket;

    // 1. SKIP-human-renamed
    if (!oldTitle.startsWith('[OOH] ')) {
        return { id, action: 'SKIP-human-renamed', oldTitle };
    }

    // Derive site number from the Zendesk site field (source 1).
    const siteFieldValue = custom_fields.find(f => f.id === SITE_FIELD_ID)?.value || null;
    const siteNorm = siteFieldValue ? normaliseSiteNo(siteFieldValue) : null;
    const siteDigits = (siteNorm && typeof siteNorm === 'string') ? siteNorm : null;

    // 2. SKIP-already-has-site
    if (siteDigits && oldTitle.startsWith(`[OOH] ${siteDigits}`)) {
        return { id, action: 'SKIP-already-has-site', oldTitle };
    }

    // 3. SKIP-p1
    if (tags.includes('ooh_p1')) {
        return { id, action: 'SKIP-p1', oldTitle };
    }

    // 4. SKIP-requester-updated
    if (tags.includes('updated_by_requester') || tags.includes('updated_by_repairs_admin')) {
        return { id, action: 'SKIP-requester-updated', oldTitle };
    }

    // Derive site number from [TRG] first comment (source 2).
    const firstCommentBody = comments?.[0]?.body || '';
    const trgMatch = TRG_SITE_RE.exec(firstCommentBody);
    const trgName = trgMatch ? trgMatch[1].trim() : null;
    const trgNo = trgMatch ? trgMatch[2] : null;

    if (!trgMatch) {
        // Log that the TRG pattern was absent — not a SKIP, but informational.
        console.info(JSON.stringify({ level: 'info', step: 'trg-parse', ticketId: id, result: 'not-found' }));
    }

    // Cross-check: both sources present but disagree.
    if (siteDigits && trgNo && siteDigits !== trgNo) {
        return { id, action: 'SKIP-site-mismatch', oldTitle };
    }

    // 5. SKIP-no-site
    const digits = siteDigits || trgNo;
    if (!digits) {
        return { id, action: 'SKIP-no-site', oldTitle };
    }

    // 6. SKIP-monitoring-word
    if (/\bMonitoring\b/i.test(oldTitle)) {
        return { id, action: 'SKIP-monitoring-word', oldTitle };
    }

    // 7. Derive site name.
    let siteName = await resolveName(digits);
    if (!siteName && trgName) {
        siteName = cleanSiteName(trgName, digits);
    }
    // If still null: number-only title (no siteName argument to buildOohTitle).

    // 8. Build new title.
    const outcome = oldTitle.slice('[OOH] '.length);
    const newTitle = buildOohTitle({ siteNo: digits, siteName, outcome });

    return { id, action: 'RENAME', oldTitle, newTitle };
}

/**
 * Builds the full plan from a list of tickets and a comment fetcher.
 * Exported for tests; in production main() feeds live Zendesk data.
 */
export async function planBackfill(tickets, { fetchComments = fetchTicketComments, resolveName = lookupSiteName } = {}) {
    const rows = [];
    let i = 0;
    for (const ticket of tickets) {
        if (i++ > 0) await sleep(500); // 500ms between comment reads
        let comments = [];
        try {
            comments = await fetchComments(ticket.id);
        } catch (err) {
            console.warn(`[backfill] Comment fetch failed for ticket ${ticket.id}: ${err.message}`);
        }
        const row = await planTicket(ticket, comments, { resolveName });
        rows.push(row);
    }
    return rows;
}

/* ── Apply ────────────────────────────────────────────────────────────────── */

/**
 * Applies the RENAME rows from a plan. Exported for tests.
 */
export async function applyBackfill(planRows, { zdClient, rollbackStream, onProgress } = {}) {
    const put = zdClient?.put || null;
    const read = zdClient?.read || null;

    const renamed = [];
    const skipped = [];
    const failed = [];
    let consecutiveFails = 0;

    const renameRows = planRows.filter(r => r.action === 'RENAME');

    for (const row of renameRows) {
        if (consecutiveFails >= 3) {
            console.error('[backfill] Stopping: 3 consecutive failures.');
            break;
        }

        // Re-read ticket first; only proceed (and write rollback) when the subject
        // still matches the plan — so no rollback line is written for changed-since-plan.
        let currentTicket;
        try {
            currentTicket = read ? await read(row.id) : await readTicket(row.id);
        } catch (err) {
            console.error(`[backfill] Re-read failed for ticket ${row.id}: ${err.message}`);
            failed.push({ id: row.id, reason: 'read-error' });
            consecutiveFails++;
            continue;
        }

        if (currentTicket.subject !== row.oldTitle) {
            console.info(JSON.stringify({
                step: 'skip-changed-since-plan', id: row.id,
                was: row.oldTitle, now: currentTicket.subject
            }));
            skipped.push({ id: row.id, action: 'SKIP-changed-since-plan' });
            consecutiveFails = 0;
            continue;
        }

        console.info(JSON.stringify({ step: 'pre-apply', id: row.id, oldTitle: row.oldTitle, newTitle: row.newTitle }));

        // Write rollback line immediately before the PUT (not written for changed-since-plan).
        const rollbackEntry = {
            OohBackfillTicketId: row.id,
            OohBackfillOldSubject: row.oldTitle,
            OohBackfillNewSubject: row.newTitle,
            OohBackfillAppliedAt: new Date().toISOString()
        };
        if (rollbackStream) rollbackStream.write(JSON.stringify(rollbackEntry) + '\n');

        // PUT with retry on 429.
        let putResult;
        let attempts = 0;
        while (attempts < 2) {
            try {
                putResult = put
                    ? await put(row.id, row.newTitle, currentTicket.updated_at)
                    : await putTicketSubject(row.id, row.newTitle, currentTicket.updated_at);
            } catch (err) {
                console.error(`[backfill] PUT failed for ticket ${row.id}: ${err.message}`);
                putResult = { status: 500 };
            }
            if (putResult.status === 429 && typeof putResult.retryAfter === 'number' && attempts === 0) {
                const waitSecs = putResult.retryAfter > 0 ? putResult.retryAfter : 1;
                console.warn(`[backfill] Rate-limited. Waiting ${waitSecs}s before retry.`);
                await sleep(waitSecs * 1000);
                attempts++;
                continue;
            }
            break;
        }

        if (!putResult || putResult.status >= 400) {
            console.error(`[backfill] PUT failed for ticket ${row.id} (status ${putResult?.status})`);
            failed.push({ id: row.id, reason: `status-${putResult?.status ?? 'unknown'}` });
            consecutiveFails++;
        } else {
            consecutiveFails = 0;
            // Post-apply read-back verification.
            try {
                const verified = read ? await read(row.id) : await readTicket(row.id);
                if (verified.subject === row.newTitle) {
                    console.info(JSON.stringify({ step: 'verified', id: row.id }));
                    renamed.push({ id: row.id, verified: true });
                } else {
                    console.warn(JSON.stringify({ step: 'verify-mismatch', id: row.id, expected: row.newTitle, got: verified.subject }));
                    renamed.push({ id: row.id, verified: false });
                }
            } catch (_) {
                renamed.push({ id: row.id, verified: false });
            }
            if (onProgress) onProgress({ id: row.id, newTitle: row.newTitle });
        }

        await sleep(2000); // 2-second gap between PUTs
    }

    const summary = {
        renamed: renamed.length,
        verified: renamed.filter(r => r.verified).length,
        skipped: skipped.length,
        failed: failed.length
    };
    console.info('[backfill] Reconciliation:', summary);
    return { renamed, skipped, failed, summary };
}

/* ── Rollback ─────────────────────────────────────────────────────────────── */

/**
 * Restores original titles from a rollback file. Exported for tests.
 * Only restores a ticket where the current subject equals the applied new subject.
 */
export async function rollbackBackfill(rollbackEntries, { zdClient } = {}) {
    const put = zdClient?.put || null;
    const read = zdClient?.read || null;

    const restored = [];
    const skipped = [];

    for (const entry of rollbackEntries) {
        let current;
        try {
            current = read ? await read(entry.OohBackfillTicketId) : await readTicket(entry.OohBackfillTicketId);
        } catch (err) {
            console.error(`[rollback] Read failed for ${entry.OohBackfillTicketId}: ${err.message}`);
            skipped.push({ id: entry.OohBackfillTicketId, reason: 'read-error' });
            continue;
        }

        if (current.subject !== entry.OohBackfillNewSubject) {
            // Title was changed again since apply — do not overwrite.
            skipped.push({ id: entry.OohBackfillTicketId, reason: 'changed-again' });
            continue;
        }

        try {
            put
                ? await put(entry.OohBackfillTicketId, entry.OohBackfillOldSubject, current.updated_at)
                : await putTicketSubject(entry.OohBackfillTicketId, entry.OohBackfillOldSubject, current.updated_at);
            restored.push({ id: entry.OohBackfillTicketId });
        } catch (err) {
            console.error(`[rollback] PUT failed for ${entry.OohBackfillTicketId}: ${err.message}`);
            skipped.push({ id: entry.OohBackfillTicketId, reason: 'put-error' });
        }

        await sleep(2000);
    }

    console.info('[rollback] Summary:', { restored: restored.length, skipped: skipped.length });
    return { restored, skipped };
}

/* ── Utilities ────────────────────────────────────────────────────────────── */

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function printPlanTable(rows) {
    console.log('\nBack-fill plan:\n');
    for (const row of rows) {
        if (row.action === 'RENAME') {
            console.log(`  RENAME  #${row.id}`);
            console.log(`    OLD: ${row.oldTitle}`);
            console.log(`    NEW: ${row.newTitle}`);
        } else {
            console.log(`  ${row.action.padEnd(24)} #${row.id}  "${row.oldTitle.slice(0, 60)}"`);
        }
    }
    const renames = rows.filter(r => r.action === 'RENAME').length;
    const skips = rows.length - renames;
    console.log(`\nTotal: ${rows.length} tickets — ${renames} RENAME, ${skips} SKIP\n`);
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

async function main() {
    // Guard: must run with DATA_MODE=live. Only enforced when running directly.
    if (config.dataMode !== 'live') {
        console.error(`[backfill] Refusing to run: DATA_MODE is "${config.dataMode}" not "live". ` +
            'Source the live credentials before running this script.');
        process.exit(1);
    }

    const args = process.argv.slice(2);
    const applyMode = args.includes('--apply');
    const planFlag = args.indexOf('--plan');
    const planFile = planFlag >= 0 ? args[planFlag + 1] : null;
    const rollbackFlag = args.indexOf('--rollback');
    const rollbackFile = rollbackFlag >= 0 ? args[rollbackFlag + 1] : null;

    // --- ROLLBACK MODE ---
    if (rollbackFile) {
        console.info(`[backfill] Rollback mode. Reading: ${rollbackFile}`);
        const lines = readFileSync(rollbackFile, 'utf8').trim().split('\n').filter(Boolean);
        const entries = lines.map(l => JSON.parse(l));
        await rollbackBackfill(entries);
        return;
    }

    // --- DRY-RUN or APPLY ---
    const tickets = await searchOohOpenTickets();
    console.info(`[backfill] Found ${tickets.length} open OOH tickets.`);

    const rows = await planBackfill(tickets);

    printPlanTable(rows);

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const planPath = join(process.cwd(), `backfill-plan-${ts}.json`);
    writeFileSync(planPath, JSON.stringify(rows, null, 2));
    console.info(`[backfill] Plan saved to: ${planPath}`);

    if (!applyMode) {
        console.info('[backfill] Dry run complete. Pass --apply --plan <file> to apply.');
        return;
    }

    if (!planFile) {
        console.error('[backfill] --apply requires --plan <file>');
        process.exit(1);
    }

    const planRows = JSON.parse(readFileSync(planFile, 'utf8'));
    const rollbackPath = join(process.cwd(), `backfill-rollback-${ts}.json`);
    const rollbackStream = createWriteStream(rollbackPath, { flags: 'a' });
    console.info(`[backfill] Apply mode. Rollback file: ${rollbackPath}`);

    await applyBackfill(planRows, { rollbackStream });
    rollbackStream.end();

    // Copy rollback file to the ops holding directory.
    const opsDir = 'C:\\harness-runs\\iot-ooh-dash';
    try {
        if (!existsSync(opsDir)) mkdirSync(opsDir, { recursive: true });
        const dest = join(opsDir, `backfill-rollback-${ts}.json`);
        writeFileSync(dest, readFileSync(rollbackPath));
        console.info(`[backfill] Rollback file copied to: ${dest}`);
    } catch (err) {
        console.warn(`[backfill] Could not copy rollback file to ${opsDir}: ${err.message}`);
    }
}

// Only execute main() when run directly, not when imported by tests.
const isMain = process.argv[1] &&
    (process.argv[1].endsWith('backfill-ooh-titles.mjs') ||
     process.argv[1].endsWith('backfill-ooh-titles'));
if (isMain) {
    main().catch(err => {
        console.error('[backfill] Fatal error:', err.message);
        process.exit(1);
    });
}
