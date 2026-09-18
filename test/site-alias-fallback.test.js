/**
 * OOHDASH-79 regression — the site-alias overlay is OPTIONAL, so a MISSING or UNREADABLE
 * data/site-aliases.json must degrade gracefully to no-overlay and NEVER abort the site query.
 *
 * Before the fix, tb-device.loadAliases() did an unguarded JSON.parse(readFileSync(...)); on live the
 * file was absent from the container image (Dockerfile only copied data/fixtures), so EVERY site
 * search threw `ENOENT: ... /app/data/site-aliases.json` and all site search was broken. This test
 * pins the robustness half of the fix: with fs.readFileSync throwing ENOENT for the alias file,
 * loadAliases() returns {} (no throw) and a site query still resolves.
 *
 * Technique mirrors the suite's established mock.module + dynamic-import pattern (see
 * site-identity.test.js): fs is mocked so the alias read throws, tb-client is faked at the read
 * session, and tb-device.js is imported AFTER the mocks so its lazy loadAliases() hits the throwing
 * readFileSync. Each *.test.js file runs in its own process (node --test), so this mock does not leak
 * into the other suites. Requires `node --test --experimental-test-module-mocks`.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'fs';

// Fake fs: throw ENOENT for the alias overlay (as the live container did); delegate everything else
// (config/fixture reads, etc.) to the real fs so the rest of the module loads normally.
mock.module('fs', {
    namedExports: {
        ...realFs,
        readFileSync: (path, ...rest) => {
            if (String(path).includes('site-aliases.json')) {
                const err = new Error("ENOENT: no such file or directory, open 'site-aliases.json'");
                err.code = 'ENOENT';
                throw err;
            }
            return realFs.readFileSync(path, ...rest);
        }
    }
});

process.env.DATA_MODE = 'fixture';

const tb = await import('../services/tb-device.js');

test('siteQueryTokens does NOT throw when the alias overlay is missing/unreadable (OOHDASH-79)', () => {
    // A site with NO alias entry: tokens are just the bare siteNo — must resolve with no overlay.
    assert.doesNotThrow(() => tb.siteQueryTokens('6261'));
    const { brand, tokens } = tb.siteQueryTokens('6261');
    assert.equal(brand, 'gk');
    assert.deepEqual(tokens, ['6261'], 'no overlay ⇒ just the bare siteNo token');
});

test('a would-be aliased site degrades to the bare siteNo when the overlay is absent', () => {
    // 1110 DOES carry an alias in the real file (1110meridian); with the file unreadable the query
    // must still resolve — just without the extra token — rather than throwing.
    assert.doesNotThrow(() => tb.siteQueryTokens('1110'));
    const { tokens } = tb.siteQueryTokens('1110');
    assert.deepEqual(tokens, ['1110'], 'overlay unavailable ⇒ falls back to no extra tokens');
});

test('getSitesByNumber (fixture mode) still resolves with the alias overlay absent', async () => {
    tb._resetCache();
    // Must not throw the ENOENT that broke live search; returns the fixture site(s) for the number.
    const sites = await tb.getSitesByNumber('6261');
    assert.ok(Array.isArray(sites), 'a resolved (possibly empty) site array, never an ENOENT throw');
});
