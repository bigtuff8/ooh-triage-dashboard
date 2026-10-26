/**
 * OOHDASH-144 §8 — every pub heating answer card says exactly what the approved design table says.
 *
 * Golden test against design §8 ("Card | Headline | Say to the customer | Good to know"), for both the
 * "with button" (controls available) and "without" variants. Bracketed design clauses are filled from
 * the fixture below: next on-time 06:30 tomorrow at 21°C, last report 5 hours ago, switched off by hand until 06:00.
 *
 * CW-1  W1..W9 headline, say and good-to-know match the design, controls available
 * CW-2  W3, W5, W6, W8 "without" variants match the design, controls not available
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

process.env.DATA_MODE = 'fixture';
process.env.TZ = 'Europe/London';

const NOW = Date.parse('2026-10-26T19:00:00Z');

function loadCard() {
    const sandbox = {
        state: { flow: { stage: 2, done: [], data: {} }, workspace: {} },
        $: function() { return { innerHTML: '', focus: function() {} }; },
        esc: function(s) { return String(s); },
        openControl: function() {}, flowStep: function() {}, render: function() {}, startFlow: function() {},
        console
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(readFileSync(new URL('../public/js/flows.js', import.meta.url), 'utf8') + '\n;globalThis.bpOutcomeCard = bpOutcomeCard;', ctx);
    return ctx.bpOutcomeCard;
}

const TT = { everyDay: true, nextOn: { atMs: Date.parse('2026-10-27T06:30:00Z'), timeText: '06:30', dayText: 'tomorrow', tempC: 21 } };
function heating(z1, z2, extra) {
    return Object.assign({
        visible: true, version: 'V2', panelLastSeenMs: NOW - 60000, boilerCalling: false, summerMode: false, nextChange: '06:30',
        zones: [
            Object.assign({ n: 1, zone: 'CHZ1', on: true, fallback: false, forced: null, forcedUntilMs: null, held: false, roomTemp: 19.5, timetable: TT }, z1),
            Object.assign({ n: 2, zone: 'CHZ2', on: false, fallback: false, forced: null, forcedUntilMs: null, held: false, roomTemp: 17.1, timetable: TT }, z2)
        ]
    }, extra || {});
}
function strip(s) {
    return String(s || '').replace(/<[^>]+>/g, ' ')
        .replace('🗣 Say to the customer', '').replace('ℹ Good to know (for you, not the customer)', '')
        .replace(/\s+/g, ' ').trim();
}

const CASES = {
    W1: heating({}, {}, { panelLastSeenMs: NOW - 5 * 3600000 }),
    W2: heating({ on: true }, { on: true }, { boilerCalling: true }),
    W3: heating({}, {}),
    W4: heating({ on: false }, { on: false }, { summerMode: true }),
    W5: heating({}, { forced: 'off', forcedUntilMs: Date.parse('2026-10-27T06:00:00Z') }),
    W6: heating({ on: false }, { on: false }),
    W7: heating({ fallback: true }, {}),
    W8: heating({ on: true }, { on: true }),
    W9: heating({ on: false }, { on: false })
};

const WITH = {
    W1: ["We can't see the pub heating right now",
        "I can't see your heating controls from here at the moment, so I'll log it for our team to check first thing.",
        "The heating controls last reported 5 hours ago. Don't tell the customer whether the heating is on or off."],
    W2: ['The heating controls are asking the boiler for heat',
        "Our controls are asking your boiler for heat right now, so they're doing their job. The problem is most likely the boiler itself or the radiators, so please call your heating engineer. I'll log tonight's call.",
        ''],
    W3: ['Part of the pub heating is off',
        "Part of your heating is switched off at the controls right now. I can turn it on from here for a set time, and then it goes back to its normal timetable, which next comes on at 06:30 tomorrow. I'll log it for our team to look at properly.",
        "If the customer says the cold area is the part that's already heating, it's more likely the boiler or radiators, so advise their heating engineer instead."],
    W4: ['The heating is switched off for the summer',
        "Your heating controls are still on their summer setting, which keeps the heating off. I can't change that from here, but I'll log it so our team can switch it back for you.",
        ''],
    W5: ['Someone has switched the heating off at the controls',
        "Part of your heating has been switched off by hand at the controls until 06:00. I can turn it back on from here for a set time. I'll log it so our team can check why it was switched off.",
        'Someone at the pub or an engineer may have done this on purpose, so check with the customer before turning it back on.'],
    W6: ['The heating is off on its timetable',
        "Your heating is off on its normal timetable right now and is next due on at 06:30 tomorrow. I can turn it on from here for a set time if you need it. I'll log the call.",
        'At 06:30 it heats the pub to 21°C, and only comes on if the room is cooler than that.'],
    W7: ['The heating is running on a simple timer',
        "Your heating is running, but on a simple timer because one of the room temperature sensors isn't working, so it may feel cooler than normal. I'll log it for our team to fix the sensor.",
        ''],
    W8: ['The heating is on',
        "Your heating is on at the controls right now. I can turn it off from here for a set time, and then it goes back to its normal timetable, which next comes on at 06:30 tomorrow. I'll log the call.",
        ''],
    W9: ['The pub heating is already off',
        "Our controls show your pub heating is off right now, so the warmth is coming from somewhere else, perhaps a radiator turned up by hand or another heater. I'll log the call.",
        'Ask whether a portable heater or the rooms upstairs have heating on.']
};

const WITHOUT = {
    W3: ["Part of your heating is switched off at the controls. I can't change that from here, so I'll log it for our team to sort.", WITH.W3[2]],
    W5: ["Part of your heating has been switched off by hand at the controls. I can't change it from here, but I'll log that you need it back on so our team can sort it.", ''],
    W6: ["Your heating is off on its normal timetable right now and is next due on at 06:30 tomorrow. I can't turn it on from here, so I'll log it for our team.", WITH.W6[2]],
    W8: ["Your heating is on at the controls and I can't change it from here tonight. Turning the radiators down will help in the meantime. I'll log it for our team.", '']
};

test('CW-1: W1..W9 match the design table with the controls available', () => {
    const card = loadCard();
    for (const w of Object.keys(WITH)) {
        const c = card(w, CASES[w], NOW, { on: true, off: true }, []);
        assert.equal(strip(c.headline), WITH[w][0], w + ' headline');
        assert.equal(strip(c.sayHtml), WITH[w][1], w + ' say');
        assert.equal(strip(c.gtkHtml), WITH[w][2], w + ' good to know');
    }
});

test('CW-2: the "without" variants match the design table when the controls cannot be changed', () => {
    const card = loadCard();
    for (const w of Object.keys(WITHOUT)) {
        const c = card(w, CASES[w], NOW, { on: false, off: false }, []);
        assert.equal(strip(c.headline), WITH[w][0], w + ' headline');
        assert.equal(strip(c.sayHtml), WITHOUT[w][0], w + ' say (without)');
        assert.equal(strip(c.gtkHtml), WITHOUT[w][1], w + ' good to know (without)');
    }
});
