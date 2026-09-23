/**
 * OOHDASH-82 (design §3, §10.1) — device→area derivation + site-code parse.
 *
 * Proves deriveArea and parseSiteCodeLetter implement the confirmed B2 mapping:
 *   - iT700 → Accommodation unconditionally (with and without salusLocation);
 *   - iT500 letter s/f → Accommodation, r/b → Bar/Restaurant, else null;
 *   - intesis/gateway/tuya/refrigeration → null (never an area);
 *   - parseSiteCodeLetter extracts s/f/r/b from (1771-f-1) and 5670-s-1, is case-insensitive,
 *     and returns null for empty/malformed/non-sfrb.
 *
 * node --test style; runs under `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';

const { deriveArea, parseSiteCodeLetter } = await import('../services/tb-device.js');

/* ------------------------------ parseSiteCodeLetter ------------------------------ */

test('parseSiteCodeLetter: extracts the class letter from (1771-f-1) and 5670-s-1', () => {
    assert.equal(parseSiteCodeLetter('(1771-f-1)'), 'f');
    assert.equal(parseSiteCodeLetter('5670-s-1'), 's');
    assert.equal(parseSiteCodeLetter('6218-r-1'), 'r');
    assert.equal(parseSiteCodeLetter('6218-b-2'), 'b');
});

test('parseSiteCodeLetter: is case-insensitive', () => {
    assert.equal(parseSiteCodeLetter('6218-R-1'), 'r');
    assert.equal(parseSiteCodeLetter('(6218-F-3)'), 'f');
});

test('parseSiteCodeLetter: returns null for empty, malformed, or non-sfrb letters', () => {
    assert.equal(parseSiteCodeLetter(''), null);
    assert.equal(parseSiteCodeLetter(null), null);
    assert.equal(parseSiteCodeLetter(undefined), null);
    assert.equal(parseSiteCodeLetter('IT700'), null, 'the iT700 default label is not a site code');
    assert.equal(parseSiteCodeLetter('6218-x-1'), null, 'x is not one of the four class letters');
    assert.equal(parseSiteCodeLetter('6218'), null, 'no letter segment');
    assert.equal(parseSiteCodeLetter('f-6218-1'), null, 'letter must follow the leading site number (bleed-safe)');
});

/* ------------------------------ deriveArea ------------------------------ */

test('deriveArea: iT700 → Accommodation unconditionally (with and without salusLocation)', () => {
    assert.equal(deriveArea('salus-it700', {}), 'Accommodation');
    assert.equal(deriveArea('salus-it700', { salusLocation: 'IT700' }), 'Accommodation', 'the useless default label still maps to Accommodation');
    assert.equal(deriveArea('salus-it700', { salusLocation: 'Room 3' }), 'Accommodation');
    assert.equal(deriveArea('salus-it700', undefined), 'Accommodation', 'no client-scope read is required for iT700');
});

test('deriveArea: iT500 letter s/f → Accommodation', () => {
    assert.equal(deriveArea('salus-it500', { site: '6218-s-1' }), 'Accommodation', 's = Staff');
    assert.equal(deriveArea('salus-it500', { site: '(1771-f-1)' }), 'Accommodation', 'f = Flats');
});

test('deriveArea: iT500 letter r/b → Bar/Restaurant', () => {
    assert.equal(deriveArea('salus-it500', { site: '6218-r-1' }), 'Bar/Restaurant', 'r = Restaurant');
    assert.equal(deriveArea('salus-it500', { site: '6218-b-1' }), 'Bar/Restaurant', 'b = Bar');
});

test('deriveArea: iT500 with an unknown or missing site-code → null (fallback chip)', () => {
    assert.equal(deriveArea('salus-it500', { site: '6218-x-1' }), null);
    assert.equal(deriveArea('salus-it500', {}), null, 'no site attribute');
    assert.equal(deriveArea('salus-it500', undefined), null);
});

test('deriveArea: intesis, gateway, tuya, refrigeration, boiler-panel, unknown → null (never an area)', () => {
    for (const dt of ['intesis', 'gateway', 'tuya', 'refrigeration', 'boiler-panel', 'unknown']) {
        assert.equal(deriveArea(dt, { site: '6218-s-1' }), null, `${dt} must never be an area even with a site code`);
    }
});
