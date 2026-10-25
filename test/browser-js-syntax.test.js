/**
 * Browser JS syntax guard — v1.5.4 hotfix.
 *
 * Compiles every public/js/*.js file with vm.Script (the same V8 parser the
 * browser uses for script tags) and fails fast if any file has a syntax error.
 * Catches regressions like the v1.5.3 curly-quote incident that broke flows.js.
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
    test('syntax: public/js/' + file, function() {
        const src = readFileSync(join(jsDir, file), 'utf8');
        // vm.Script compiles the source; throws SyntaxError if invalid.
        assert.doesNotThrow(function() {
            new vm.Script(src, { filename: file });
        }, 'public/js/' + file + ' must parse without syntax errors');
    });
}
