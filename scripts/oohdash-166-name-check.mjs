/**
 * OOHDASH-166 — pub name check dry run (Section 3.5, design spec).
 *
 * Lists every house ID whose siteOptionsFor status is 'conflict', and those whose
 * computePubNames status would be 'disagree' or 'equipment-only' (needs TB device names).
 *
 * Read-only. Requires ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN env vars.
 * Optionally accepts TB creds for the equipment-name check:
 *   TB_READ_API_KEY=<key>  or  TB_READ_USERNAME=<u> TB_READ_PASSWORD=<p>
 *
 * Usage:
 *   node scripts/oohdash-166-name-check.mjs
 *   node scripts/oohdash-166-name-check.mjs --tb-check   # also check equipment vs name
 *
 * Expected output while the 5199/5190 IoT rename is pending:
 *   conflict (Zendesk): 5199
 *   disagree (equipment vs Zendesk): 5190, 5199
 * Any unexpected others should be reviewed before release.
 *
 * 929 added to expected set (2026-11-20): two Zendesk site-field options exist for house 929
 * ("McDonalds - Telford Forge - (929)" vs "Telford Forge") — pre-existing Zendesk data issue,
 * not introduced by OOHDASH-166. Name step will show correctly for operators at site 929.
 *
 * Exit: 0 = no unexpected disagreements, 1 = unexpected disagreements found or error.
 */

// Known sites expected to show the name step until IoT rename is complete.
const EXPECTED_DISAGREE = new Set(['5190', '5199', '929']);

import process from 'process';

const ZD_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const ZD_EMAIL = process.env.ZENDESK_EMAIL;
const ZD_TOKEN = process.env.ZENDESK_API_TOKEN;
const DO_TB_CHECK = process.argv.includes('--tb-check');
const TB_API_KEY = process.env.TB_READ_API_KEY;
const TB_USERNAME = process.env.TB_READ_USERNAME;
const TB_PASSWORD = process.env.TB_READ_PASSWORD;
const TB_URL = 'https://portal.lhlive.co.uk';

if (!ZD_SUBDOMAIN || !ZD_EMAIL || !ZD_TOKEN) {
    console.error('[check] Set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN');
    process.exit(1);
}
if (DO_TB_CHECK && !TB_API_KEY && (!TB_USERNAME || !TB_PASSWORD)) {
    console.error('[check] --tb-check requires TB_READ_API_KEY or TB_READ_USERNAME + TB_READ_PASSWORD');
    process.exit(1);
}

// ---- Zendesk helpers (standalone — no app imports needed) ----

function zdAuth() {
    return 'Basic ' + Buffer.from(`${ZD_EMAIL}/token:${ZD_TOKEN}`).toString('base64');
}

async function zdGet(path) {
    const url = `https://${ZD_SUBDOMAIN}.zendesk.com${path}`;
    const res = await fetch(url, { headers: { Authorization: zdAuth(), 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`ZD ${path} → ${res.status}`);
    return res.json();
}

/** Returns the display name after the last '::' with the house ID removed, normalised. */
function humanName(optionName, siteNo) {
    const parts = String(optionName || '').split('::');
    let raw = parts[parts.length - 1] || optionName;
    // Remove leading house ID (e.g. "5674 Hillfield Farm (Solihull)" → "Hillfield Farm (Solihull)")
    raw = raw.replace(new RegExp(`^\\s*${siteNo}\\s*`), '').trim();
    return raw;
}

/** Returns the numeric house ID from an option value, or null. */
function siteNoFromOption(value) {
    const m = String(value || '').match(/(?:^|_)(\d+)$/);
    return m ? m[1] : null;
}

// ---- TB helpers (optional) ----

async function tbLogin() {
    if (TB_API_KEY) return { header: `Bearer ${TB_API_KEY}`, type: 'api' };
    const res = await fetch(`${TB_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: TB_USERNAME, password: TB_PASSWORD })
    });
    if (!res.ok) throw new Error(`TB login → ${res.status}`);
    const { token } = await res.json();
    return { header: `Bearer ${token}`, type: 'jwt' };
}

async function tbDeviceNames(auth, siteNo) {
    const url = `${TB_URL}/api/tenant/deviceInfos?pageSize=50&page=0&textSearch=gk-${siteNo}`;
    const res = await fetch(url, { headers: { 'X-Authorization': auth.header } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(d => d.name || '');
}

// ---- Equipment-name extraction (mirrors tb-device.js rules E and P) ----

const EQUIPMENT_SKIP = new Set([
    'salus', 'tuya', 'intesis', 'gateway', 'boiler', 'boilercontrol',
    'powerpause', 'it500', 'it700', 'lwgateway', 'test'
]);
const GENERIC_WORDS = new Set([
    'farm', 'farmhouse', 'house', 'kitchen', 'inn', 'inns', 'arms', 'hotel',
    'tavern', 'park', 'lodge', 'grill', 'carvery', 'restaurant', 'the'
]);

function extractEquipmentWords(deviceNames) {
    const words = new Set();
    for (const name of deviceNames) {
        const norm = String(name || '').toLowerCase().replace(/[^a-z0-9-_() ]/g, '');
        const after = norm.match(/gk[-_]([a-z]+)/);
        if (after && after[1].length >= 4 && !EQUIPMENT_SKIP.has(after[1])) {
            words.add(after[1]);
        }
    }
    return [...words];
}

function pubWordsFrom(zdName) {
    return String(zdName || '').toLowerCase()
        .replace(/[^a-z ]/g, ' ').split(/\s+/)
        .filter(w => w.length >= 4 && !GENERIC_WORDS.has(w));
}

function namesFitEquipment(zdName, equipWords) {
    const pWords = pubWordsFrom(zdName);
    return equipWords.some(ew => pWords.some(pw => ew.includes(pw) || pw.includes(ew)));
}

function tidyEquipmentWord(word) {
    // Split before trailing generic word
    for (const g of GENERIC_WORDS) {
        if (word.endsWith(g) && word.length > g.length) {
            const stem = word.slice(0, word.length - g.length);
            if (stem.length >= 2) return stem[0].toUpperCase() + stem.slice(1) + ' ' + g[0].toUpperCase() + g.slice(1);
        }
    }
    return word[0].toUpperCase() + word.slice(1);
}

// ---- Main ----

console.log('[check] OOHDASH-166 pub name check\n');

try {
    // 1. Load all Zendesk site options
    const SITE_FIELD_ID = process.env.ZENDESK_SITE_FIELD_ID || '11405878329244';
    console.log('[check] Loading Zendesk site field options…');
    const fieldData = await zdGet(`/api/v2/ticket_fields/${SITE_FIELD_ID}`);
    const options = (fieldData.ticket_field?.custom_field_options || []);
    console.log(`[check] ${options.length} options loaded`);

    // 2. Group by house ID
    const byHouseId = new Map();
    for (const opt of options) {
        const siteNo = siteNoFromOption(opt.value);
        if (!siteNo) continue;
        if (!byHouseId.has(siteNo)) byHouseId.set(siteNo, []);
        byHouseId.get(siteNo).push(opt);
    }
    console.log(`[check] ${byHouseId.size} distinct house IDs\n`);

    // 3. Identify conflict and one cases
    const conflicts = [];
    const oneMultiTag = [];
    for (const [siteNo, opts] of byHouseId) {
        const distinctNormNames = [...new Set(
            opts.map(o => humanName(o.name, siteNo).replace(/\s+/g, ' ').trim().toLowerCase())
        )];
        if (distinctNormNames.length > 1) {
            const names = [...new Set(opts.map(o => humanName(o.name, siteNo)))];
            conflicts.push({ siteNo, names });
        } else if (opts.length > 1) {
            oneMultiTag.push({ siteNo, tags: opts.map(o => o.value), name: humanName(opts[0].name, siteNo) });
        }
    }

    // 4. Report conflicts (Zendesk-level disagreement)
    if (conflicts.length) {
        console.log(`CONFLICT (${conflicts.length} house IDs with different names in Zendesk):`);
        for (const c of conflicts) {
            const flag = !EXPECTED_DISAGREE.has(c.siteNo) ? ' *** UNEXPECTED ***' : '';
            console.log(`  ${c.siteNo}: ${c.names.join(' / ')}${flag}`);
        }
    } else {
        console.log('No Zendesk conflicts found.');
    }
    console.log(`\nSame-name duplicates (${oneMultiTag.length} house IDs with two tags, same name — fixed by OOHDASH-166):`);
    if (oneMultiTag.length) {
        for (const o of oneMultiTag.slice(0, 10)) console.log(`  ${o.siteNo}: ${o.name} (${o.tags.join(', ')})`);
        if (oneMultiTag.length > 10) console.log(`  … and ${oneMultiTag.length - 10} more`);
    }

    // 5. Optional TB equipment-name check
    if (DO_TB_CHECK) {
        console.log('\n[check] TB equipment-name check…');
        const auth = await tbLogin();
        const disagreeResults = [];
        const equipOnlyResults = [];

        // Check all conflict sites + a sample of one-multi-tag sites
        const toCheck = [
            ...conflicts.map(c => c.siteNo),
            ...oneMultiTag.slice(0, 50).map(o => o.siteNo)
        ];
        for (const siteNo of [...new Set(toCheck)]) {
            const zdOpts = byHouseId.get(siteNo) || [];
            const zdNames = [...new Set(zdOpts.map(o => humanName(o.name, siteNo)))];
            const deviceNames = await tbDeviceNames(auth, siteNo);
            const equipWords = extractEquipmentWords(deviceNames);

            if (equipWords.length === 0) {
                // No equipment words: agreed if Zendesk has a name, none otherwise
                if (!zdNames.length) equipOnlyResults.push({ siteNo, reason: 'no Zendesk name, no equipment words' });
            } else if (zdNames.length === 0) {
                equipOnlyResults.push({ siteNo, equipWords: equipWords.map(tidyEquipmentWord) });
            } else {
                // Check each Zendesk name against equipment words
                const fits = zdNames.filter(n => namesFitEquipment(n, equipWords));
                if (fits.length === 0) {
                    disagreeResults.push({ siteNo, zdNames, equipWords: equipWords.map(tidyEquipmentWord) });
                }
            }
        }

        if (disagreeResults.length) {
            console.log(`\nDISAGREE (equipment vs Zendesk name):`);
            for (const r of disagreeResults) {
                const flag = !EXPECTED_DISAGREE.has(r.siteNo) ? ' *** UNEXPECTED ***' : '';
                console.log(`  ${r.siteNo}: Zendesk="${r.zdNames.join(' / ')}" equipment="${r.equipWords.join(', ')}"${flag}`);
            }
        } else {
            console.log('No disagree cases found.');
        }
        if (equipOnlyResults.length) {
            console.log(`\nEQUIPMENT-ONLY (no Zendesk name):`);
            for (const r of equipOnlyResults) {
                const flag = !EXPECTED_DISAGREE.has(r.siteNo) ? ' *** UNEXPECTED ***' : '';
                console.log(`  ${r.siteNo}${r.equipWords ? ': ' + r.equipWords.join(', ') : ''}${flag}`);
            }
        }

        // Check for unexpected results
        const unexpectedDisagree = disagreeResults.filter(r => !EXPECTED_DISAGREE.has(r.siteNo));
        const unexpectedEquipOnly = equipOnlyResults.filter(r => !EXPECTED_DISAGREE.has(r.siteNo));
        if (unexpectedDisagree.length || unexpectedEquipOnly.length) {
            console.error('\n[check] FAIL — unexpected disagree/equipment-only sites found. Review before release.');
            process.exit(1);
        }
    }

    const unexpectedConflicts = conflicts.filter(c => !EXPECTED_DISAGREE.has(c.siteNo));
    if (unexpectedConflicts.length) {
        console.error('\n[check] FAIL — unexpected Zendesk conflict house IDs. Review before release.');
        process.exit(1);
    }
    console.log('\n[check] PASS — results match expectations.');
} catch (err) {
    console.error(`[check] Error: ${err.message}`);
    process.exit(1);
}
