/**
 * OOHDASH-128 (OQ6) — LIVE read-only spot-check for the legacy bare-salus bracket lookup.
 *
 * Verifies that after the patch:
 *   1. Every device returned by the bracket search "(NNNN-" has legacySalusSiteNo === String(siteNo).
 *   2. No device ID appears twice in the combined workspace (dedup confirmed).
 *   3. No device whose parenthetical siteNo does not equal the target site number is present.
 *   4. The expected older-unit codes are present at each site (hard stop if absent).
 *   5. For site 5791, the no-bracket units (r-2, f-1, f-2) are absent (D2 deferred — OOHDASH-129).
 *
 * READ-ONLY / SAFE BY CONSTRUCTION:
 *   - GET only. POST only to /api/auth/login (JWT auth). No device write ever made.
 *   - WRITES_DISABLED is irrelevant — no write path is touched.
 *   - No secret is logged; the JWT is held in memory and never printed.
 *
 * AUTH: JWT via credentials/thingsboard.env (TB_URL, TB_USERNAME, TB_PASSWORD).
 * If the file is absent or credentials are incomplete, every case reports skip-with-reason.
 *
 * RUN:  node --test test/live/legacy-salus-sitecheck.test.js
 * NOT run by CI ("unit tests" check). Opt-in only. Record the output in the release preflight doc.
 * The post-deploy smoke (open site 5204 in the live dashboard, check §5.1-5.3) is a separate manual step.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import axios from 'axios';

// ── legacySalusSiteNo — inline copy matching services/tb-device.js (for independence) ──────────
function legacySalusSiteNo(rawName) {
    const s = String(rawName == null ? '' : rawName);
    if (!/[_]salus[_]/i.test(s)) return null;
    const m = s.match(/\(([^)]*)\)\s*$/);
    if (!m) return null;
    const inner = m[1];
    const dm = inner.match(/^\s*(\d+)\s*-/);
    if (!dm) return null;
    return dm[1];
}

// ── Credentials ──────────────────────────────────────────────────────────────────────────────────
function loadCreds() {
    let raw;
    try {
        raw = readFileSync(new URL('../../credentials/thingsboard.env', import.meta.url), 'utf8');
    } catch {
        return null;
    }
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    if (!env.TB_URL || !env.TB_USERNAME || !env.TB_PASSWORD) return null;
    return { url: env.TB_URL.replace(/\/$/, ''), username: env.TB_USERNAME, password: env.TB_PASSWORD };
}

const creds = loadCreds();
const SKIP_REASON = 'credentials/thingsboard.env absent or incomplete — test written, not run';

// ── Read-only TB helpers ──────────────────────────────────────────────────────────────────────────
async function login({ url, username, password }) {
    const res = await axios.post(`${url}/api/auth/login`, { username, password }, { timeout: 15000 });
    return res.data.token;
}

function authHdr(token) { return { headers: { 'X-Authorization': `Bearer ${token}` }, timeout: 15000 }; }

async function tbPagedQuery(url, token, textSearch, pageSize = 200) {
    const q = `${url}/api/tenant/devices?textSearch=${encodeURIComponent(textSearch)}&pageSize=${pageSize}&page=0&sortProperty=name&sortOrder=ASC`;
    const res = await axios.get(q, authHdr(token));
    return Array.isArray(res.data?.data) ? res.data.data : [];
}

// Combined: token-prefix devices + bracket-search devices, deduped by device ID.
async function workspaceDevices(url, token, siteNo) {
    const [tokenDevices, bracketDevices] = await Promise.all([
        tbPagedQuery(url, token, `gk-${siteNo}`),
        tbPagedQuery(url, token, `(${siteNo}-`)
    ]);
    const byId = new Map();
    for (const d of tokenDevices) {
        const id = d?.id?.id || d?.id || d?.name;
        if (id) byId.set(id, d);
    }
    for (const d of bracketDevices) {
        const id = d?.id?.id || d?.id || d?.name;
        if (id && !byId.has(id)) byId.set(id, d);
    }
    return [...byId.values()];
}

// ── Per-site expected older-unit patterns ─────────────────────────────────────────────────────────
// Each entry: the site number, a set of expected bracket codes (partial match), and codes that must
// NOT appear. The expected codes are substrings that must appear in at least one device name.
const SITES = [
    {
        siteNo: '5694',
        description: 'discovery baseline',
        expectedCodes: ['5694-r-1', '5694-r-2', '5694-f-1', '5694-f-2', '5694-f-3', '5694-s-1'],
        forbiddenPatterns: []  // any device whose legacySalusSiteNo !== "5694" is already caught by the guard
    },
    {
        siteNo: '5204',
        description: 'malformed letter z alongside well-formed codes',
        expectedCodes: ['5204-r-2', '5204-r-3', '5204-f-1', '5204-f-2', '5204-f-3', '5204-z-1'],
        // Strict: no unit whose parsed siteNo is "520" or "52040"
        forbiddenSiteNos: ['520', '52040']
    },
    {
        siteNo: '5788',
        description: 'swapped code 1-s alongside well-formed codes',
        expectedCodes: ['5788-r-1', '5788-r-2', '5788-f-1', '5788-f-2', '5788-f-3', '5788-1-s'],
        forbiddenSiteNos: []
    },
    {
        siteNo: '5191',
        description: 'total-failure site — only older units in TB',
        expectedCodes: ['5191-f-2'],
        forbiddenSiteNos: []
    },
    {
        siteNo: '5791',
        description: 'z-1 present; no-bracket units deferred (D2 OOHDASH-129)',
        expectedCodes: ['5791-z-1'],
        // D2: no-bracket units must NOT appear — they have no parenthetical
        absentFromBracketSearch: ['5791-r-2', '5791-f-1', '5791-f-2'],
        forbiddenSiteNos: []
    }
];

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────────
for (const site of SITES) {
    test(`LIVE OQ6: site ${site.siteNo} (${site.description}) — older-unit guard and expected codes`, { skip: creds ? false : SKIP_REASON }, async (t) => {
        const token = await login(creds);
        let devices;
        try {
            devices = await workspaceDevices(creds.url, token, site.siteNo);
        } catch (err) {
            t.skip(`site ${site.siteNo} unreachable at run time: ${err.message}`);
            return;
        }

        const names = devices.map(d => d.name || '');
        console.log(`[OQ6 ${site.siteNo}] total=${devices.length} devices: ${names.join(', ')}`);

        // 1. No duplicate device IDs.
        const ids = devices.map(d => d?.id?.id || d?.id || d?.name);
        const unique = new Set(ids);
        assert.equal(unique.size, ids.length, `site ${site.siteNo}: duplicate device ID detected`);

        // 2. Every older unit (bracket-matched) has the correct site number.
        const olderUnits = names.filter(n => legacySalusSiteNo(n) !== null);
        for (const name of olderUnits) {
            const parsed = legacySalusSiteNo(name);
            assert.equal(parsed, site.siteNo,
                `site ${site.siteNo}: older unit "${name}" has parsed siteNo "${parsed}" !== "${site.siteNo}" (cross-site guard failure)`);
        }

        // 3. Forbidden site numbers must not appear in any older unit.
        for (const forbidden of (site.forbiddenSiteNos || [])) {
            const leaked = olderUnits.filter(n => legacySalusSiteNo(n) === forbidden);
            assert.equal(leaked.length, 0,
                `site ${site.siteNo}: forbidden siteNo "${forbidden}" leaked in: ${JSON.stringify(leaked)}`);
        }

        // 4. Expected bracket codes must each be present in at least one device name.
        for (const code of site.expectedCodes) {
            const found = names.some(n => n.includes(`(${code})`));
            assert.ok(found,
                `site ${site.siteNo}: expected older unit "(${code})" not found in workspace. Present names: ${JSON.stringify(names)}`);
        }

        // 5. Absent codes (D2 deferred no-bracket units) must not appear.
        for (const absent of (site.absentFromBracketSearch || [])) {
            // These devices have no parenthetical, so their device name contains the code but not in brackets.
            const leaked = names.filter(n => n.includes(absent) && !n.includes(`(${absent})`));
            assert.equal(leaked.length, 0,
                `site ${site.siteNo}: D2-deferred no-bracket device "${absent}" must not appear in workspace: ${JSON.stringify(leaked)}`);
        }

        console.log(`[OQ6 ${site.siteNo}] PASS — ${olderUnits.length} older unit(s) found, all guard-checked.`);
    });
}
