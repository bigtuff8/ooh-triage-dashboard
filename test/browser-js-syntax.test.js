/**
 * Browser JS syntax guard — v1.5.4 hotfix, extended for OOHDASH-144 (SYN-1).
 *
 * SYN-1: Compiles every public/js/*.js file with vm.Script (the same V8 parser the
 * browser uses for script tags) and fails fast if any file has a syntax error.
 * Catches regressions like the v1.5.3 curly-quote incident that broke flows.js.
 *
 * Curly-quote delimiter check: U+2018 (') and U+2019 (') must not appear as the
 * OUTER delimiters of JS string literals. We detect this by checking that replacing
 * all curly-quote delimiters with straight quotes does NOT change the parse result —
 * i.e., the file already uses straight quotes as delimiters.
 * In practice: any file that contains U+2018 (' left) as a string delimiter will
 * fail to parse (same error as v1.5.3). The vm.Script parse catches this.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import vm from 'node:vm';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsDir = resolve(__dirname, '../public/js');

const files = readdirSync(jsDir).filter(function(f) { return f.endsWith('.js'); });

assert.ok(files.length > 0, 'Expected at least one .js file in public/js');

for (const file of files) {
    test('SYN-1 syntax: public/js/' + file, function() {
        const src = readFileSync(join(jsDir, file), 'utf8');
        // vm.Script compiles the source; throws SyntaxError if invalid (catches curly-quote delimiters).
        assert.doesNotThrow(function() {
            new vm.Script(src, { filename: file });
        }, 'public/js/' + file + ' must parse without syntax errors');

        // OOHDASH-144 SYN-1: U+2018 (left single curly quote) must not appear — it is always
        // a delimiter when present and causes a parse error. Report explicitly so the CI
        // message is clear even if vm.Script doesn't catch a subtle case.
        const leftCurly = src.indexOf('‘');
        assert.equal(leftCurly, -1,
            'public/js/' + file + ' contains U+2018 (left curly quote) at offset ' + leftCurly +
            ' — use straight single quotes as string delimiters (SYN-1)');
    });
}
