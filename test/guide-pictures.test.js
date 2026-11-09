/**
 * G-5: Static checks on public/guides/powerpause-contractor-info.html and its picture files.
 *
 * GUIDE-1  Every <img> in the guide HTML has an alt attribute of 20 or more characters.
 * GUIDE-2  No picture file in public/guides/powerpause/ is over 300 KB.
 * GUIDE-3  The page contains the phone number "023 814 0228" and no other support-looking
 *          phone number pattern (compact 0ddddddddddd or spaced 0ddd ddd dddd).
 *
 * This is a file-system test: no browser, no server, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const guideHtmlPath = resolve(root, 'public/guides/powerpause-contractor-info.html');
const picturesDir = resolve(root, 'public/guides/powerpause');

const html = readFileSync(guideHtmlPath, 'utf8');

/* ── GUIDE-1: every img has an alt of 20+ characters ─────────────────── */

test('GUIDE-1: every <img> in the guide HTML has an alt attribute of at least 20 characters', () => {
    // Match every <img ...> tag and extract its attributes
    const imgRe = /<img\b([^>]*?)(?:\s*\/)?>|\balt="([^"]*)"/gi;
    const imgs = [...html.matchAll(/<img\b([^>]*?)(?:\s*\/)?>|<img\b([^>]*?)>/gi)];

    assert.ok(
        imgs.length >= 12,
        'Expected at least 12 <img> elements (one per guide picture plus the header logo), found ' + imgs.length
    );

    for (const match of imgs) {
        const attrs = match[1] || match[2] || '';
        const fullTag = match[0];
        const altMatch = attrs.match(/\balt="([^"]*)"/i);

        assert.ok(
            altMatch,
            'img tag has no alt attribute: ' + fullTag.slice(0, 160)
        );

        const altText = altMatch[1];
        assert.ok(
            altText.length >= 20,
            'img alt "' + altText + '" is only ' + altText.length +
            ' characters (need at least 20): ' + fullTag.slice(0, 160)
        );
    }
});

/* ── GUIDE-2: no picture file over 300 KB ────────────────────────────── */

test('GUIDE-2: no picture file in public/guides/powerpause/ is over 300 KB', () => {
    const pictureFiles = readdirSync(picturesDir)
        .filter(function(f) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(f); });

    assert.ok(
        pictureFiles.length >= 12,
        'Expected at least 12 picture files in public/guides/powerpause/, found ' + pictureFiles.length
    );

    const MAX_BYTES = 300 * 1024; // 300 KB
    for (const file of pictureFiles) {
        const filePath = join(picturesDir, file);
        const { size } = statSync(filePath);
        assert.ok(
            size <= MAX_BYTES,
            'Picture file ' + file + ' is ' + Math.round(size / 1024) + ' KB, which exceeds the 300 KB limit'
        );
    }
});

/* ── GUIDE-3: correct phone number, no other support number ──────────── */

test('GUIDE-3: guide HTML contains "023 814 0228" and no other support-looking phone number', () => {
    // The known good number must be present
    assert.ok(
        html.includes('023 814 0228'),
        'Guide HTML must contain the support phone number "023 814 0228"'
    );

    // Replace all occurrences of the known number, then check for other patterns
    const withoutKnown = html.replace(/023\s*814\s*0228/g, 'KNOWN_NUMBER');

    // Pattern: compact 11-digit UK number beginning with 0 (no spaces)
    const compactMatch = withoutKnown.match(/\b0\d{10}\b/);
    assert.ok(
        !compactMatch,
        'Found another support-looking phone number (compact): ' + (compactMatch ? compactMatch[0] : '')
    );

    // Pattern: spaced form 0ddd ddd dddd (11 digits with standard UK spacing)
    const spacedMatch = withoutKnown.match(/\b0\d{3}\s\d{3}\s\d{4}\b/);
    assert.ok(
        !spacedMatch,
        'Found another support-looking phone number (spaced ####): ' + (spacedMatch ? spacedMatch[0] : '')
    );

    // Pattern: other spaced forms 0d{2,3} d{3,4} d{4} (alternative UK spacings)
    const altMatch = withoutKnown.match(/\b0\d{2,4}[\s-]\d{3,7}[\s-]\d{3,5}\b/);
    assert.ok(
        !altMatch,
        'Found another support-looking phone number (alternative spacing): ' + (altMatch ? altMatch[0] : '')
    );
});
