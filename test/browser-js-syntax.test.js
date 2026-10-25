/**
 * Browser JS syntax guard — v1.5.4 hotfix, extended for OOHDASH-144 (SYN-1).
 *
 * SYN-1: Compiles every public/js/*.js file with vm.Script (the same V8 parser the
 * browser uses for script tags) and fails fast if any file has a syntax error.
 * Catches regressions like the v1.5.3 curly-quote incident that broke flows.js.
 *
 * Curly-quote delimiter check: U+2018 (left single curly quote) and U+201C/U+201D
 * (left/right double curly quotes) must not appear in JS files.
 * Single curly quotes break JS string parsing (v1.5.3 incident).
 * Double curly quotes are not valid HTML attribute delimiters and break data-testid
 * lookups (OOHDASH-144 incident: all HTML attrs used curly double quotes).
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

        // SYN-1: U+2018 (left single curly quote) must not appear.
        const leftCurly = src.indexOf('‘');
        assert.equal(leftCurly, -1,
            'public/js/' + file + ' contains U+2018 (left curly single quote) at offset ' + leftCurly +
            ' -- use straight single quotes as string delimiters (SYN-1)');

        // SYN-1 extended (OOHDASH-144): curly DOUBLE quotes must not appear.
        const leftDQ = src.indexOf('“');
        assert.equal(leftDQ, -1,
            'public/js/' + file + ' contains U+201C (left curly double quote) at offset ' + leftDQ +
            ' -- use straight double quotes in HTML attribute strings (SYN-1)');
        const rightDQ = src.indexOf('”');
        assert.equal(rightDQ, -1,
            'public/js/' + file + ' contains U+201D (right curly double quote) at offset ' + rightDQ +
            ' -- use straight double quotes in HTML attribute strings (SYN-1)');
    });
}
