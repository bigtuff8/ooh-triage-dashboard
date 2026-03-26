/**
 * OOH Triage Flow Definitions — v2 (Flow Amendments)
 *
 * Data-driven state machine for out-of-hours call handler triage.
 * Each flow is a map of state IDs → state objects.
 *
 * State types:
 *   question     — Agent picks an option → transitions to next state
 *   device_check — Calls an API, branches on result
 *   action       — Confirms + executes a write, registers pocket change
 *   info         — Display-only (script, scope info, visual aids)
 *   escalation   — Triggers escalation workflow
 *   resolution   — End state (posts triage summary to Zendesk ticket)
 *   input        — Free-text input from the agent (captures reason, details)
 *   referral     — Advises caller to contact external party (GK Repairs etc.)
 *
 * Design principles (OOH_PROPOSED_FLOW_CHANGES.md):
 *   1. No hard "no" — if customer insists, action it, capture reason, IoT reviews next day
 *   2. Soft pushback OK — "Are you sure?" but never refuse
 *   3. All escalations route to IoT Support — agent never decides who it goes to
 *   4. GK Repairs is advisory referral only — agent advises caller to ALSO contact them
 *   5. Visual aids where possible — images of PowerPause stickers, Salus thermostats etc.
 *   6. Structured handoff — every escalation includes T1 checks, findings, ruled out
 */

// ============================================================================
// Shared constants
// ============================================================================

const GK_REPAIRS_PHONE = '0345 603 4566';
const GK_REPAIRS_EMAIL = 'repairsadmin@greeneking.co.uk';
const GK_REPAIRS_INFO = `GK Repairs: ${GK_REPAIRS_PHONE} / ${GK_REPAIRS_EMAIL}`;
const STANDARD_ACCOM_SETPOINT = 22; // °C — standard accommodation template

const TRIAGE_FLOWS = {

    // ========================================================================
    // KITCHEN EQUIPMENT (Change 1 — kitchenEquip)
    // T1: PowerPause sticker check → interlock panel → MCB check
    // T2: Tuya device status, schedule check, remote override
    // ========================================================================
    'kitchen-equip': {
        id: 'kitchen-equip',
        name: 'Kitchen Equipment Not Working',
        description: 'Kitchen equipment issue — PowerPause check, interlock panel, then system checks',
        service: 'tuya',
        icon: 'restaurant',
        entryType: 'hardware',
        states: {
            start: {
                type: 'info',
                title: 'Kitchen Equipment Issue',
                message: 'Let\'s work through this step by step with the caller. We\'ll start with some checks they can do at the appliance.',
                next: 't1-powerpause-check'
            },
            // --- T1: Phone-guided steps ---
            't1-powerpause-check': {
                type: 'question',
                title: 'PowerPause Sticker Check',
                message: '**Ask the caller:** "Is the appliance labelled with a blue PowerPause sticker? It will have a Lighthouse / Greene King logo and a QR code."',
                // TODO: image: '/images/powerpause-sticker.png'
                options: [
                    { label: 'YES — has a PowerPause sticker', next: 't1-interlock-check' },
                    { label: 'NO — no sticker', next: 't1-not-lighthouse' },
                    { label: 'UNSURE — can\'t tell', next: 't1-interlock-check' }
                ]
            },
            't1-not-lighthouse': {
                type: 'referral',
                title: 'Not Controlled by Lighthouse',
                message: `This appliance isn't controlled by the Lighthouse system. Advise the caller to contact GK Repairs for appliance faults.\n\n**${GK_REPAIRS_INFO}**`,
                summary: 'OOH: Kitchen equipment issue — appliance has no PowerPause sticker, not Lighthouse-controlled. Caller advised to contact GK Repairs.',
                referralTo: 'GK Repairs',
                referralPhone: GK_REPAIRS_PHONE
            },
            't1-interlock-check': {
                type: 'question',
                title: 'Interlock Panel Check',
                message: '**Ask the caller:** "Can you see a small panel near the appliance with a green light and a green button? This is the interlock panel."',
                // TODO: image: '/images/interlock-panel.png' (MISSING — request from IoT team)
                options: [
                    { label: 'Green light is ON', next: 't1-press-button' },
                    { label: 'Green light is OFF', next: 't1-mcb-check' },
                    { label: 'No panel visible / caller unsure', next: 't2-check-switch' }
                ]
            },
            't1-press-button': {
                type: 'question',
                title: 'Press the Green Button',
                message: '**Ask the caller:** "Press the green button on the interlock panel. Did you hear a click? Did the appliance come on?"',
                options: [
                    { label: 'Click + appliance came on', next: 't1-resolved-button' },
                    { label: 'Click but appliance still off', next: 't1-appliance-fault' },
                    { label: 'No click at all', next: 't1-contactor-fault' }
                ]
            },
            't1-resolved-button': {
                type: 'resolution',
                title: 'Resolved — Interlock Reset',
                message: 'The interlock panel has been reset and the appliance is working. The IoT team will review this event.',
                summary: 'OOH: Kitchen equipment at {siteName} — interlock panel reset resolved the issue. Green button pressed, appliance powered on.'
            },
            't1-appliance-fault': {
                type: 'referral',
                title: 'Appliance Fault (Power Reaching Equipment)',
                message: `The power is reaching the appliance via the interlock panel, but the appliance itself isn't responding. This is likely an appliance fault rather than a Lighthouse issue.\n\nAdvise the caller to contact GK Repairs.\n\n**${GK_REPAIRS_INFO}**`,
                summary: 'OOH: Kitchen equipment at {siteName} — interlock green light on, button clicked, but appliance not responding. Appliance fault. Caller referred to GK Repairs.',
                referralTo: 'GK Repairs',
                referralPhone: GK_REPAIRS_PHONE
            },
            't1-contactor-fault': {
                type: 'escalation',
                title: 'Contactor Not Engaging',
                message: 'The contactor isn\'t engaging when the button is pressed. This indicates a PowerPause hardware or wiring fault.',
                severity: 'high',
                summary: 'OOH: Kitchen equipment at {siteName} — interlock green light on but contactor not engaging (no click on button press). PowerPause hardware/wiring fault.',
                suggestedDiagnostic: 'R5 — PowerPause interlock fault'
            },
            't1-mcb-check': {
                type: 'question',
                title: 'MCB / Fuse Check',
                message: '**Ask the caller:** "The green light is off. Can you check the MCB (circuit breaker) for that appliance on the distribution board? Is it tripped or in the ON position?"',
                options: [
                    { label: 'MCB was tripped — they\'ve reset it', next: 't1-mcb-reset-result' },
                    { label: 'MCB is ON but green light still off', next: 't1-powerpause-hw-fault' },
                    { label: 'Caller can\'t locate the distribution board', next: 't2-check-switch' }
                ]
            },
            't1-mcb-reset-result': {
                type: 'question',
                title: 'MCB Reset — Check Green Light',
                message: '**Ask the caller:** "Now that the MCB is reset, has the green light on the interlock panel come on?"',
                options: [
                    { label: 'Yes — green light is on now', next: 't1-interlock-check' },
                    { label: 'No — still no green light', next: 't1-powerpause-hw-fault' }
                ]
            },
            't1-powerpause-hw-fault': {
                type: 'escalation',
                title: 'PowerPause Hardware Fault',
                message: 'Green light is off despite MCB being on. This indicates a PowerPause hardware fault.',
                severity: 'high',
                summary: 'OOH: Kitchen equipment at {siteName} — interlock green light off, MCB confirmed on. PowerPause hardware fault.',
                suggestedDiagnostic: 'R5 — PowerPause interlock fault'
            },
            // --- T2: System checks (existing flow, adapted) ---
            't2-check-switch': {
                type: 'device_check',
                title: 'Checking Tuya Switch Status',
                api: { method: 'GET', url: '/api/tuya/devices/{deviceId}/status' },
                dataCard: {
                    title: 'Switch Status',
                    fields: ['switchState', 'lastUpdate']
                },
                branches: [
                    { condition: 'switchState === false', next: 't2-offer-switch-on' },
                    { condition: 'switchState === true', next: 't2-switch-already-on' }
                ],
                fallback: 'escalate-no-data'
            },
            't2-offer-switch-on': {
                type: 'question',
                title: 'Switch is OFF',
                message: 'The smart switch controlling this appliance is currently OFF. Would you like to turn it on remotely?',
                options: [
                    { label: 'Yes — turn on remotely', next: 't2-confirm-switch-on' },
                    { label: 'Escalate to IoT team', next: 'escalate-iot' }
                ]
            },
            't2-confirm-switch-on': {
                type: 'action',
                title: 'Confirm Switch On',
                message: 'This will remotely turn on the smart switch. Please confirm the customer is aware.',
                confirmLabel: 'Turn On',
                api: {
                    method: 'POST',
                    url: '/api/tuya/devices/{deviceId}/switch',
                    body: { commands: [{ code: 'switch_1', value: true }] }
                },
                next: 't2-switch-turned-on'
            },
            't2-switch-turned-on': {
                type: 'resolution',
                title: 'Switch Turned On',
                message: 'The smart switch has been turned on remotely. Ask the customer to confirm the equipment is powering up (may take 5-10 minutes).',
                summary: 'OOH: Kitchen equipment at {siteName} — Tuya switch was OFF, remotely turned ON. Customer to confirm.'
            },
            't2-switch-already-on': {
                type: 'question',
                title: 'Switch Already ON',
                message: 'The smart switch is already ON but the equipment isn\'t working. This may be a physical equipment fault or schedule issue.',
                options: [
                    { label: 'Check the schedule', next: 't2-check-schedule' },
                    { label: 'Escalate — likely equipment fault', next: 'escalate-equip-fault' }
                ]
            },
            't2-check-schedule': {
                type: 'device_check',
                title: 'Checking Schedule',
                api: { method: 'GET', url: '/api/tuya/devices/{deviceId}/schedules' },
                dataCard: {
                    title: 'Device Schedule',
                    fields: ['scheduleName', 'time', 'action', 'enabled']
                },
                onSuccess: 't2-schedule-review',
                fallback: 'escalate-no-data'
            },
            't2-schedule-review': {
                type: 'question',
                title: 'Schedule Review',
                message: 'Review the schedule above. Is a schedule turning this equipment off at the wrong time?',
                options: [
                    { label: 'Yes — schedule conflict', next: 'escalate-schedule-fix' },
                    { label: 'No — schedule looks fine', next: 'escalate-equip-fault' }
                ]
            },
            'escalate-equip-fault': {
                type: 'escalation',
                title: 'Equipment Fault',
                message: `Smart switch is ON but equipment not responding. Likely a physical fault. Advise caller to also contact GK Repairs.\n\n**${GK_REPAIRS_INFO}**`,
                severity: 'medium',
                summary: 'OOH: Kitchen equipment at {siteName} — Tuya switch ON but equipment not responding. Physical fault suspected. Caller advised to also contact GK Repairs.'
            },
            'escalate-schedule-fix': {
                type: 'escalation',
                title: 'Schedule Adjustment Needed',
                message: 'A schedule appears to be turning off equipment at an incorrect time. IoT team to review and adjust.',
                severity: 'medium',
                summary: 'OOH: Kitchen equipment at {siteName} — schedule conflict causing unexpected shutdowns. IoT team to review.',
                suggestedDiagnostic: 'R6 — Schedule review'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Retrieve Data',
                message: 'Could not connect to the IoT platform. Escalating to IoT team.',
                severity: 'high'
            },
            'escalate-iot': {
                type: 'escalation',
                title: 'Escalated to IoT Team',
                message: 'This issue has been escalated to the IoT support team for investigation.',
                severity: 'medium'
            }
        }
    },

    // ========================================================================
    // HEATING TOO COLD (Change 2 — tooCold)
    // T1: Pub/accommodation branch, soft pushback, Salus visual aids
    // T2: Live zone data, boost with reason capture
    // ========================================================================
    'heating-too-cold': {
        id: 'heating-too-cold',
        name: 'Heating Too Cold',
        description: 'Customer reports heating too cold — pub/accommodation routing, soft pushback, boost',
        service: 'salus',
        icon: 'thermostat',
        entryType: 'hardware',
        states: {
            start: {
                type: 'question',
                title: 'Heating Too Cold',
                message: '**Ask the caller:** "Is this for a pub area or accommodation?"',
                options: [
                    { label: 'Pub area', next: 't2-pub-zone-check' },
                    { label: 'Accommodation', next: 't1-accom-thermostat' }
                ]
            },
            // --- Pub branch: Pull live data, soft pushback ---
            't2-pub-zone-check': {
                type: 'device_check',
                title: 'Loading Heating Zones',
                api: { method: 'GET', url: '/api/salus/{accountId}/devices' },
                dataCard: {
                    title: 'Heating Zones at {siteName}',
                    fields: ['zoneName', 'currentTemp', 'setpoint', 'mode', 'heatingActive']
                },
                onSuccess: 't2-pub-review',
                onEmpty: 'escalate-no-zones',
                fallback: 'escalate-no-data'
            },
            't2-pub-review': {
                type: 'question',
                title: 'Zone Status',
                message: 'Review the live zone data above. The current temperature and setpoint are shown.\n\nIf the temperature is at or close to the setpoint, use soft pushback: **"The heating is working and the temperature is at target. It may take 15-30 minutes to feel the impact — are you sure you\'d like me to boost it?"**\n\nIf the customer says yes, or if the temperature is significantly below setpoint, proceed with the boost.',
                options: [
                    { label: 'Boost temperature (+3°C for 2 hours)', next: 'capture-boost-reason' },
                    { label: 'Temperature is normal — customer satisfied after explanation', next: 'resolved-no-action' },
                    { label: 'Heating active but not reaching setpoint', next: 'escalate-not-reaching' },
                    { label: 'Equipment shows offline', next: 'escalate-offline' }
                ]
            },
            'capture-boost-reason': {
                type: 'input',
                title: 'Capture Reason for Boost',
                message: '**Ask the caller:** "Can I ask why you need the heating boosted?" (Record their reason)',
                placeholder: 'e.g. Function tonight, elderly guests, temperature complaint from customer',
                next: 'confirm-boost'
            },
            'confirm-boost': {
                type: 'action',
                title: 'Confirm Temperature Boost',
                message: 'This will increase the setpoint by 3°C for 2 hours, then auto-revert.',
                confirmLabel: 'Apply Boost',
                api: { method: 'POST', url: '/api/salus/{accountId}/devices/{deviceId}/setpoint' },
                pocketChange: {
                    service: 'salus',
                    revertAfterMinutes: 120,
                    description: 'Heating boost at {siteName} — +3°C'
                },
                next: 'boost-applied'
            },
            'boost-applied': {
                type: 'resolution',
                title: 'Boost Applied',
                message: 'Temperature boost is active. The setpoint will auto-revert in 2 hours.',
                summary: 'OOH: Applied +3°C heating boost at {siteName}, zone {zoneName}. Auto-reverts at {revertTime}. Reason: {inputValue}'
            },
            // --- Accommodation branch: Salus thermostat visual walkthrough ---
            't1-accom-thermostat': {
                type: 'question',
                title: 'Salus Thermostat Check',
                message: '**Ask the caller:** "Can you see a thermostat like this on the wall? Is the screen on?"\n\n*(Salus IT700 — white device with LCD display showing temperature, mode icons)*',
                // TODO: image: '/images/salus-thermostat.png'
                options: [
                    { label: 'Yes — thermostat screen is on', next: 't1-accom-flame-check' },
                    { label: 'Screen is blank / off', next: 't1-accom-blank-thermostat' },
                    { label: 'No thermostat visible', next: 't2-pub-zone-check' }
                ]
            },
            't1-accom-flame-check': {
                type: 'question',
                title: 'Flame Icon Check',
                message: '**Ask the caller:** "Can you see a flame icon on the display? Is it animated (moving)?" An animated flame means the heating is actively running.\n\n**Also ask:** "What temperature is it showing? What\'s the target?"',
                options: [
                    { label: 'Flame is animated — heating is running', next: 't1-accom-heating-running' },
                    { label: 'Flame is static or not visible — heating not calling', next: 't1-accom-try-boost' },
                    { label: 'Caller can\'t tell', next: 't2-pub-zone-check' }
                ]
            },
            't1-accom-heating-running': {
                type: 'question',
                title: 'Heating is Running',
                message: 'The heating is actively running. It may just need time to warm up.\n\n**Say to caller:** "The heating system is running — it may take 15-30 minutes to reach temperature. Would you like me to boost it higher?"',
                options: [
                    { label: 'Customer wants a boost', next: 'capture-boost-reason' },
                    { label: 'Customer happy to wait', next: 'resolved-no-action' }
                ]
            },
            't1-accom-try-boost': {
                type: 'question',
                title: 'Try Manual Boost',
                message: '**Ask the caller:** "Try pressing the up arrow on the thermostat. The maximum is 22°C for accommodation."',
                options: [
                    { label: 'Thermostat responded — heating coming on', next: 'resolved-manual-boost' },
                    { label: 'Thermostat not responding to buttons', next: 't2-pub-zone-check' },
                    { label: 'Already at 22°C but still cold', next: 'escalate-not-reaching' }
                ]
            },
            't1-accom-blank-thermostat': {
                type: 'question',
                title: 'Blank Thermostat',
                message: '**Ask the caller:** "The thermostat screen is blank. There may be a micro-USB port on the side — try plugging in a phone charger cable. Then press and hold the OK button for 3 seconds."',
                options: [
                    { label: 'Screen came on', next: 't1-accom-flame-check' },
                    { label: 'Still blank after charging/pressing', next: 'escalate-salus-hw' }
                ]
            },
            'resolved-manual-boost': {
                type: 'resolution',
                title: 'Resolved — Manual Thermostat Boost',
                message: 'The caller adjusted the thermostat and heating is coming on. A review ticket will be created for the IoT team.',
                summary: 'OOH: Heating too cold at {siteName} (accommodation). Caller boosted thermostat manually. Review recommended — check if setpoint differs from standard template.'
            },
            'resolved-no-action': {
                type: 'resolution',
                title: 'Resolved — No Action Needed',
                message: 'The heating system is working within normal parameters. The caller has been advised.',
                summary: 'OOH: Heating too cold call at {siteName}. System checked — operating normally. Caller advised.'
            },
            'escalate-not-reaching': {
                type: 'escalation',
                title: 'Heating Not Reaching Setpoint',
                message: 'The heating system is running but not reaching the target temperature. This needs IoT team investigation.',
                severity: 'medium',
                suggestedDiagnostic: 'R2 — Heating underperformance'
            },
            'escalate-offline': {
                type: 'escalation',
                title: 'Heating Equipment Offline',
                message: 'Heating equipment showing offline. This could indicate a power or connectivity issue.',
                severity: 'high',
                suggestedDiagnostic: 'R3 — Gateway/device offline'
            },
            'escalate-no-zones': {
                type: 'escalation',
                title: 'No Zones Found',
                message: 'No heating zones found for this site in the system. IoT team to investigate.',
                severity: 'medium'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Retrieve Data',
                message: 'Could not connect to the heating system. Escalating to IoT team.',
                severity: 'high'
            },
            'escalate-salus-hw': {
                type: 'escalation',
                title: 'Salus Thermostat Hardware Fault',
                message: 'Thermostat not responding after power/reset attempt. Likely hardware fault.',
                severity: 'high',
                suggestedDiagnostic: 'R4 — Salus hardware fault'
            }
        }
    },

    // ========================================================================
    // NO HOT WATER (Change 3 — noHotWater)
    // T1: Opening time check with soft pushback, pub/accom, boiler visual
    // T2: ThingsBoard boiler status
    // ========================================================================
    'no-hot-water': {
        id: 'no-hot-water',
        name: 'No Hot Water',
        description: 'No hot water — opening time check, soft pushback, boiler visual check',
        service: 'thingsboard',
        icon: 'water_drop',
        entryType: 'hardware',
        states: {
            start: {
                type: 'input',
                title: 'Site Opening Time',
                message: '**Ask the caller:** "What time does the site open today?" (Hot water is scheduled to start 1 hour before opening)',
                placeholder: 'e.g. 7:00, 8:30, 11:00',
                next: 't1-check-timing'
            },
            't1-check-timing': {
                type: 'question',
                title: 'Timing Assessment',
                message: 'Is the caller ringing before the expected hot water start time (1 hour before opening)?',
                options: [
                    { label: 'Yes — calling early (before expected HW time)', next: 't1-early-call' },
                    { label: 'No — calling after expected HW time', next: 't1-pub-or-accom' }
                ]
            },
            't1-early-call': {
                type: 'question',
                title: 'Early Call — Soft Pushback',
                message: '**Say to caller:** "Hot water is scheduled to start 1 hour before your opening time, so it should come on at {inputValue} minus 1 hour. You\'re calling a bit ahead of that. Can I ask why you need it earlier?"\n\nCapture the reason, then action the request regardless.',
                options: [
                    { label: 'Customer wants early start — action it', next: 'capture-hw-reason' },
                    { label: 'Customer happy to wait for scheduled time', next: 'resolved-wait-for-schedule' }
                ]
            },
            'capture-hw-reason': {
                type: 'input',
                title: 'Reason for Early Hot Water',
                message: 'Record why the customer needs hot water earlier than scheduled:',
                placeholder: 'e.g. Early delivery, deep clean, staff in early',
                next: 'escalate-early-hw'
            },
            'escalate-early-hw': {
                type: 'escalation',
                title: 'Early Hot Water Request',
                message: 'Early hot water request logged. IoT team to review — may need schedule adjustment or one-off override.',
                severity: 'medium',
                summary: 'OOH: Early hot water request at {siteName}. Opening time: {inputValue}. Reason: {inputValue}. Customer requested early start.'
            },
            'resolved-wait-for-schedule': {
                type: 'resolution',
                title: 'Resolved — Waiting for Schedule',
                message: 'Caller advised that hot water will start at the scheduled time. No action needed.',
                summary: 'OOH: No hot water call at {siteName}. Caller was ringing before scheduled HW start time. Advised to wait.'
            },
            't1-pub-or-accom': {
                type: 'question',
                title: 'Pub or Accommodation?',
                message: '**Ask the caller:** "Is this for the pub or for accommodation?" (Accommodation hot water may come from the pub system)',
                options: [
                    { label: 'Pub', next: 't1-boiler-check' },
                    { label: 'Accommodation', next: 't1-boiler-check' }
                ]
            },
            't1-boiler-check': {
                type: 'question',
                title: 'Boiler Visual Check',
                message: '**Ask the caller:** "Can you see the boiler? Is there a pilot light on? Are there any error codes on the display?"',
                // TODO: image: '/images/boiler-panel.png' (MISSING — request from IoT team)
                options: [
                    { label: 'Boiler looks faulty (no pilot / error code visible)', next: 't1-boiler-fault' },
                    { label: 'Boiler looks fine / caller can\'t check', next: 't2-check-boiler-status' },
                    { label: 'Caller reports error code', next: 't1-capture-error-code' }
                ]
            },
            't1-capture-error-code': {
                type: 'input',
                title: 'Capture Boiler Error Code',
                message: '**Ask the caller:** "Can you read the error code to me?"',
                placeholder: 'e.g. E1, F28, 3 flashing lights',
                next: 't1-boiler-fault-with-code'
            },
            't1-boiler-fault': {
                type: 'escalation',
                title: 'Boiler Fault — Dual Referral',
                message: `This looks like a boiler issue rather than the Lighthouse system. Logging for IoT team and advising caller to also contact GK Repairs.\n\n**${GK_REPAIRS_INFO}**`,
                severity: 'medium',
                summary: 'OOH: No hot water at {siteName} — boiler appears faulty (no pilot/visual fault). Caller referred to GK Repairs. Also escalated to IoT Support.',
                referralTo: 'GK Repairs'
            },
            't1-boiler-fault-with-code': {
                type: 'escalation',
                title: 'Boiler Fault — Error Code Captured',
                message: `Boiler error code captured. Logging for IoT team and advising caller to also contact GK Repairs.\n\n**${GK_REPAIRS_INFO}**`,
                severity: 'medium',
                summary: 'OOH: No hot water at {siteName} — boiler error code: {inputValue}. Caller referred to GK Repairs. Also escalated to IoT Support.',
                referralTo: 'GK Repairs'
            },
            't2-check-boiler-status': {
                type: 'device_check',
                title: 'Checking Boiler Status',
                api: { method: 'GET', url: '/api/tb/devices/{deviceId}/telemetry' },
                dataCard: {
                    title: 'Boiler Status',
                    fields: ['boilerState', 'dhwTemp', 'dhwSetpoint', 'lastUpdate']
                },
                onSuccess: 't2-boiler-review',
                fallback: 'escalate-no-data'
            },
            't2-boiler-review': {
                type: 'question',
                title: 'Boiler Data Review',
                message: 'Review the boiler telemetry above. Is the boiler actively heating DHW?',
                options: [
                    { label: 'Boiler running but water not hot — needs investigation', next: 'escalate-iot' },
                    { label: 'Boiler not firing — needs IoT team review', next: 'escalate-iot' },
                    { label: 'Data looks stale or unavailable', next: 'escalate-no-data' }
                ]
            },
            'escalate-iot': {
                type: 'escalation',
                title: 'Escalated to IoT Team',
                message: 'Hot water issue escalated for IoT team investigation.',
                severity: 'medium',
                suggestedDiagnostic: 'R7 — DHW / boiler investigation'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Retrieve Data',
                message: 'Could not retrieve boiler data. Escalating to IoT team.',
                severity: 'high'
            }
        }
    },

    // ========================================================================
    // KEEPS TURNING OFF (Change 4 — keepsTurningOff)
    // T1: Interlock light, single vs multiple, timing pattern
    // ========================================================================
    'keeps-turning-off': {
        id: 'keeps-turning-off',
        name: 'Equipment Keeps Turning Off',
        description: 'Equipment turns off repeatedly — interlock check, pattern detection',
        service: 'tuya',
        icon: 'power_off',
        entryType: 'hardware',
        states: {
            start: {
                type: 'question',
                title: 'Interlock Light Check',
                message: '**Ask the caller:** "When the equipment turns off, does the green light on the interlock panel go off too?"',
                options: [
                    { label: 'Green light goes OFF when equipment stops', next: 't1-schedule-or-pp' },
                    { label: 'Green light stays ON but equipment stops', next: 't1-appliance-fault' },
                    { label: 'No interlock panel / caller unsure', next: 't1-how-many' }
                ]
            },
            't1-schedule-or-pp': {
                type: 'info',
                title: 'Likely Schedule or PowerPause Issue',
                message: 'The interlock losing power suggests a schedule or PowerPause system issue. Let\'s check the timing pattern.',
                next: 't1-timing-pattern'
            },
            't1-appliance-fault': {
                type: 'referral',
                title: 'Appliance Fault',
                message: `The green light stays on (power is being delivered by Lighthouse) but the equipment stops. This is an appliance fault, not a Lighthouse issue.\n\nAdvise the caller to contact GK Repairs.\n\n**${GK_REPAIRS_INFO}**`,
                summary: 'OOH: Equipment keeps turning off at {siteName} — interlock green light stays on, equipment stops. Appliance fault. Caller referred to GK Repairs.',
                referralTo: 'GK Repairs',
                referralPhone: GK_REPAIRS_PHONE
            },
            't1-how-many': {
                type: 'question',
                title: 'Single or Multiple Appliances?',
                message: '**Ask the caller:** "Is it just one appliance or are multiple things turning off?"',
                options: [
                    { label: 'Just one appliance', next: 't1-timing-pattern' },
                    { label: 'Multiple appliances', next: 't1-site-power' }
                ]
            },
            't1-site-power': {
                type: 'referral',
                title: 'Possible Site Power Issue',
                message: `Multiple appliances turning off suggests a site power issue at the distribution board level rather than Lighthouse.\n\nAdvise the caller to check the distribution board. If it persists, escalate to IoT Support.\n\n**${GK_REPAIRS_INFO}** (for electrician)`,
                summary: 'OOH: Multiple appliances turning off at {siteName} — suspected site power issue. Caller advised to check distribution board and contact GK Repairs for electrician.',
                referralTo: 'GK Repairs',
                referralPhone: GK_REPAIRS_PHONE,
                alsoEscalate: true
            },
            't1-timing-pattern': {
                type: 'question',
                title: 'Timing Pattern',
                message: '**Ask the caller:** "Is it happening at roughly the same time each day?"',
                options: [
                    { label: 'Yes — same time daily', next: 't2-schedule-check' },
                    { label: 'No — random / intermittent', next: 'escalate-intermittent' }
                ]
            },
            't2-schedule-check': {
                type: 'device_check',
                title: 'Checking Device Schedule',
                api: { method: 'GET', url: '/api/tuya/devices/{deviceId}/schedules' },
                dataCard: {
                    title: 'Device Schedules',
                    fields: ['scheduleName', 'time', 'action', 'enabled', 'repeat']
                },
                onSuccess: 't2-schedule-review',
                fallback: 'escalate-no-data'
            },
            't2-schedule-review': {
                type: 'question',
                title: 'Schedule Review',
                message: 'Review the schedule above. Does a schedule appear to be causing the unwanted shutdowns?',
                options: [
                    { label: 'Yes — schedule conflict found', next: 'escalate-schedule' },
                    { label: 'No — schedule looks correct', next: 'escalate-intermittent' }
                ]
            },
            'escalate-schedule': {
                type: 'escalation',
                title: 'Schedule Conflict',
                message: 'A schedule appears to be causing unwanted shutdowns. IoT team to review and adjust.',
                severity: 'medium',
                suggestedDiagnostic: 'R6 — Schedule review'
            },
            'escalate-intermittent': {
                type: 'escalation',
                title: 'Intermittent Fault',
                message: 'Equipment turning off intermittently with no clear pattern. Needs IoT team investigation.',
                severity: 'medium',
                suggestedDiagnostic: 'R5 — PowerPause intermittent fault'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Retrieve Data',
                message: 'Could not retrieve schedule data. Escalating to IoT team.',
                severity: 'high'
            }
        }
    },

    // ========================================================================
    // OVENS & GRILLS (Change 5 — ovensGrills)
    // Scope check via PowerPause sticker → routes to kitchenEquip or GK Repairs
    // ========================================================================
    'ovens-grills': {
        id: 'ovens-grills',
        name: 'Ovens & Grills',
        description: 'Oven/grill issue — PowerPause scope check, route to kitchen flow or GK Repairs',
        service: 'tuya',
        icon: 'outdoor_grill',
        entryType: 'hardware',
        states: {
            start: {
                type: 'question',
                title: 'PowerPause Scope Check',
                message: '**Ask the caller:** "Is the appliance labelled with a blue PowerPause sticker?"',
                // TODO: image: '/images/powerpause-sticker.png'
                options: [
                    { label: 'YES — has a PowerPause sticker', next: 'route-kitchen-equip' },
                    { label: 'NO — no sticker', next: 'not-lighthouse' },
                    { label: 'UNSURE', next: 'check-for-panels' }
                ]
            },
            'route-kitchen-equip': {
                type: 'info',
                title: 'Routing to Kitchen Equipment Flow',
                message: 'This appliance IS controlled by Lighthouse. Switching to the Kitchen Equipment triage flow...',
                redirectFlow: 'kitchen-equip'
            },
            'check-for-panels': {
                type: 'question',
                title: 'Look for Switch Panels',
                message: '**Ask the caller:** "Can you see any small switch boxes or panels near the appliance with a green light?"',
                options: [
                    { label: 'Yes — there\'s a panel with a green light', next: 'route-kitchen-equip' },
                    { label: 'No — nothing visible', next: 'not-lighthouse' }
                ]
            },
            'not-lighthouse': {
                type: 'referral',
                title: 'Not Controlled by Lighthouse',
                message: `This appliance isn't controlled by the Lighthouse system. Advise the caller to check power/gas and contact GK Repairs.\n\n**${GK_REPAIRS_INFO}**`,
                summary: 'OOH: Oven/grill issue at {siteName} — appliance has no PowerPause sticker, not Lighthouse-controlled. Caller referred to GK Repairs.',
                referralTo: 'GK Repairs',
                referralPhone: GK_REPAIRS_PHONE
            }
        }
    },

    // ========================================================================
    // HEATING STUCK ON (Change 6 — heatingStuck)
    // T1: Pub/accommodation, Salus standby, stuck valve detection
    // ========================================================================
    'heating-stuck': {
        id: 'heating-stuck',
        name: 'Heating Stuck On',
        description: 'Heating won\'t turn off — pub/accommodation routing, Salus standby, valve check',
        service: 'salus',
        icon: 'whatshot',
        entryType: 'hardware',
        states: {
            start: {
                type: 'question',
                title: 'Heating Stuck On',
                message: '**Ask the caller:** "Is this for a pub area or accommodation?"',
                options: [
                    { label: 'Pub area', next: 't1-pub-radiator-check' },
                    { label: 'Accommodation', next: 't1-accom-standby' }
                ]
            },
            // --- Accommodation: Salus standby ---
            't1-accom-standby': {
                type: 'question',
                title: 'Salus Standby Mode',
                message: '**Ask the caller:** "Can you press and hold the OK button on the thermostat for 3 seconds? This puts it into standby mode and should stop the heating."',
                // TODO: image: '/images/salus-thermostat.png'
                options: [
                    { label: 'Heating stopped — resolved', next: 'resolved-standby' },
                    { label: 'Heating still running after standby', next: 't2-system-check' }
                ]
            },
            'resolved-standby': {
                type: 'resolution',
                title: 'Resolved — Thermostat in Standby',
                message: 'Heating stopped via thermostat standby mode. A review ticket will be created for the IoT team to check why the heating was stuck.',
                summary: 'OOH: Heating stuck on at {siteName} (accommodation). Resolved by putting Salus thermostat into standby. IoT team to review why heating was stuck.'
            },
            // --- Pub: Radiator/valve check ---
            't1-pub-radiator-check': {
                type: 'question',
                title: 'Radiator Check',
                message: '**Ask the caller:** "Are the radiators hot to the touch even though it should be off?"',
                options: [
                    { label: 'Yes — radiators hot but system should be off', next: 't1-valve-check' },
                    { label: 'System shows heating still actively calling', next: 't2-system-check' }
                ]
            },
            't1-valve-check': {
                type: 'escalation',
                title: 'Likely Stuck Zone Valve',
                message: `This is likely a stuck zone valve — a physical issue rather than the Lighthouse system. Logging for IoT team and advising caller to also contact their heating maintenance contractor.\n\n**${GK_REPAIRS_INFO}**`,
                severity: 'medium',
                summary: 'OOH: Heating stuck on at {siteName} (pub). Radiators hot but system shows off — likely stuck zone valve. Caller referred to GK Repairs. Also escalated to IoT Support.',
                referralTo: 'GK Repairs',
                suggestedDiagnostic: 'R8 — Stuck zone valve'
            },
            't2-system-check': {
                type: 'device_check',
                title: 'Checking Heating System',
                api: { method: 'GET', url: '/api/salus/{accountId}/devices' },
                dataCard: {
                    title: 'Heating Zones',
                    fields: ['zoneName', 'currentTemp', 'setpoint', 'mode', 'heatingActive']
                },
                onSuccess: 't2-review',
                fallback: 'escalate-no-data'
            },
            't2-review': {
                type: 'question',
                title: 'System Review',
                message: 'Review the zone data. Is the system actively calling for heat?',
                options: [
                    { label: 'System is calling — try remote setpoint reset', next: 'escalate-setpoint-reset' },
                    { label: 'System shows off but heating still running', next: 'escalate-valve' }
                ]
            },
            'escalate-setpoint-reset': {
                type: 'escalation',
                title: 'Remote Setpoint Reset Needed',
                message: 'System is actively calling for heat when it shouldn\'t be. IoT team to investigate and reset setpoint remotely.',
                severity: 'medium',
                suggestedDiagnostic: 'R2 — Setpoint/schedule misconfiguration'
            },
            'escalate-valve': {
                type: 'escalation',
                title: 'Physical Valve Issue',
                message: `System shows heating off but radiators are hot. Physical valve issue. Caller also advised to contact GK Repairs.\n\n**${GK_REPAIRS_INFO}**`,
                severity: 'medium',
                referralTo: 'GK Repairs',
                suggestedDiagnostic: 'R8 — Stuck zone valve'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Retrieve Data',
                message: 'Could not connect to the heating system. Escalating to IoT team.',
                severity: 'high'
            }
        }
    },

    // ========================================================================
    // CONTROLS ISSUE (Change 7 — controlsIssue)
    // T1: Branch by control type — Salus blank, interlock, boiler error
    // ========================================================================
    'controls-issue': {
        id: 'controls-issue',
        name: 'Controls Not Responding',
        description: 'Control panel/thermostat issue — branch by type, guided troubleshooting',
        service: 'multi',
        icon: 'touch_app',
        entryType: 'hardware',
        states: {
            start: {
                type: 'question',
                title: 'Which Control?',
                message: '**Ask the caller:** "Which type of control is the issue with?"',
                options: [
                    { label: 'Thermostat (wall-mounted, white, LCD screen)', next: 't1-salus-blank' },
                    { label: 'Interlock panel (green light / green button)', next: 't1-interlock' },
                    { label: 'Boiler panel (error code or display)', next: 't1-boiler-error' },
                    { label: 'Other / unsure', next: 'escalate-iot' }
                ]
            },
            // --- Salus thermostat blank/unresponsive ---
            't1-salus-blank': {
                type: 'question',
                title: 'Salus Thermostat — Blank Screen',
                message: '**Ask the caller:** "Is there a micro-USB port on the side? Try plugging in a phone charger cable. Then press and hold the OK button for 3 seconds."',
                // TODO: image: '/images/salus-thermostat.png'
                options: [
                    { label: 'Screen came on', next: 't1-salus-status' },
                    { label: 'Still blank after charging/pressing', next: 'escalate-salus-hw' }
                ]
            },
            't1-salus-status': {
                type: 'question',
                title: 'Salus Status Icons',
                message: '**Walk through the status icons with the caller:**\n- Wi-Fi icon: Is it showing? (connectivity)\n- Battery icon: Is it flashing? (low battery)\n- Flame icon: Is it animated? (heating active)',
                options: [
                    { label: 'Icons look normal — thermostat working now', next: 'resolved-salus' },
                    { label: 'No Wi-Fi icon — connectivity issue', next: 'escalate-salus-wifi' },
                    { label: 'Battery flashing — needs battery replacement', next: 'escalate-salus-battery' }
                ]
            },
            'resolved-salus': {
                type: 'resolution',
                title: 'Resolved — Salus Thermostat',
                message: 'Thermostat is responding normally after reset.',
                summary: 'OOH: Controls issue at {siteName} — Salus thermostat was blank, resolved with USB charge/reset.'
            },
            'escalate-salus-hw': {
                type: 'escalation',
                title: 'Salus Hardware Fault',
                message: 'Thermostat not responding after power/reset attempt. Likely hardware fault.',
                severity: 'high',
                suggestedDiagnostic: 'R4 — Salus hardware fault'
            },
            'escalate-salus-wifi': {
                type: 'escalation',
                title: 'Salus Wi-Fi Connectivity Issue',
                message: 'Thermostat has no Wi-Fi icon — connectivity issue. IoT team to investigate.',
                severity: 'medium',
                suggestedDiagnostic: 'R3 — Gateway/device offline'
            },
            'escalate-salus-battery': {
                type: 'escalation',
                title: 'Salus Low Battery',
                message: 'Thermostat battery is low. IoT team to arrange replacement.',
                severity: 'low',
                suggestedDiagnostic: 'R4 — Salus maintenance'
            },
            // --- Interlock panel (same T1 as kitchenEquip) ---
            't1-interlock': {
                type: 'info',
                title: 'Interlock Panel Issue',
                message: 'Routing to the Kitchen Equipment flow for interlock panel troubleshooting...',
                redirectFlow: 'kitchen-equip'
            },
            // --- Boiler panel error code ---
            't1-boiler-error': {
                type: 'input',
                title: 'Boiler Error Code',
                message: '**Ask the caller:** "Can you read the error code to me? Is there a QR code on the boiler panel? Can you scan it?"',
                placeholder: 'e.g. E1, F28, 3 flashing lights',
                next: 'escalate-boiler'
            },
            'escalate-boiler': {
                type: 'escalation',
                title: 'Boiler Error — Details Captured',
                message: `Boiler error code captured. Escalating to IoT team with details.\n\nAlso advise caller to contact GK Repairs if the boiler itself needs servicing.\n\n**${GK_REPAIRS_INFO}**`,
                severity: 'medium',
                summary: 'OOH: Controls issue at {siteName} — boiler error code: {inputValue}. Escalated to IoT Support. Caller also referred to GK Repairs.',
                referralTo: 'GK Repairs',
                suggestedDiagnostic: 'R7 — Boiler fault'
            },
            'escalate-iot': {
                type: 'escalation',
                title: 'Escalated to IoT Team',
                message: 'Control issue escalated for IoT team investigation.',
                severity: 'medium'
            }
        }
    },

    // ========================================================================
    // FRIDGE ISSUE (Change 8 — fridgeIssue)
    // Scope clarification (monitoring only), door check, temp thresholds
    // ========================================================================
    'fridge-issue': {
        id: 'fridge-issue',
        name: 'Fridge / Freezer Issue',
        description: 'Fridge/freezer temperature issue — monitoring only, food safety thresholds',
        service: 'thingsboard',
        icon: 'kitchen',
        entryType: 'hardware',
        states: {
            start: {
                type: 'info',
                title: 'Fridge / Freezer — Monitoring Only',
                message: '**Important:** Lighthouse monitors fridge and freezer temperatures but **doesn\'t control them** — we can see the temperature readings but can\'t turn anything on or off remotely.',
                next: 't1-door-check'
            },
            't1-door-check': {
                type: 'question',
                title: 'Door Check',
                message: '**Ask the caller:** "Has a door been left open? Can you check?"',
                options: [
                    { label: 'Door was open — they\'ve closed it', next: 't1-temp-reading' },
                    { label: 'Door is closed', next: 't1-temp-reading' },
                    { label: 'Can\'t check right now', next: 't1-temp-reading' }
                ]
            },
            't1-temp-reading': {
                type: 'input',
                title: 'Temperature Reading',
                message: '**Ask the caller:** "What temperature is the display on the unit showing?"',
                placeholder: 'e.g. 12°C, -8°C, no display',
                next: 't2-check-sensor'
            },
            't2-check-sensor': {
                type: 'device_check',
                title: 'Checking ThingsBoard Sensor Data',
                api: { method: 'GET', url: '/api/tb/devices/{deviceId}/telemetry' },
                dataCard: {
                    title: 'Temperature Sensor Data',
                    fields: ['currentTemp', 'setpoint', 'lastUpdate', 'trend']
                },
                onSuccess: 't2-temp-review',
                fallback: 'escalate-no-data'
            },
            't2-temp-review': {
                type: 'question',
                title: 'Temperature Assessment',
                message: 'Review the sensor data above against the caller\'s reading.\n\n**Food safety thresholds:**\n- Fridge: above 8°C = concern\n- Freezer: above -15°C = concern',
                options: [
                    { label: 'Temperature within normal range', next: 'resolved-normal' },
                    { label: 'Fridge above 8°C — food safety concern', next: 'escalate-food-safety' },
                    { label: 'Freezer above -15°C — food safety concern', next: 'escalate-food-safety' },
                    { label: 'Sensor data doesn\'t match caller reading', next: 'escalate-sensor-mismatch' }
                ]
            },
            'resolved-normal': {
                type: 'resolution',
                title: 'Temperature Normal',
                message: 'Temperature is within normal range. If a door was open, it should recover. Advise caller to check again in 30 minutes.',
                summary: 'OOH: Fridge/freezer concern at {siteName}. Caller reading: {inputValue}. Sensor data confirmed within range. Door check completed.'
            },
            'escalate-food-safety': {
                type: 'escalation',
                title: 'Food Safety Concern',
                message: 'Temperature exceeds food safety threshold. Flagging as priority for IoT team. **Advise site to move perishable items if possible.**',
                severity: 'high',
                summary: 'OOH: FOOD SAFETY — fridge/freezer at {siteName} above safe temperature. Caller reading: {inputValue}. Site advised to move perishables.'
            },
            'escalate-sensor-mismatch': {
                type: 'escalation',
                title: 'Sensor Mismatch',
                message: 'Sensor data doesn\'t match what the caller is seeing. IoT team to investigate — possible sensor fault.',
                severity: 'medium',
                suggestedDiagnostic: 'R9 — Sensor fault investigation'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Retrieve Sensor Data',
                message: 'Could not retrieve temperature data. Escalating to IoT team.',
                severity: 'high'
            }
        }
    },

    // ========================================================================
    // EXTERNAL LIGHTING (Change 9 — NEW flow)
    // T1: Tongou switch, manual override, MCB check
    // T2: Tuya device status, schedule check, remote override
    // ========================================================================
    'external-lighting': {
        id: 'external-lighting',
        name: 'External Lighting',
        description: 'Outside lights, festoon lighting, outdoor heaters — Tongou switch, Tuya control',
        service: 'tuya',
        icon: 'lightbulb',
        entryType: 'hardware',
        states: {
            start: {
                type: 'question',
                title: 'External Lighting Issue',
                message: '**Ask the caller:** "Can you see a small switch box near the lighting circuit?"',
                // TODO: image: '/images/tongou-switch.png' (MISSING — request from IoT team)
                options: [
                    { label: 'Yes — can see a switch box', next: 't1-manual-override' },
                    { label: 'No — can\'t see one', next: 't1-mcb-check' }
                ]
            },
            't1-manual-override': {
                type: 'question',
                title: 'Manual Override',
                message: '**Ask the caller:** "Is there a manual override button? Try pressing it."',
                options: [
                    { label: 'Lights came on', next: 'resolved-manual' },
                    { label: 'Nothing happened', next: 't1-mcb-check' }
                ]
            },
            'resolved-manual': {
                type: 'resolution',
                title: 'Resolved — Manual Override',
                message: 'External lighting turned on via manual override. IoT team to review if this was a schedule issue.',
                summary: 'OOH: External lighting at {siteName} — resolved via manual override on Tongou switch.'
            },
            't1-mcb-check': {
                type: 'question',
                title: 'MCB / Fuse Check',
                message: '**Ask the caller:** "Can you check the MCB/fuse for the lighting circuit on the distribution board?"',
                options: [
                    { label: 'MCB was tripped — they\'ve reset it', next: 't1-mcb-reset-check' },
                    { label: 'MCB is ON — power looks fine', next: 't2-check-device' },
                    { label: 'Caller can\'t locate it', next: 't2-check-device' }
                ]
            },
            't1-mcb-reset-check': {
                type: 'question',
                title: 'MCB Reset — Did Lights Come On?',
                message: 'Did the lights come on after the MCB was reset?',
                options: [
                    { label: 'Yes — lights are on now', next: 'resolved-mcb-reset' },
                    { label: 'No — still off', next: 't2-check-device' }
                ]
            },
            'resolved-mcb-reset': {
                type: 'resolution',
                title: 'Resolved — MCB Reset',
                message: 'External lighting restored after MCB reset.',
                summary: 'OOH: External lighting at {siteName} — MCB was tripped, reset resolved the issue.'
            },
            't2-check-device': {
                type: 'device_check',
                title: 'Checking Tuya Device Status',
                api: { method: 'GET', url: '/api/tuya/devices/{deviceId}/status' },
                dataCard: {
                    title: 'Lighting Switch Status',
                    fields: ['switchState', 'online', 'lastUpdate']
                },
                branches: [
                    { condition: 'online === false', next: 'escalate-offline' },
                    { condition: 'online === true', next: 't2-check-schedule' }
                ],
                fallback: 'escalate-no-data'
            },
            't2-check-schedule': {
                type: 'device_check',
                title: 'Checking Lighting Schedule',
                api: { method: 'GET', url: '/api/tuya/devices/{deviceId}/schedules' },
                dataCard: {
                    title: 'Lighting Schedule',
                    fields: ['scheduleName', 'time', 'action', 'enabled']
                },
                onSuccess: 't2-schedule-review',
                fallback: 't2-offer-override'
            },
            't2-schedule-review': {
                type: 'question',
                title: 'Schedule Review',
                message: 'Device is online. Review the schedule above. Is the current time within the lighting schedule?',
                options: [
                    { label: 'Within schedule — override to turn on', next: 't2-override' },
                    { label: 'Outside schedule — override anyway + create review ticket', next: 't2-override-with-review' },
                    { label: 'No schedule found — override to turn on', next: 't2-offer-override' }
                ]
            },
            't2-offer-override': {
                type: 'question',
                title: 'Remote Override',
                message: 'Would you like to turn on the lights remotely?',
                options: [
                    { label: 'Yes — turn on lights', next: 't2-override' },
                    { label: 'No — escalate to IoT team', next: 'escalate-iot' }
                ]
            },
            't2-override': {
                type: 'action',
                title: 'Confirm Light Override',
                message: 'This will turn on the external lighting remotely.',
                confirmLabel: 'Turn On Lights',
                api: {
                    method: 'POST',
                    url: '/api/tuya/devices/{deviceId}/switch',
                    body: { commands: [{ code: 'switch_1', value: true }] }
                },
                next: 'resolved-override'
            },
            't2-override-with-review': {
                type: 'action',
                title: 'Confirm Override (Outside Schedule)',
                message: 'This is outside the normal schedule. The lights will be turned on and a review ticket created for the IoT team.',
                confirmLabel: 'Turn On + Create Review Ticket',
                api: {
                    method: 'POST',
                    url: '/api/tuya/devices/{deviceId}/switch',
                    body: { commands: [{ code: 'switch_1', value: true }] }
                },
                next: 'resolved-override-review'
            },
            'resolved-override': {
                type: 'resolution',
                title: 'Lights Turned On',
                message: 'External lighting has been turned on remotely.',
                summary: 'OOH: External lighting at {siteName} — remotely turned on via Tuya override.'
            },
            'resolved-override-review': {
                type: 'resolution',
                title: 'Lights Turned On (Review Needed)',
                message: 'External lighting turned on outside normal schedule. Review ticket created for IoT team.',
                summary: 'OOH: External lighting at {siteName} — remotely turned on OUTSIDE normal schedule. IoT team to review schedule.'
            },
            'escalate-offline': {
                type: 'escalation',
                title: 'Device Offline',
                message: `Lighting device is offline — connectivity or hardware fault. If power to the switch box is confirmed OK, this may be an electrical fault.\n\nAdvise caller to also contact GK Repairs if it's an electrical issue.\n\n**${GK_REPAIRS_INFO}**`,
                severity: 'high',
                suggestedDiagnostic: 'R3 — Device offline',
                referralTo: 'GK Repairs'
            },
            'escalate-iot': {
                type: 'escalation',
                title: 'Escalated to IoT Team',
                message: 'External lighting issue escalated for IoT team investigation.',
                severity: 'medium'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Retrieve Data',
                message: 'Could not connect to the IoT platform. Escalating to IoT team.',
                severity: 'high'
            }
        }
    },

    // ========================================================================
    // WON'T TURN ON (Change 10 — wontTurnOn)
    // Total power failure check before equipment type routing
    // ========================================================================
    'wont-turn-on': {
        id: 'wont-turn-on',
        name: "Won't Turn On",
        description: 'Equipment won\'t turn on — total power failure check, then route by type',
        service: 'multi',
        icon: 'power_off',
        entryType: 'problem',
        states: {
            start: {
                type: 'question',
                title: 'Total Power Check',
                message: '**Ask the caller:** "Is ANYTHING else working in the building — lights, tills, other equipment?"',
                options: [
                    { label: 'Nothing working — total power failure', next: 'total-power-failure' },
                    { label: 'Other things working — just this equipment', next: 'what-type' }
                ]
            },
            'total-power-failure': {
                type: 'referral',
                title: 'Site Power Failure',
                message: `This sounds like a site power issue rather than Lighthouse.\n\n**Ask the caller:** "Can you check the main fuse board?"\n\nIf unresolved, advise them to contact GK Repairs for an electrician.\n\n**${GK_REPAIRS_INFO}**`,
                summary: 'OOH: Total power failure reported at {siteName}. Not a Lighthouse issue. Caller advised to check main fuse board and contact GK Repairs.',
                referralTo: 'GK Repairs',
                referralPhone: GK_REPAIRS_PHONE
            },
            'what-type': {
                type: 'question',
                title: 'What Type of Equipment?',
                message: 'Other equipment is working, so power is getting to the building. What type of equipment won\'t turn on?',
                options: [
                    { label: 'Kitchen appliance (fryer, grill, oven)', next: 'route-kitchen' },
                    { label: 'Heating', next: 'route-heating' },
                    { label: 'External lighting', next: 'route-lighting' },
                    { label: 'Something else', next: 'escalate-iot' }
                ]
            },
            'route-kitchen': {
                type: 'info',
                title: 'Routing to Kitchen Equipment Flow',
                redirectFlow: 'kitchen-equip'
            },
            'route-heating': {
                type: 'info',
                title: 'Routing to Heating Flow',
                redirectFlow: 'heating-too-cold'
            },
            'route-lighting': {
                type: 'info',
                title: 'Routing to External Lighting Flow',
                redirectFlow: 'external-lighting'
            },
            'escalate-iot': {
                type: 'escalation',
                title: 'Escalated to IoT Team',
                message: 'Equipment won\'t turn on — escalated for IoT team investigation.',
                severity: 'medium'
            }
        }
    },

    // ========================================================================
    // SOMETHING ELSE (Change 12 — somethingElse)
    // Contractor detection, re-routing to known categories, free-text fallback
    // ========================================================================
    'something-else': {
        id: 'something-else',
        name: 'Something Else',
        description: 'Catch-all — contractor detection, category re-routing, free-text escalation',
        service: 'multi',
        icon: 'contact_support',
        entryType: 'problem',
        states: {
            start: {
                type: 'question',
                title: 'Contractor on Site?',
                message: '**Ask the caller:** "Is there a contractor currently on site who needs something from us?"',
                options: [
                    { label: 'YES — contractor on site', next: 'capture-contractor' },
                    { label: 'NO — not a contractor', next: 'narrow-down' }
                ]
            },
            'capture-contractor': {
                type: 'input',
                title: 'Contractor Details',
                message: 'Capture the contractor details:\n- Name\n- Company\n- What they need\n- Their phone number',
                placeholder: 'e.g. Dave from ABC Heating, needs gateway access, 07700 123456',
                next: 'escalate-contractor'
            },
            'escalate-contractor': {
                type: 'escalation',
                title: 'Contractor on Site — Priority',
                message: 'Contractor is waiting on site. Escalating as priority to IoT team.',
                severity: 'high',
                summary: 'OOH: Contractor on site at {siteName}. Details: {inputValue}. PRIORITY — contractor waiting.'
            },
            'narrow-down': {
                type: 'question',
                title: 'What\'s the Issue About?',
                message: '**Ask the caller:** "Can you tell me a bit more? Is it related to heating, kitchen equipment, lighting, hot water, or something else?"',
                options: [
                    { label: 'Heating', next: 'route-heating' },
                    { label: 'Kitchen equipment', next: 'route-kitchen' },
                    { label: 'Lighting', next: 'route-lighting' },
                    { label: 'Hot water', next: 'route-hotwater' },
                    { label: 'Fridge / freezer', next: 'route-fridge' },
                    { label: 'Genuinely doesn\'t match any category', next: 'freetext-capture' }
                ]
            },
            'route-heating': { type: 'info', title: 'Routing to Heating', redirectFlow: 'heating-too-cold' },
            'route-kitchen': { type: 'info', title: 'Routing to Kitchen Equipment', redirectFlow: 'kitchen-equip' },
            'route-lighting': { type: 'info', title: 'Routing to Lighting', redirectFlow: 'external-lighting' },
            'route-hotwater': { type: 'info', title: 'Routing to Hot Water', redirectFlow: 'no-hot-water' },
            'route-fridge': { type: 'info', title: 'Routing to Fridge/Freezer', redirectFlow: 'fridge-issue' },
            'freetext-capture': {
                type: 'input',
                title: 'Describe the Issue',
                message: 'Record the caller\'s issue in as much detail as possible:',
                placeholder: 'Describe what the caller is reporting...',
                next: 'escalate-freetext'
            },
            'escalate-freetext': {
                type: 'escalation',
                title: 'Escalated — Uncategorised Issue',
                message: 'Issue doesn\'t match standard categories. Escalated to IoT team with details.',
                severity: 'medium',
                summary: 'OOH: Uncategorised issue at {siteName}. Description: {inputValue}.'
            }
        }
    },

    // ========================================================================
    // SCOPE CHECK (unchanged — already solid)
    // ========================================================================
    'scope-check': {
        id: 'scope-check',
        name: 'Scope Check',
        description: 'Verify whether a site/device is managed by IoT team',
        service: 'thingsboard',
        icon: 'verified',
        entryType: 'problem',
        states: {
            start: {
                type: 'info',
                title: 'Scope Check',
                message: 'Let\'s check if this site and equipment are managed by the IoT team.',
                next: 'lookup-site'
            },
            'lookup-site': {
                type: 'device_check',
                title: 'Looking Up Site',
                api: { method: 'GET', url: '/api/tb/sites/{siteNo}' },
                dataCard: {
                    title: 'Site Lookup Result',
                    fields: ['siteName', 'siteNo', 'client', 'assetCount']
                },
                branches: [
                    { condition: 'siteFound === true', next: 'site-found' },
                    { condition: 'siteFound === false', next: 'site-not-found' }
                ],
                fallback: 'escalate-no-data'
            },
            'site-found': {
                type: 'device_check',
                title: 'Loading Device Inventory',
                api: { method: 'GET', url: '/api/tb/sites/{siteNo}/devices' },
                dataCard: {
                    title: 'Devices at {siteName}',
                    fields: ['deviceName', 'deviceType', 'active', 'lastSeen']
                },
                onSuccess: 'inventory-review',
                fallback: 'escalate-no-data'
            },
            'inventory-review': {
                type: 'resolution',
                title: 'Site Confirmed',
                message: 'This site is managed by the IoT team. Device inventory is shown above.',
                summary: 'OOH: Scope check — site {siteNo} ({siteName}) confirmed as IoT-managed. {deviceCount} devices found.'
            },
            'site-not-found': {
                type: 'info',
                title: 'Not Our Site',
                message: 'This site was not found in the IoT platform. This equipment is likely not managed by us.',
                next: 'not-ours-resolution'
            },
            'not-ours-resolution': {
                type: 'resolution',
                title: 'Not IoT Managed',
                message: 'Advise the caller that this site/equipment is not managed by the IoT team. They may need to contact their facilities management provider.',
                summary: 'OOH: Scope check — site {siteNo} NOT found in IoT platform. Caller advised to contact FM provider.'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Check',
                message: 'Could not connect to ThingsBoard to verify. Escalating to IoT team for manual check.',
                severity: 'medium'
            }
        }
    },

    // ========================================================================
    // GATEWAY OFFLINE (unchanged — already has good T1 troubleshooting)
    // ========================================================================
    'gateway-offline': {
        id: 'gateway-offline',
        name: 'Gateway Offline',
        description: 'Gateway device showing offline — guided troubleshooting',
        service: 'thingsboard',
        icon: 'router',
        entryType: 'hardware',
        states: {
            start: {
                type: 'info',
                title: 'Gateway Offline',
                message: 'A gateway device is reported as offline. Let\'s check its current status.',
                next: 'check-gateway'
            },
            'check-gateway': {
                type: 'device_check',
                title: 'Checking Gateway Status',
                api: { method: 'GET', url: '/api/tb/devices/{deviceId}/status' },
                dataCard: {
                    title: 'Gateway Status',
                    fields: ['deviceName', 'active', 'lastActivityTime', 'lastConnectTime']
                },
                branches: [
                    { condition: 'active === true', next: 'gateway-actually-online' },
                    { condition: 'active === false', next: 'gateway-confirmed-offline' }
                ],
                fallback: 'escalate-no-data'
            },
            'gateway-actually-online': {
                type: 'resolution',
                title: 'Gateway is Online',
                message: 'The gateway is currently showing as ONLINE. It may have recovered.',
                summary: 'OOH: Gateway {deviceName} at {siteName} checked — currently online. Last activity: {lastActivityTime}.'
            },
            'gateway-confirmed-offline': {
                type: 'question',
                title: 'Gateway Confirmed Offline',
                message: 'The gateway is confirmed offline. Last seen: {lastActivityTime}.',
                options: [
                    { label: 'Ask site to check fuse board / power', next: 'fuse-check-script' },
                    { label: 'Site confirms power is fine', next: 'escalate-engineer' },
                    { label: 'Cannot contact site', next: 'escalate-no-contact' }
                ]
            },
            'fuse-check-script': {
                type: 'info',
                title: 'Fuse Check Script',
                message: '**Read to caller:**\n\n"Can you check the fuse board and look for any tripped switches? The IoT gateway is usually plugged into a standard socket near the router or in a cupboard. If you can see a small black or white box with lights, please check if the power light is on."',
                next: 'fuse-check-result'
            },
            'fuse-check-result': {
                type: 'question',
                title: 'Fuse Check Result',
                message: 'What did the site report?',
                options: [
                    { label: 'Fuse was tripped — they\'ve reset it', next: 'fuse-reset-wait' },
                    { label: 'Power looks fine — gateway still not responding', next: 'escalate-engineer' },
                    { label: 'They can\'t locate the gateway', next: 'escalate-engineer' }
                ]
            },
            'fuse-reset-wait': {
                type: 'info',
                title: 'Waiting for Gateway',
                message: 'The fuse has been reset. The gateway typically takes 2-5 minutes to reconnect.',
                next: 'recheck-gateway'
            },
            'recheck-gateway': {
                type: 'device_check',
                title: 'Re-checking Gateway',
                api: { method: 'GET', url: '/api/tb/devices/{deviceId}/status' },
                branches: [
                    { condition: 'active === true', next: 'gateway-recovered' },
                    { condition: 'active === false', next: 'escalate-still-offline' }
                ],
                fallback: 'escalate-no-data'
            },
            'gateway-recovered': {
                type: 'resolution',
                title: 'Gateway Recovered',
                message: 'The gateway is back online after the fuse reset.',
                summary: 'OOH: Gateway {deviceName} at {siteName} was offline — fuse reset resolved the issue.'
            },
            'escalate-still-offline': {
                type: 'escalation',
                title: 'Still Offline After Reset',
                message: 'Gateway still offline after fuse reset. Needs IoT team investigation.',
                severity: 'high',
                suggestedDiagnostic: 'R3 — Gateway offline'
            },
            'escalate-engineer': {
                type: 'escalation',
                title: 'Engineer Required',
                message: 'Gateway offline and basic troubleshooting hasn\'t resolved it.',
                severity: 'high',
                suggestedDiagnostic: 'R3 — Gateway offline'
            },
            'escalate-no-contact': {
                type: 'escalation',
                title: 'Cannot Contact Site',
                message: 'Unable to reach anyone at the site for troubleshooting. IoT team to follow up during business hours.',
                severity: 'medium'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Cannot Check Status',
                message: 'Unable to connect to ThingsBoard. Escalating to IoT team.',
                severity: 'high'
            }
        }
    },

    // ========================================================================
    // "IT'S FREEZING" — Problem Router (updated: routes to noHotWater now)
    // ========================================================================
    'its-freezing': {
        id: 'its-freezing',
        name: "It's Freezing",
        description: 'Customer reports cold — routes to heating, hot water, or AC',
        service: 'multi',
        icon: 'ac_unit',
        entryType: 'problem',
        states: {
            start: {
                type: 'question',
                title: "It's Freezing — What's Cold?",
                message: 'The customer is reporting it\'s too cold. Let\'s narrow down the issue.',
                options: [
                    { label: 'The building / room is cold (heating)', next: 'route-heating' },
                    { label: 'No hot water', next: 'route-dhw' },
                    { label: 'AC is blowing cold air', next: 'escalate-ac' },
                    { label: 'Not sure — general complaint', next: 'general-cold' }
                ]
            },
            'route-heating': {
                type: 'info',
                title: 'Routing to Heating Flow',
                redirectFlow: 'heating-too-cold'
            },
            'route-dhw': {
                type: 'info',
                title: 'Routing to Hot Water Flow',
                redirectFlow: 'no-hot-water'
            },
            'escalate-ac': {
                type: 'escalation',
                title: 'AC Issue — Cannot Change Remotely',
                message: 'OOH handlers cannot change AC modes or setpoints. Capturing details and escalating to IoT team.',
                severity: 'medium',
                summary: 'OOH: AC blowing cold at {siteName}. Handlers cannot change AC settings. Escalated to IoT team.',
                suggestedDiagnostic: 'R1 — AC mode/setpoint review'
            },
            'general-cold': {
                type: 'question',
                title: 'General Cold Complaint',
                message: 'Let\'s narrow it down. Where is the customer experiencing the cold?',
                options: [
                    { label: 'Main dining / bar area', next: 'route-heating' },
                    { label: 'Kitchen', next: 'route-heating' },
                    { label: 'Accommodation / rooms', next: 'route-heating' },
                    { label: 'Everywhere — whole building', next: 'route-heating' }
                ]
            }
        }
    },

    // ========================================================================
    // CONTRACTOR ESCALATION (kept for direct escalation use)
    // ========================================================================
    'contractor-escalation': {
        id: 'contractor-escalation',
        name: 'Direct Escalation',
        description: 'Direct escalation workflow — when issue is already understood',
        service: 'escalation',
        icon: 'engineering',
        entryType: 'escalation',
        states: {
            start: {
                type: 'question',
                title: 'Escalation Required',
                message: 'This issue needs to be escalated. How urgent is it?',
                options: [
                    { label: 'Critical — site cannot operate (P1)', next: 'p1-escalation' },
                    { label: 'Important — degraded service (P2)', next: 'p2-escalation' },
                    { label: 'Non-urgent — next business day (P3)', next: 'p3-escalation' }
                ]
            },
            'p1-escalation': {
                type: 'escalation',
                title: 'P1 — Critical Escalation',
                message: 'Critical escalation will notify the on-call IoT engineer immediately via SMS and email.',
                severity: 'critical',
                actions: ['sms', 'email'],
                timeout: 45,
                timeoutAction: 'auto-route-backup'
            },
            'p2-escalation': {
                type: 'escalation',
                title: 'P2 — Important Escalation',
                message: 'P2 escalation will email the IoT team with a 2-hour response target.',
                severity: 'high',
                actions: ['email'],
                timeout: 120,
                timeoutAction: 'auto-route-manager'
            },
            'p3-escalation': {
                type: 'resolution',
                title: 'P3 — Logged for Next Business Day',
                message: 'This has been logged for the IoT team to pick up on the next business day.',
                summary: 'OOH: P3 issue logged at {siteName}. {description}. For next business day review.'
            }
        }
    }
};

// ============================================================================
// Entry Point Categories (F013 — updated for all new/modified flows)
// ============================================================================

const OOH_ENTRY_POINTS = {
    hardware: {
        label: 'By Equipment Type',
        icon: 'devices',
        categories: [
            {
                label: 'Heating',
                icon: 'thermostat',
                flows: ['heating-too-cold', 'heating-stuck']
            },
            {
                label: 'Kitchen Equipment',
                icon: 'restaurant',
                flows: ['kitchen-equip', 'keeps-turning-off', 'ovens-grills']
            },
            {
                label: 'Hot Water',
                icon: 'water_drop',
                flows: ['no-hot-water']
            },
            {
                label: 'Lighting',
                icon: 'lightbulb',
                flows: ['external-lighting']
            },
            {
                label: 'Fridge / Freezer',
                icon: 'kitchen',
                flows: ['fridge-issue']
            },
            {
                label: 'Controls / Panels',
                icon: 'touch_app',
                flows: ['controls-issue']
            },
            {
                label: 'Gateway / Connectivity',
                icon: 'router',
                flows: ['gateway-offline']
            }
        ]
    },
    problem: {
        label: 'By Problem',
        icon: 'help_outline',
        categories: [
            {
                label: "It's freezing / too cold",
                icon: 'ac_unit',
                flows: ['its-freezing']
            },
            {
                label: "Won't turn on",
                icon: 'power_off',
                flows: ['wont-turn-on']
            },
            {
                label: 'Is this our equipment?',
                icon: 'verified',
                flows: ['scope-check']
            },
            {
                label: 'Something else / unsure',
                icon: 'contact_support',
                flows: ['something-else']
            }
        ]
    }
};
