/**
 * OOHDASH-164 Stage 1 — Q9 Cosmos querySql unit tests (design §4).
 *
 * Proves:
 *   Q1  FileCollection.querySql matches a siteNo stored as a string (@s).
 *   Q2  FileCollection.querySql matches a siteNo stored as a number (@n).
 *   Q3  Docs with the wrong siteNo are excluded.
 *   Q4  Inactive docs are excluded (status filter).
 *   Q5  deviceType filter works.
 *
 * Uses DATA_MODE=file so we get the FileCollection implementation.
 * Temporarily writes fixture docs to verify querySql in-process evaluation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Use a temp dir for the file store so tests don't touch real fixtures
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ooh-qs-test-'));
process.env.DATA_MODE = 'file';
process.env.OOH_STORE_DIR = tmpDir;
process.env.THINGSBOARD_URL = 'http://tb.test';
process.env.THINGSBOARD_READ_USERNAME = 'r@test';
process.env.THINGSBOARD_READ_PASSWORD = 'rp';
process.env.THINGSBOARD_WRITE_USERNAME = 'w@test';
process.env.THINGSBOARD_WRITE_PASSWORD = 'wp';
process.env.COSMOS_URL = 'https://cosmos.test/';
process.env.COSMOS_KEY = 'dGVzdGtleQ==';
process.env.COSMOS_DATABASE = 'testdb';

const { collection } = await import('../services/store.js');
// 'OohOverrides' is the real collection for boost holds — test isolation via tmp OOH_STORE_DIR
const col = await collection('OohOverrides');

// Seed some docs
async function seed() {
    // Doc with siteNo as string
    await col.upsert({
        id: 'hold-string',
        storePartition: 'ooh',
        siteNo: '6832',           // string
        status: 'active',
        deviceType: 'boiler-panel',
        label: 'string-siteNo'
    });
    // Doc with siteNo as number
    await col.upsert({
        id: 'hold-number',
        storePartition: 'ooh',
        siteNo: 6832,             // number
        status: 'active',
        deviceType: 'boiler-panel',
        label: 'number-siteNo'
    });
    // Wrong siteNo
    await col.upsert({
        id: 'hold-other',
        storePartition: 'ooh',
        siteNo: '9999',
        status: 'active',
        deviceType: 'boiler-panel',
        label: 'other-site'
    });
    // Inactive doc for 6832
    await col.upsert({
        id: 'hold-inactive',
        storePartition: 'ooh',
        siteNo: '6832',
        status: 'inactive',
        deviceType: 'boiler-panel',
        label: 'inactive'
    });
    // Wrong deviceType
    await col.upsert({
        id: 'hold-wrongtype',
        storePartition: 'ooh',
        siteNo: '6832',
        status: 'active',
        deviceType: 'salusit700',
        label: 'wrong-type'
    });
}

await seed();

// Use the same SQL pattern as overrides.js (all filters via parameters, not literals)
const SQL = 'SELECT * FROM c WHERE c.storePartition = @p AND c.status = @status AND c.deviceType = @deviceType AND (c.siteNo = @s OR c.siteNo = @n)';
const params = (siteNo) => [
    { name: '@p',          value: 'ooh' },
    { name: '@status',     value: 'active' },
    { name: '@deviceType', value: 'boiler-panel' },
    { name: '@s',          value: String(siteNo) },
    { name: '@n',          value: Number(siteNo) }
];

test('Q1: matches siteNo stored as string', async () => {
    const rows = await col.querySql({ query: SQL, parameters: params('6832') });
    const labels = rows.map(r => r.label);
    assert.ok(labels.includes('string-siteNo'), 'String siteNo doc should match');
});

test('Q2: matches siteNo stored as number', async () => {
    const rows = await col.querySql({ query: SQL, parameters: params('6832') });
    const labels = rows.map(r => r.label);
    assert.ok(labels.includes('number-siteNo'), 'Number siteNo doc should match');
});

test('Q3: excludes wrong siteNo', async () => {
    const rows = await col.querySql({ query: SQL, parameters: params('6832') });
    const labels = rows.map(r => r.label);
    assert.ok(!labels.includes('other-site'), 'Wrong siteNo must be excluded');
});

test('Q4: excludes inactive docs', async () => {
    const rows = await col.querySql({ query: SQL, parameters: params('6832') });
    const labels = rows.map(r => r.label);
    assert.ok(!labels.includes('inactive'), 'Inactive doc must be excluded');
});

test('Q5: excludes wrong deviceType', async () => {
    const rows = await col.querySql({ query: SQL, parameters: params('6832') });
    const labels = rows.map(r => r.label);
    assert.ok(!labels.includes('wrong-type'), 'Wrong deviceType must be excluded');
});

test('Q6: returns exactly the matching docs (string + number, active, right type)', async () => {
    const rows = await col.querySql({ query: SQL, parameters: params('6832') });
    assert.equal(rows.length, 2, 'Should return exactly the string and number siteNo docs');
});

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });
