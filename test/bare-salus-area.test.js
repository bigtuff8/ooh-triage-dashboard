/**
 * OOHDASH-108 (design §6, §10.1) — old-convention ("bare-salus") area derivation + parenthetical fallback.
 *
 * Proves:
 *   - deriveArea('salus', ...) letter-resolves EXACTLY like salus-it500: r/b → Bar/Restaurant,
 *     s/f → Accommodation, missing/z/reversed → null;
 *   - the parenthetical fallback (DECISION 1 adopted): with CLIENT_SCOPE `site` absent, the site
 *     letter is parsed from the RAW device name's trailing parenthetical; a malformed parenthetical
 *     yields null; a present CLIENT_SCOPE letter ALWAYS wins over a differing parenthetical.
 *
 * node --test style; runs under `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';

const { deriveArea } = await import('../services/tb-device.js');

/* ------------------------------ CLIENT_SCOPE letter-resolve ------------------------------ */

test('deriveArea(salus): r/b → Bar/Restaurant (real sweep site codes)', () => {
    assert.equal(deriveArea('salus', { site: '(5694-r-2)' }), 'Bar/Restaurant', 'r = Restaurant (gk_wingfieldfarm_salus)');
    assert.equal(deriveArea('salus', { site: '(1793-b-1)' }), 'Bar/Restaurant', 'b = Bar (gk_platform5_salus)');
});

test('deriveArea(salus): s/f → Accommodation', () => {
    assert.equal(deriveArea('salus', { site: '5670-s-1' }), 'Accommodation', 's = Staff');
    assert.equal(deriveArea('salus', { site: '(1666-f-2)' }), 'Accommodation', 'f = Flats');
});

test('deriveArea(salus): missing / z / reversed letter → null (fallback chip)', () => {
    assert.equal(deriveArea('salus', {}), null, 'no site attribute');
    assert.equal(deriveArea('salus', undefined), null, 'no client scope');
    assert.equal(deriveArea('salus', { site: '6218-z-1' }), null, 'z is not one of the four class letters');
    assert.equal(deriveArea('salus', { site: 'f-6218-1' }), null, 'reversed shape (letter before site number) rejected');
});

/* ------------------------------ parenthetical fallback (DECISION 1) ------------------------------ */

test('parenthetical fallback: CLIENT_SCOPE absent + raw name ending (5197-r-1) → Bar/Restaurant', () => {
    // gk_elmwoodfarm_salus_STA10108964 (sweep): no CLIENT_SCOPE site, letter only in the name tail.
    assert.equal(deriveArea('salus', {}, 'gk_elmwoodfarm_salus_STA10108964 (5197-r-1)'), 'Bar/Restaurant');
});

test('parenthetical fallback: CLIENT_SCOPE absent + raw name ending (1666-f-2) → Accommodation', () => {
    // gk_unknown_salus_STA10108336 (sweep).
    assert.equal(deriveArea('salus', {}, 'gk_unknown_salus_STA10108336 (1666-f-2)'), 'Accommodation');
});

test('parenthetical fallback: a malformed parenthetical (?2?2-?-?) → null', () => {
    // gk_unknown_salus_STA10109030 (sweep): no resolvable letter from either source.
    assert.equal(deriveArea('salus', {}, 'gk_unknown_salus_STA10109030 (?2?2-?-?)'), null);
    assert.equal(deriveArea('salus', {}, 'gk_x_salus (no-paren-here)'), null, 'a non-site parenthetical yields null');
    assert.equal(deriveArea('salus', {}, 'gk_x_salus_STA123'), null, 'no parenthetical at all yields null');
});

test('parenthetical fallback: a present CLIENT_SCOPE letter ALWAYS wins over a differing parenthetical', () => {
    // CLIENT_SCOPE says r (Restaurant); the raw name parenthetical says f — CLIENT_SCOPE must win.
    assert.equal(
        deriveArea('salus', { site: '5694-r-2' }, 'gk_x_salus (1666-f-2)'),
        'Bar/Restaurant',
        'CLIENT_SCOPE r wins over parenthetical f'
    );
});

/* ------------------------------ salus-it500 parenthetical parity ------------------------------ */

test('parenthetical fallback also applies to salus-it500 (shared branch)', () => {
    assert.equal(deriveArea('salus-it500', {}, 'gk-6218-salusit500-3 (6218-r-1)'), 'Bar/Restaurant');
    // Existing salus-it500 behaviour with CLIENT_SCOPE present is unchanged (regression guard).
    assert.equal(deriveArea('salus-it500', { site: '6218-r-1' }), 'Bar/Restaurant');
    assert.equal(deriveArea('salus-it500', {}), null, 'no site and no raw name → null (unchanged)');
});
