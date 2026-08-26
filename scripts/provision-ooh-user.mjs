#!/usr/bin/env node
/**
 * provision-ooh-user.mjs — provision the OOH handler role for a set of users.
 * ============================================================================
 *
 * WHAT THIS DOES
 *   Ensures each target user's document in the identity point-of-truth carries the
 *   AreaClaim that grants the OOH call-handler role. It does this by point-reading the
 *   user doc, checking whether the claim is already present, and (only under --commit)
 *   upserting the doc with the claim added. It NEVER creates a user that doesn't exist
 *   (per SD-586 the Azure AD B2C account + user doc must be provisioned first) unless
 *   --create is explicitly passed.
 *
 * POINT-OF-TRUTH COORDINATES (confirmed)
 *   endpoint   https://airedale-knowledgebase.documents.azure.com:443/
 *   database   KnowledgeBase
 *   container  user
 *   doc id     <lowercased email>            (e.g. sam.day@sccuk.com -> sam.day@sccuk.com)
 *   partition  path /partitionKey, value "user"
 *   auth       AAD only (disableLocalAuth:true) — DefaultAzureCredential, no master key.
 *
 * THE CLAIM (AreaClaim[] entry) — OOH handler:
 *   { "claimArea":1500, "claimGroup":3500, "claimPermission":200, "modifier":[], "excludeModifiers":null }
 *   With --iot, ALSO ensure the IoT kill-switch-holder claim:
 *   { "claimArea":1400, "claimGroup":3500, "claimPermission":200, "modifier":[], "excludeModifiers":null }
 *   (claimArea 1500 = Zendesk/OOH -> handler; 1400 = IoT -> iot. See config.js roleMap.)
 *
 * USAGE
 *   # Dry-run (DEFAULT — reads only, writes NOTHING). Shows exists?/claim-present?/planned diff.
 *   node scripts/provision-ooh-user.mjs
 *   node scripts/provision-ooh-user.mjs --iot          # also plan the 1400 kill-switch claim
 *
 *   # Commit (performs the upsert). Requires Cosmos Data Contributor (see ACCESS below).
 *   node scripts/provision-ooh-user.mjs --commit
 *   node scripts/provision-ooh-user.mjs --commit --iot
 *   node scripts/provision-ooh-user.mjs --commit --create   # allow creating a missing doc (DANGER)
 *
 * ACCESS REQUIRED
 *   Reads (dry-run):  Cosmos DB Built-in Data Reader on airedale-knowledgebase.
 *   Writes (--commit): Cosmos DB Built-in Data CONTRIBUTOR on airedale-knowledgebase.
 *   James currently holds only Data Reader, so the --commit path will 403 until Spencer
 *   grants Data Contributor. Dry-run works today on read access.
 *   Auth is via DefaultAzureCredential — be logged in with `az login` (or a workload/env
 *   credential) as a principal that has the role above.
 *
 * SAFETY
 *   - Dry-run by default; --commit is required to write.
 *   - Idempotent: a claim already present is left untouched (no duplicates).
 *   - Before any upsert, the ORIGINAL doc is backed up to ./backups/<email>.json.
 *   - Optimistic concurrency: upsert uses If-Match on the doc's current _etag.
 *   - Missing target doc -> loud warning + skip (unless --create).
 *   - Exit code is non-zero if any target failed.
 */

import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/* ------------------------------------------------------------------ */
/* CONFIG — TARGET USERS                                               */
/* ------------------------------------------------------------------ */
// FILL IN the four testers' real LOGIN emails before running --commit.
// OPEN QUESTION: which login domain — @sccuk.com or @airedale-group.co.uk? These MUST be
// the account's actual sign-in email, because the doc `id` is the lowercased login email.
// Leave the FILL-IN-* placeholders as-is and the script will skip them with a warning.
const TARGET_USERS = [
    { email: 'FILL-IN-sam-day@REPLACE.com',  name: 'Sam Day' },   // TODO: confirm login email/domain
    { email: 'FILL-IN-csaba@REPLACE.com',    name: 'Csaba' },     // TODO: confirm surname + login email/domain
    { email: 'FILL-IN-tony@REPLACE.com',     name: 'Tony' },      // TODO: confirm surname + login email/domain
    { email: 'FILL-IN-meg@REPLACE.com',      name: 'Meg' },       // TODO: confirm surname + login email/domain
];

/* ------------------------------------------------------------------ */
/* COSMOS COORDINATES (confirmed — do not change without SD-586 sign-off) */
/* ------------------------------------------------------------------ */
const ENDPOINT       = 'https://airedale-knowledgebase.documents.azure.com:443/';
const DATABASE       = 'KnowledgeBase';
const CONTAINER      = 'user';
const PARTITION_PATH = '/partitionKey';   // informational; value below is what we read/write with
const PARTITION_VAL  = 'user';

// The claims we ensure present. --iot toggles which are in scope (see resolveClaims()).
const HANDLER_CLAIM = { claimArea: 1500, claimGroup: 3500, claimPermission: 200, modifier: [], excludeModifiers: null };
const IOT_CLAIM     = { claimArea: 1400, claimGroup: 3500, claimPermission: 200, modifier: [], excludeModifiers: null };

/* ------------------------------------------------------------------ */
/* ARGS                                                               */
/* ------------------------------------------------------------------ */
const args    = new Set(process.argv.slice(2));
const COMMIT  = args.has('--commit');
const IOT     = args.has('--iot');
const CREATE  = args.has('--create');

const __dirname   = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR  = join(__dirname, '..', 'backups');

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function resolveClaims() {
    // Default (no --iot): handler only. --iot: ADD the kill-switch (1400) claim as well as
    // the handler claim — a kill-switch holder is also an OOH handler.
    return IOT ? [HANDLER_CLAIM, IOT_CLAIM] : [HANDLER_CLAIM];
}

function claimPresent(doc, claim) {
    const arr = Array.isArray(doc?.AreaClaim) ? doc.AreaClaim : [];
    return arr.some(c => c && c.claimArea === claim.claimArea);
}

function isPlaceholder(email) {
    return /^FILL-IN-/i.test(email);
}

function backup(email, doc) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const path = join(BACKUP_DIR, `${email}.json`);
    writeFileSync(path, JSON.stringify(doc, null, 2));
    return path;
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */
async function main() {
    const claims = resolveClaims();
    console.log('OOH user provisioning');
    console.log(`  mode      : ${COMMIT ? 'COMMIT (will write)' : 'DRY-RUN (reads only, no writes)'}`);
    console.log(`  claims    : ${claims.map(c => c.claimArea).join(', ')}${IOT ? ' (--iot)' : ''}`);
    console.log(`  endpoint  : ${ENDPOINT}`);
    console.log(`  target    : ${DATABASE}/${CONTAINER} (pk ${PARTITION_PATH}="${PARTITION_VAL}")`);
    console.log(`  create    : ${CREATE ? 'yes (--create — will create missing docs)' : 'no (missing docs are skipped)'}`);
    console.log('');

    const client    = new CosmosClient({ endpoint: ENDPOINT, aadCredentials: new DefaultAzureCredential() });
    const container = client.database(DATABASE).container(CONTAINER);

    let failures = 0;
    let changed  = 0;

    for (const user of TARGET_USERS) {
        const email = String(user.email || '').toLowerCase().trim();
        const label = `${user.name} <${email}>`;
        console.log(`- ${label}`);

        if (!email || isPlaceholder(email)) {
            console.log('    SKIP  placeholder email — fill in the real login email before committing.');
            failures++;   // treat unfilled placeholders as a not-done state
            continue;
        }

        // Point-read the doc (id = lowercased email, partition = "user").
        let doc = null;
        try {
            const { resource } = await container.item(email, PARTITION_VAL).read();
            doc = resource || null;
        } catch (err) {
            if (err.code === 404) {
                doc = null;
            } else {
                console.log(`    ERROR read failed: ${err.code || ''} ${err.message}`);
                failures++;
                continue;
            }
        }

        if (!doc) {
            if (!CREATE) {
                console.log('    WARN  *** user doc does NOT exist ***');
                console.log('          Per SD-586 the Azure AD B2C account + user doc must exist FIRST.');
                console.log('          Skipping (pass --create to override — not recommended).');
                failures++;
                continue;
            }
            console.log('    NOTE  user doc missing — --create set, will create a minimal doc.');
            doc = { id: email, partitionKey: PARTITION_VAL, AreaClaim: [] };
        } else {
            console.log(`    exists: yes (_etag ${doc._etag})`);
        }

        // Determine which claims are missing (idempotency).
        const current = Array.isArray(doc.AreaClaim) ? doc.AreaClaim : [];
        const missing = claims.filter(c => !claimPresent(doc, c));
        for (const c of claims) {
            console.log(`    claim ${c.claimArea}: ${claimPresent(doc, c) ? 'already present' : 'ABSENT — will add'}`);
        }

        if (missing.length === 0) {
            console.log('    OK    nothing to do (all claims present).');
            continue;
        }

        // Show the exact planned change (diff).
        const nextAreaClaim = [...current, ...missing];
        console.log('    PLAN  add to AreaClaim[]:');
        for (const c of missing) console.log(`            + ${JSON.stringify(c)}`);
        console.log(`          AreaClaim length ${current.length} -> ${nextAreaClaim.length}`);

        if (!COMMIT) {
            console.log('    DRY-RUN: no write performed.');
            continue;
        }

        // ---- COMMIT PATH (requires Data Contributor) ----
        // Backup original first.
        try {
            const bpath = backup(email, doc);
            console.log(`    backup written: ${bpath}`);
        } catch (err) {
            console.log(`    ERROR backup failed, refusing to write: ${err.message}`);
            failures++;
            continue;
        }

        const body = { ...doc, id: email, partitionKey: PARTITION_VAL, AreaClaim: nextAreaClaim };
        const options = doc._etag ? { accessCondition: { type: 'IfMatch', condition: doc._etag } } : {};
        try {
            const { resource } = await container.items.upsert(body, options);
            console.log(`    WROTE upsert ok (new _etag ${resource?._etag}).`);
            changed++;
        } catch (err) {
            if (err.code === 412) {
                console.log('    ERROR concurrency conflict (doc changed since read) — re-run.');
            } else if (err.code === 403 || err.code === 'Forbidden') {
                console.log('    ERROR 403 Forbidden — needs Cosmos Data CONTRIBUTOR (pending Spencer grant).');
            } else {
                console.log(`    ERROR upsert failed: ${err.code || ''} ${err.message}`);
            }
            failures++;
            continue;
        }
    }

    console.log('');
    console.log(`Summary: ${changed} changed, ${failures} failed/skipped, ${TARGET_USERS.length} targets.`);
    if (!COMMIT) console.log('This was a DRY-RUN. Re-run with --commit to apply (needs Data Contributor).');

    if (failures > 0) process.exit(1);
}

main().catch(err => {
    console.error(`FATAL: ${err.code || ''} ${err.message}`);
    process.exit(1);
});
