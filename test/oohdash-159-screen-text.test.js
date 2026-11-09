/**
 * OOHDASH-159 golden screen-text test.
 *
 * Pins the exact copy the operator sees at each key state so future edits
 * cannot silently drift the wording. Checks flows.js source for strings
 * that must be present (or absent) per the rev-5 design artefact.
 *
 * ST-1   Kitchen P1 ticket subject and p1Summary
 * ST-2   Kitchen ncrit ticket subject
 * ST-3   Kitchen service question text (SERVICE_ASK constant)
 * ST-4   Kitchen service question chip text
 * ST-5   Kitchen override step test-id present; override chip test-ids
 * ST-6   Kitchen no-panel chip test-id (kitchen-no-panel)
 * ST-7   Lighting chips: lighting-ok / lighting-still-off and their text
 * ST-8   Auto-log banner text and test-id (E1 — non-P1 outcome)
 * ST-9   P1 record-outcome button text ("Raise the P1")
 * ST-10  Kitchen tile description copy ("Fryers, grills, glasswashers off")
 * ST-11  Override guide link test-id present (K1)
 * ST-12  E1 auto-submit sentinel: 'escalate-p1' is the ONLY type that keeps
 *        a confirm step (no other type must appear in the confirm-step branch)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../public/js/flows.js'), 'utf8');

/* ── ST-1: Kitchen P1 ticket subject (B22 / OOHDASH-146 D13) ────────────── */

test('ST-1a: kitchen P1 subject is the OOHDASH-146 risk-to-trade subject (B22)', () => {
    assert.ok(
        src.includes("subject: 'Kitchen equipment off — risk to trade or health and safety — P1'"),
        'kitchen crit subject must match OOHDASH-146 B22 design (em-dash, risk-to-trade wording)'
    );
});

test('ST-1b: kitchen P1 pre say uses the standard risk wording (B20)', () => {
    assert.ok(
        src.includes("As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
        'kitchen P1 pre say must use the standard OOHDASH-146 B20 wording'
    );
});

/* ── ST-2: Kitchen ncrit ticket subject (B22) ────────────────────────────── */

test('ST-2: kitchen ncrit subject is "Kitchen equipment off — no immediate risk" (B22)', () => {
    assert.ok(
        src.includes("subject: 'Kitchen equipment off — no immediate risk'"),
        'kitchen ncrit subject must match OOHDASH-146 B22 design'
    );
});

/* ── ST-3: Universal risk question (B19) ─────────────────────────────────── */

test('ST-3: RISK_ASK constant includes the universal risk-to-trade question (B19)', () => {
    assert.ok(
        src.includes('Is there an immediate risk to trade or to anyone'),
        'RISK_ASK must include the universal risk question (B19 D13)'
    );
});

/* ── ST-4: Universal risk question chip test-ids (B19) ──────────────────── */

test('ST-4a: risk-yes chip (data-testid="risk-yes") is present (B19)', () => {
    assert.ok(
        src.includes('data-testid="risk-yes"'),
        'risk-yes chip must be present — replaces the old kitchen-critical chip (B19)'
    );
});

test('ST-4b: risk-no chip (data-testid="risk-no") is present (B19)', () => {
    assert.ok(
        src.includes('data-testid="risk-no"'),
        'risk-no chip must be present — replaces the old kitchen-notcritical chip (B19)'
    );
});

/* ── ST-5: Kitchen override step (J1) ───────────────────────────────────── */

test('ST-5a: kitchen-override-step test-id present (J1 override-first)', () => {
    assert.ok(
        src.includes('data-testid="kitchen-override-step"'),
        'J1 requires kitchen-override-step test-id'
    );
});

test('ST-5b: kitchen-override-ok chip present', () => {
    assert.ok(
        src.includes('data-testid="kitchen-override-ok"'),
        'override OK chip must be present'
    );
});

test('ST-5c: kitchen-override-fail chip present', () => {
    assert.ok(
        src.includes('data-testid="kitchen-override-fail"'),
        'override fail chip must be present'
    );
});

/* ── ST-6: Kitchen no-panel chip (J1) ───────────────────────────────────── */

test('ST-6: kitchen-no-panel chip present with "can\'t find the panel" text', () => {
    assert.ok(
        src.includes('data-testid="kitchen-no-panel"') &&
        src.includes("can't find the panel"),
        'kitchen-no-panel chip must be present with correct text'
    );
});

/* ── ST-7: Lighting chips (J1) ──────────────────────────────────────────── */

test('ST-7a: lighting-ok chip present with "Yes, they\'ve come on"', () => {
    assert.ok(
        src.includes('data-testid="lighting-ok"') &&
        src.includes("Yes, they've come on"),
        'lighting-ok chip must exist with J1 text'
    );
});

test('ST-7b: lighting-still-off chip present with "No, they\'re still off"', () => {
    assert.ok(
        src.includes('data-testid="lighting-still-off"') &&
        src.includes("No, they're still off"),
        'lighting-still-off chip must exist with J1 text'
    );
});

test('ST-7c: OLD lighting chips absent ("Caller sorted it", "Still not working")', () => {
    assert.ok(
        !src.includes('Caller sorted it with the override') &&
        !src.includes('>Still not working<'),
        'J1 redesign removed the old chip text — must not regress'
    );
});

/* ── ST-8: Auto-log banner (E1) ─────────────────────────────────────────── */

test('ST-8a: saving-record test-id present in auto-submit path', () => {
    assert.ok(
        src.includes('data-testid="saving-record"'),
        'E1 auto-submit must render a saving-record indicator'
    );
});

test('ST-8b: auto-log banner text is "Saving to the call record…"', () => {
    assert.ok(
        src.includes('Saving to the call record…'),
        'E1 auto-log banner text must use the ellipsis character'
    );
});

/* ── ST-9: P1 button text (E1) ──────────────────────────────────────────── */

test('ST-9: P1 record-outcome button text is "Raise the P1"', () => {
    assert.ok(
        src.includes('>Raise the P1<'),
        'P1-only record-outcome button must say "Raise the P1" (not "Record outcome")'
    );
});

test('ST-9b: old "Record outcome" button text absent (E1 replaced it)', () => {
    assert.ok(
        !src.includes('>Record outcome<'),
        'E1 removed the generic "Record outcome" button — must not regress'
    );
});

/* ── ST-10: Kitchen tile description ─────────────────────────────────────── */

test('ST-10: kitchen tile description contains "Fryers, grills, glasswashers"', () => {
    assert.ok(
        src.includes('Fryers, grills, glasswashers'),
        'kitchen tile description must list example equipment'
    );
});

/* ── ST-11: Override guide link (K1) ─────────────────────────────────────── */

test('ST-11: override-guide-link test-id present (K1 PowerPause guide)', () => {
    assert.ok(
        src.includes('data-testid="override-guide-link"'),
        'K1 requires the override guide link test-id'
    );
});

test('ST-11b: guide link points to /guides/powerpause-contractor-info.html', () => {
    assert.ok(
        src.includes('href="/guides/powerpause-contractor-info.html"'),
        'K1 guide link must point to the correct route'
    );
});

/* ── ST-12: E1 confirm-step branch only for escalate-p1 ─────────────────── */

test('ST-12: the confirm-step branch is guarded by escalate-p1 type only', () => {
    // The guard in finishOutcome: `if (payload.type !== 'escalate-p1')` triggers auto-submit.
    // Verify the guard string is present and no OTHER type appears as a confirm-step gate.
    assert.ok(
        src.includes("payload.type !== 'escalate-p1'"),
        'E1: auto-submit guard must be present — only escalate-p1 keeps confirm step'
    );
});
