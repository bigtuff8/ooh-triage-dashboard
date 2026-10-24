/**
 * OOHDASH-140: Tuya site read, schedule decode, verdict and attachTuya.
 *
 * Exports: { readSiteListing, attachTuya, kitchenCircuitVerdict, parseOwonSchedule,
 *            parseTongouSchedule, displayName }
 *
 * READ-ONLY. No control path exists here. The Tuya client is GET-only.
 */

import { readFileSync } from 'node:fs';
import { tuyaGet } from './tuya-client.js';
import { evaluateSchedule } from './schedule.js';
import { normaliseName } from './tb-device.js';

// ── OWON product IDs ───────────────────────────────────────────────────────────
const OWON_PRODUCT_IDS = new Set(['xr5kjdxfxavku0gb', 'vnxcwomqkofjhjcc']);

function deviceModel(productId) {
    return OWON_PRODUCT_IDS.has((productId || '').toLowerCase()) ? 'owon' : 'tongou';
}

// ── Site UID map (lazy, memoised) ─────────────────────────────────────────────
let _sitesMap = null;

function loadSitesMap() {
    if (!_sitesMap) {
        try {
            _sitesMap = JSON.parse(readFileSync(new URL('../data/tuya-sites.json', import.meta.url), 'utf8'));
        } catch (err) {
            console.warn(`[TUYA] Could not load tuya-sites.json: ${err.message}`);
            _sitesMap = {};
        }
    }
    return _sitesMap;
}

// ── Schedule cache ────────────────────────────────────────────────────────────
const _scheduleCache = new Map(); // deviceId → { entries, source, cachedAt, error }
const SCHEDULE_SUCCESS_TTL = 5 * 60 * 1000;  // 5 minutes
const SCHEDULE_FAILURE_TTL = 30 * 1000;       // 30 seconds

// ── OWON schedule decode ──────────────────────────────────────────────────────

/**
 * Decode an OWON base64 schedule blob to normalised entry array.
 * 5 bytes per entry: [dayMask(bit0=Sun), hour, minute, on(1=true), enabled(nonzero=true)]
 */
export function parseOwonSchedule(b64) {
    if (!b64 || b64 === 'AA==' || b64 === '') return [];
    try {
        const buf = Buffer.from(b64, 'base64');
        const entries = [];
        for (let i = 0; i + 5 <= buf.length; i += 5) {
            const dayMask = buf[i];
            const h = buf[i + 1];
            const m = buf[i + 2];
            const onByte = buf[i + 3];
            const enableByte = buf[i + 4];
            // loops: 7 chars, position 0=Sun … 6=Sat
            const loops = Array.from({ length: 7 }, (_, bit) => (dayMask & (1 << bit) ? '1' : '0')).join('');
            entries.push({
                time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
                loops,
                on: onByte === 1,
                enabled: enableByte !== 0
            });
        }
        return entries;
    } catch {
        return [];
    }
}

// ── Tongou schedule decode ────────────────────────────────────────────────────

/**
 * Normalise Tongou timer array to entry array.
 * Returns { _tzError: true } if any active entry has a non-London timezone_id.
 */
export function parseTongouSchedule(timerArray) {
    if (!timerArray || timerArray.length === 0) return [];
    const entries = [];
    for (const t of timerArray) {
        if (t.enable === false) continue; // skip explicitly disabled
        // Check timezone
        if (t.timezone_id && t.timezone_id !== 'Europe/London') {
            return { _tzError: true };
        }
        entries.push({
            time: t.time,
            loops: t.loops || '0000000',
            on: !!(t.functions && t.functions[0] && t.functions[0].value),
            enabled: t.enable !== false
        });
    }
    return entries;
}

// ── Per-device schedule fetch with cache ──────────────────────────────────────

async function fetchScheduleForDevice(entry) {
    const id = entry.id;
    const cached = _scheduleCache.get(id);
    const now = Date.now();
    if (cached) {
        const ttl = cached.error ? SCHEDULE_FAILURE_TTL : SCHEDULE_SUCCESS_TTL;
        if (now - cached.cachedAt < ttl) {
            return cached.error ? { entries: null, error: cached.error } : { entries: cached.entries, source: cached.source };
        }
    }

    const model = deviceModel(entry.product_id);

    try {
        if (model === 'owon') {
            // Shadow properties
            const path = `/v2.0/cloud/thing/${id}/shadow/properties?codes=schedule`;
            const json = await tuyaGet(path);
            const props = json.result?.properties || [];
            const scheduleProp = props.find(p => p.code === 'schedule');
            const b64 = scheduleProp?.value || '';
            const entries = parseOwonSchedule(b64);
            _scheduleCache.set(id, { entries, source: 'owon-shadow', cachedAt: now, error: null });
            return { entries, source: 'owon-shadow' };
        } else {
            // Tongou timers (paginated)
            let allTimers = [];
            let lastRowKey = null;
            for (let page = 0; page < 10; page++) {
                const path = lastRowKey
                    ? `/v2.0/cloud/timer/device/${id}?last_row_key=${lastRowKey}`
                    : `/v2.0/cloud/timer/device/${id}`;
                const json = await tuyaGet(path);
                const timers = json.result?.timers || json.result || [];
                if (Array.isArray(timers)) allTimers.push(...timers);
                if (!json.result?.has_more) break;
                lastRowKey = json.result?.last_row_key || null;
                if (!lastRowKey) break;
            }
            const parsed = parseTongouSchedule(allTimers);
            if (parsed && parsed._tzError) {
                const result = { entries: null, error: 'tz-error' };
                _scheduleCache.set(id, { ...result, source: null, cachedAt: now });
                return result;
            }
            _scheduleCache.set(id, { entries: parsed, source: 'tongou-timers', cachedAt: now, error: null });
            return { entries: parsed, source: 'tongou-timers' };
        }
    } catch (err) {
        _scheduleCache.set(id, { entries: null, error: err.message || 'fetch-error', source: null, cachedAt: now });
        return { entries: null, error: err.message || 'fetch-error' };
    }
}

// ── Live-state extraction ─────────────────────────────────────────────────────

function extractLiveState(entry) {
    const model = deviceModel(entry.product_id);
    const status = Array.isArray(entry.status) ? entry.status : [];
    const getVal = code => {
        const s = status.find(s => s.code === code);
        return s ? s.value : undefined;
    };

    // switchOn: switch_1 first, then switch
    let switchOn = null;
    const sw1 = getVal('switch_1');
    const sw = getVal('switch');
    if (sw1 !== undefined) switchOn = sw1 === true || sw1 === 'true';
    else if (sw !== undefined) switchOn = sw === true || sw === 'true';

    // powerW
    let powerW = null;
    if (model === 'tongou') {
        const cp = getVal('cur_power');
        if (cp !== undefined && cp !== null) powerW = Number(cp) / 10;
    } else {
        // OWON: sum active_power_a+b+c
        const pa = getVal('active_power_a');
        const pb = getVal('active_power_b');
        const pc = getVal('active_power_c');
        if (pa !== undefined || pb !== undefined || pc !== undefined) {
            powerW = (Number(pa) || 0) + (Number(pb) || 0) + (Number(pc) || 0);
        }
    }

    return { model, switchOn, powerW, online: !!entry.online };
}

// ── readSiteListing ───────────────────────────────────────────────────────────

/**
 * Fetch the site's Tuya device listing (one paginated call).
 * Returns array of listing entries with live state, or throws.
 */
export async function readSiteListing(brand, siteNo) {
    const key = `${brand}-${siteNo}`;
    const sitesMap = loadSitesMap();
    const uid = sitesMap[key];
    if (!uid) {
        throw Object.assign(new Error(`[TUYA] Site ${key} not in sites map`), { reason: 'no-site-map' });
    }

    const entries = [];
    let lastRowKey = null;

    for (let page = 0; page < 10; page++) {
        const path = lastRowKey
            ? `/v1.0/users/${uid}/devices?page_size=100&last_row_key=${lastRowKey}`
            : `/v1.0/users/${uid}/devices?page_size=100`;
        const json = await tuyaGet(path);
        const devices = json.result?.devices || json.result || [];
        if (!Array.isArray(devices)) break;

        for (const raw of devices) {
            // Drop local_key immediately — never store or log
            const { local_key, ...safe } = raw;
            const liveState = extractLiveState(safe);
            entries.push({
                id: safe.id,
                name: safe.name,
                product_id: (safe.product_id || '').toLowerCase(),
                product_name: safe.product_name,
                online: safe.online,
                ...liveState,
                readAtMs: Date.now()
            });
        }

        if (!json.result?.has_more) break;
        lastRowKey = json.result?.last_row_key || null;
        if (!lastRowKey) break;
    }

    return entries;
}

// ── displayName ───────────────────────────────────────────────────────────────

const ZONE_TOKEN_MAP = {
    fryer: 'Fryer',
    grill: 'Grill',
    glasswasher: 'Glass washer',
    dishwasher: 'Dishwasher',
    potwash: 'Pot wash',
    bainmarie: 'Bain-marie',
    merrychef: 'Merrychef oven',
    hcupboard: 'Hot cupboard',
    heatedgantry: 'Heated gantry (pass)',
    coffeemachine: 'Coffee machine',
    supplyfan: 'Kitchen supply fan',
    barfan: 'Bar fan'
};

/**
 * Derive a caller-friendly display name for a kitchen device.
 * If the device has a `zone` field set by an operator, use it as-is.
 * Otherwise extract the zone token from the device name and append instance number
 * only when multiple of the same type are in the kitchen list.
 */
export function displayName(deviceId, allKitchenDevices) {
    // Check if any device has a manually set zone
    const self = allKitchenDevices.find(d => d.deviceId === deviceId);
    if (self && self.zone && self.zone !== deviceId && self.zone !== self.name) {
        return self.zone;
    }

    // Extract zone token from device name (split by '-', skip gk+siteNo prefix)
    const norm = normaliseName(deviceId);
    const segments = norm.split('-').filter(Boolean);
    // Skip 'gk', siteNo (digits), then find first matching zone token
    let zoneToken = null;
    let instanceNum = null;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (ZONE_TOKEN_MAP[seg]) {
            zoneToken = seg;
            // Instance number is the next numeric segment
            if (i + 1 < segments.length && /^\d+$/.test(segments[i + 1])) {
                instanceNum = parseInt(segments[i + 1], 10);
            }
            break;
        }
    }

    const friendlyBase = zoneToken ? ZONE_TOKEN_MAP[zoneToken] : (segments.slice(2).join(' ') || deviceId);

    if (!zoneToken || instanceNum === null) return friendlyBase;

    // Count how many kitchen devices have the same zone token
    const sameType = allKitchenDevices.filter(d => {
        const n = normaliseName(d.deviceId || '');
        const segs = n.split('-').filter(Boolean);
        return segs.includes(zoneToken);
    });

    if (sameType.length <= 1) return friendlyBase;
    return `${friendlyBase} ${instanceNum}`;
}

// ── kitchenCircuitVerdict ─────────────────────────────────────────────────────

const ZERO_LOAD_W = 1.0;

/**
 * 11-rule truth table for a kitchen circuit's Tuya state.
 * Input: the device.tuya object (including schedule.state).
 */
export function kitchenCircuitVerdict(tuya) {
    if (!tuya || tuya.status !== 'ok') return 'fallback';
    if (tuya.online === false) return 'offline';
    if (tuya.switchOn === null) return 'fallback';

    const sched = tuya.schedule?.state || 'unavailable';
    const on = tuya.switchOn;
    const isTongou = tuya.model === 'tongou';
    const pw = tuya.powerW;

    // Rule 4: ON + Tongou + powerW < 1.0
    if (on && isTongou && pw !== null && pw !== undefined && pw < ZERO_LOAD_W) return 'E';

    // Rules 5-7: ON
    if (on) {
        if (sched === 'on') return 'B';
        if (sched === 'off') return 'B-outside';
        return 'B-unscheduled'; // none, off-only, unavailable
    }

    // Rules 8-11: OFF
    if (sched === 'on') return 'A';
    if (sched === 'off') return 'C';
    if (sched === 'none') return 'D';
    return 'off-unknown'; // off-only, unavailable
}

// ── attachTuya ────────────────────────────────────────────────────────────────

/**
 * Attach Tuya live state to kitchen devices in the device array.
 * Modifies devices in-place. Never overwrites telemetry.switch_1.
 * Runs inside a 3-second budget (Promise.race).
 */
export async function attachTuya(devices, listing, opts = {}) {
    const budgetMs = opts.budgetMs ?? 3000;

    async function doWork() {
        const kitchenDevices = devices.filter(d => d.kind === 'kitchen');
        if (!listing || listing.length === 0) return; // legacy mode

        // Build normalised lookup map from listing
        const normMap = new Map(); // normName -> [entries]
        for (const entry of listing) {
            const norm = normaliseName(entry.name || '');
            if (!normMap.has(norm)) normMap.set(norm, []);
            normMap.get(norm).push(entry);
        }

        // Process kitchen devices concurrently (up to 6)
        const concurrency = 6;
        const queue = [...kitchenDevices];

        async function processOne(device) {
            const norm = normaliseName(device.deviceId || '');
            const matches = normMap.get(norm) || [];

            if (matches.length === 0) {
                device.tuya = { status: 'unavailable', reason: 'not-found', model: null, online: null, switchOn: null, powerW: null, readAtMs: null, schedule: null, verdict: 'fallback', displayName: null };
                return;
            }

            if (matches.length > 1) {
                device.tuya = { status: 'unavailable', reason: 'ambiguous', model: null, online: null, switchOn: null, powerW: null, readAtMs: null, schedule: null, verdict: 'fallback', displayName: null };
                return;
            }

            const entry = matches[0];

            try {
                // Fetch schedule
                let scheduleEntries = null;
                let scheduleSource = null;
                let scheduleState = 'unavailable';
                let scheduleResult = null;

                if (entry._preloadedSchedule !== undefined) {
                    // Fixture mode: use preloaded schedule
                    if (Array.isArray(entry._preloadedSchedule)) {
                        const parsed = parseTongouSchedule(entry._preloadedSchedule);
                        if (parsed && !parsed._tzError) {
                            scheduleEntries = parsed;
                            scheduleSource = 'fixture';
                        }
                    }
                } else {
                    const fetched = await fetchScheduleForDevice(entry);
                    scheduleEntries = fetched.entries;
                    scheduleSource = fetched.source;
                }

                if (scheduleEntries !== null) {
                    scheduleResult = evaluateSchedule(scheduleEntries, new Date(), { tz: 'Europe/London' });
                    scheduleState = scheduleResult.state;
                }

                device.tuya = {
                    status: 'ok',
                    reason: null,
                    model: entry.model,
                    online: entry.online,
                    switchOn: entry.switchOn,
                    powerW: entry.powerW,
                    readAtMs: entry.readAtMs,
                    schedule: scheduleResult ? {
                        state: scheduleResult.state,
                        lastChange: scheduleResult.lastChange,
                        nextOn: scheduleResult.nextOn,
                        nextOff: scheduleResult.nextOff,
                        entryCount: scheduleResult.entryCount
                    } : { state: 'unavailable', lastChange: null, nextOn: null, nextOff: null, entryCount: 0 },
                    verdict: kitchenCircuitVerdict({
                        status: 'ok',
                        online: entry.online,
                        switchOn: entry.switchOn,
                        powerW: entry.powerW,
                        model: entry.model,
                        schedule: { state: scheduleState }
                    }),
                    displayName: displayName(device.deviceId, kitchenDevices)
                };
                // INVARIANT: never overwrite telemetry.switch_1
            } catch (err) {
                device.tuya = { status: 'unavailable', reason: 'api-error', model: null, online: null, switchOn: null, powerW: null, readAtMs: null, schedule: null, verdict: 'fallback', displayName: null };
            }
        }

        // Process with bounded concurrency
        const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            let device;
            while ((device = queue.shift()) !== undefined) {
                await processOne(device);
            }
        });
        await Promise.all(workers);
    }

    const timeoutPromise = new Promise(resolve => setTimeout(resolve, budgetMs)).then(() => {
        // Timeout: mark unprocessed devices
        for (const d of devices) {
            if (d.kind === 'kitchen' && !d.tuya) {
                d.tuya = { status: 'unavailable', reason: 'timeout', model: null, online: null, switchOn: null, powerW: null, readAtMs: null, schedule: null, verdict: 'fallback', displayName: null };
            }
        }
    });

    await Promise.race([doWork(), timeoutPromise]);
}
