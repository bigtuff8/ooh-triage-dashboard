/**
 * C2 — confirm-token single-use (consume-before-write) unit tests.
 *
 * Proves the confirm token authorises EXACTLY ONE dispatch: a replay, a retry-after-success,
 * and two interleaved concurrent dispatches all resolve to a single tb.writeSharedAttribute
 * call, with the surplus dispatch rejected 409 (resolution.consumeConfirmation deletes the
 * token synchronously on the matched path). Also proves a wrong-owner/wrong-site attempt is
 * denied and does NOT spend the legitimate owner's token.
 *
 * Drives the real control.dispatch() through the fixture seam (DATA_MODE=fixture). The device
 * write is replaced with a counting stub via mock.module so we can COUNT writes with no live
 * portal call. Requires `node --test --experimental-test-module-mocks` (see package.json
 * test:unit). Runs under node's built-in test runner.
 */
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Fixture mode + an isolated store dir BEFORE importing config-backed modules.
process.env.DATA_MODE = 'fixture';
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-c2-'));
// Enable writes for these dispatch tests: OOHDASH-12 made the default fail-closed
// (unset WRITES_DISABLED => writes disabled), so an unset flag would 423 every dispatch.
// The single-use property under test is independent of the deploy-time write lock.
process.env.WRITES_DISABLED = 'false';

// Replace the device-write with a counting stub BEFORE control.js imports tb-client, so
// control.dispatch() calls our stub. Fixture-mode readControlState/tbStatus are preserved so
// the sync-poll loop control starts stays inert and harmless in the test.
let writeCount = 0;
mock.module('../services/tb-client.js', {
    namedExports: {
        writeSharedAttribute: async () => { writeCount += 1; },
        // Edge-aware confirm plane (D3): no current desired ⇒ classifyPreDispatch → 'dispatch', so
        // the single-use property under test is exercised on the real write path. Registration gate
        // (D9) passes. readControlState carries syncTs (timeseries shape) but stays pending here.
        readDesiredState: async () => ({ desired: undefined, desiredTs: null }),
        readControlState: async () => ({ sync: 'pending', syncTs: null, reported: null, reportedTs: null }),
        hasPublishedState: async () => true,
        tbStatus: () => ({ mode: 'fixture', read: true, write: true })
    }
});

const resolution = await import('../services/resolution.js');
const control = await import('../services/control.js');

// A valid fixture target: site 6832, salus-it500 heating device at setpoint 18.
const SITE_NO = '6832';
const DEVICE_ID = 'IT500-BAR-6832';
const OPERATOR = { id: 'op-1', name: 'Handler One', email: 'h1@example.com' };
const SETPOINT_CMD = { command: 'setpoint', value: 19, direction: 'up' };

/** Confirms the site and returns a fresh single-use token. */
async function freshToken(operator = OPERATOR) {
    const { token } = await resolution.confirmSite(SITE_NO, operator);
    return token;
}

/** Builds a dispatch payload for the standard fixture target. */
function payload(token, operator = OPERATOR) {
    return { operator, confirmToken: token, siteNo: SITE_NO, deviceId: DEVICE_ID, ...SETPOINT_CMD };
}

/** Asserts a rejected dispatch carries the expected HTTP status. */
async function expectStatus(promise, status) {
    await assert.rejects(promise, err => {
        assert.equal(err.status, status, `expected status ${status}, got ${err.status}: ${err.message}`);
        return true;
    });
}

beforeEach(() => {
    writeCount = 0;
});

test('happy path — a single dispatch with a fresh token writes exactly once and returns the pending action', async () => {
    const token = await freshToken();
    const action = await control.dispatch(payload(token));

    assert.equal(writeCount, 1, 'exactly one write on the happy path');
    assert.equal(action.state, 'pending', 'pending action returned unchanged from today');
    assert.equal(action.siteNo, SITE_NO);
    assert.equal(action.deviceId, DEVICE_ID);
    assert.ok(action.actionId, 'an actionId is minted');
});

test('replay rejected — a second dispatch with the used token is 409 and does NOT write again', async () => {
    const token = await freshToken();

    await control.dispatch(payload(token));
    assert.equal(writeCount, 1, 'first dispatch writes once');

    await expectStatus(control.dispatch(payload(token)), 409);
    assert.equal(writeCount, 1, 'the replay must not trigger a second write');
});

test('concurrency — two interleaved same-token dispatches yield exactly one write, one 409', async () => {
    const token = await freshToken();

    // Fire both without awaiting the first — they interleave on the event loop.
    const results = await Promise.allSettled([
        control.dispatch(payload(token)),
        control.dispatch(payload(token))
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one dispatch succeeds');
    assert.equal(rejected.length, 1, 'exactly one dispatch is rejected');
    assert.equal(rejected[0].reason.status, 409, 'the loser is rejected 409');
    assert.equal(writeCount, 1, 'writeSharedAttribute called exactly once');
});

test('retry-after-success denied — first write succeeds, response "lost", retry same token is 409 with no second write', async () => {
    const token = await freshToken();

    // First dispatch: the device write succeeds but imagine the HTTP response is lost.
    await control.dispatch(payload(token));
    assert.equal(writeCount, 1);

    // Client retries with the same token — must be denied (token spent on admission).
    await expectStatus(control.dispatch(payload(token)), 409);
    assert.equal(writeCount, 1, 'no second write on retry');
});

test('wrong-owner — a different operator cannot use the token, and it does NOT spend the legitimate owner\'s token', async () => {
    const token = await freshToken(OPERATOR);
    const intruder = { id: 'op-2', name: 'Handler Two', email: 'h2@example.com' };

    // Intruder attempt: denied and MUST NOT consume the owner's token.
    await expectStatus(control.dispatch(payload(token, intruder)), 409);
    assert.equal(writeCount, 0, 'no write on the mismatched attempt');

    // Legitimate owner can still use their token exactly once.
    const action = await control.dispatch(payload(token, OPERATOR));
    assert.equal(writeCount, 1, 'owner dispatch still writes once — token was not spent by the intruder');
    assert.equal(action.state, 'pending');
});

test('wrong-site — a token used against a mismatched siteNo is denied and does not spend the owner token', async () => {
    const token = await freshToken(OPERATOR);

    // Same operator/token but a different (wrong) site — the stored siteNo will not match.
    await expectStatus(
        control.dispatch({ operator: OPERATOR, confirmToken: token, siteNo: '6851', deviceId: 'IT500-BAR-6851', ...SETPOINT_CMD }),
        409
    );
    assert.equal(writeCount, 0, 'no write on the wrong-site attempt');

    // Owner can still use the token against the correct site exactly once.
    await control.dispatch(payload(token, OPERATOR));
    assert.equal(writeCount, 1, 'owner dispatch still writes once — token not spent by the wrong-site attempt');
});

test('consumeConfirmation directly — matched consume returns true once then false; isConfirmed remains a non-consuming read', async () => {
    const token = await freshToken(OPERATOR);

    // isConfirmed is a pure read — repeatable, never consumes.
    assert.equal(resolution.isConfirmed(token, SITE_NO, OPERATOR.id), true);
    assert.equal(resolution.isConfirmed(token, SITE_NO, OPERATOR.id), true, 'isConfirmed does not consume');

    // First consume matches and deletes; the second finds nothing.
    assert.equal(resolution.consumeConfirmation(token, SITE_NO, OPERATOR.id), true);
    assert.equal(resolution.consumeConfirmation(token, SITE_NO, OPERATOR.id), false, 'token consumed exactly once');
    assert.equal(resolution.isConfirmed(token, SITE_NO, OPERATOR.id), false, 'read agrees the token is gone');
});
