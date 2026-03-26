/**
 * OOH Triage Flow Definitions
 *
 * Data-driven state machine for out-of-hours call handler triage.
 * Each flow is a map of state IDs → state objects.
 *
 * State types:
 *   question    — Agent picks an option → transitions to next state
 *   device_check — Calls an API, branches on result
 *   action      — Confirms + executes a write, registers pocket change
 *   info        — Display-only (script, scope info)
 *   escalation  — Triggers escalation workflow
 *   resolution  — End state (posts triage summary to Zendesk ticket)
 */

const TRIAGE_FLOWS = {

    // ========================================================================
    // Flow 1: Heating Too Cold (Salus)
    // Entry: Hardware → Heating → "Too cold"
    // ========================================================================
    'heating-too-cold': {
        id: 'heating-too-cold',
        name: 'Heating Too Cold',
        description: 'Customer reports heating is too cold — check zones, boost setpoint',
        service: 'salus',
        icon: 'thermostat',
        entryType: 'hardware',
        states: {
            start: {
                type: 'info',
                title: 'Heating Too Cold',
                message: 'Let\'s check the heating system at this site. First, we need to identify the zone.',
                next: 'select-zone'
            },
            'select-zone': {
                type: 'device_check',
                title: 'Loading Heating Zones',
                api: { method: 'GET', url: '/api/salus/{accountId}/devices' },
                dataCard: {
                    title: 'Heating Zones at {siteName}',
                    fields: ['zoneName', 'currentTemp', 'setpoint', 'mode']
                },
                onSuccess: 'review-zone',
                onEmpty: 'no-zones-found',
                fallback: 'escalate-no-data'
            },
            'review-zone': {
                type: 'question',
                title: 'Zone Status',
                message: 'Here are the current readings. What would you like to do?',
                options: [
                    { label: 'Boost temperature (+3°C for 2 hours)', next: 'confirm-boost' },
                    { label: 'Zone looks normal — issue may be elsewhere', next: 'escalate-engineer' },
                    { label: 'Equipment shows offline', next: 'escalate-offline' }
                ]
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
                summary: 'OOH: Applied +3°C heating boost at {siteName}, zone {zoneName}. Auto-reverts at {revertTime}. Reason: {reason}'
            },
            'no-zones-found': {
                type: 'escalation',
                title: 'No Zones Found',
                message: 'No heating zones found for this site in Salus. This may need IoT team investigation.',
                severity: 'medium'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Retrieve Data',
                message: 'Could not connect to the heating system. Escalating to IoT team.',
                severity: 'high'
            },
            'escalate-engineer': {
                type: 'escalation',
                title: 'Engineer Required',
                message: 'Zone readings appear normal but customer reports issue. Needs on-site investigation.',
                severity: 'medium'
            },
            'escalate-offline': {
                type: 'escalation',
                title: 'Equipment Offline',
                message: 'Heating equipment showing offline. This could indicate a power or connectivity issue.',
                severity: 'high'
            }
        }
    },

    // ========================================================================
    // Flow 2: Fryers Not On (Tuya)
    // Entry: Hardware → Kitchen Equipment → "Fryers not turning on"
    // ========================================================================
    'fryers-not-on': {
        id: 'fryers-not-on',
        name: 'Fryers Not Turning On',
        description: 'Kitchen fryers not powering on — check Tuya switch status, toggle if needed',
        service: 'tuya',
        icon: 'restaurant',
        entryType: 'hardware',
        states: {
            start: {
                type: 'info',
                title: 'Fryers Not Turning On',
                message: 'Let\'s check the smart switch controlling the fryers at this site.',
                next: 'check-switch'
            },
            'check-switch': {
                type: 'device_check',
                title: 'Checking Fryer Switch',
                api: { method: 'GET', url: '/api/tuya/devices/{deviceId}/status' },
                dataCard: {
                    title: 'Fryer Switch Status',
                    fields: ['switchState', 'lastUpdate']
                },
                branches: [
                    { condition: 'switchState === false', next: 'offer-switch-on' },
                    { condition: 'switchState === true', next: 'switch-already-on' }
                ],
                fallback: 'escalate-no-data'
            },
            'offer-switch-on': {
                type: 'question',
                title: 'Switch is OFF',
                message: 'The fryer switch is currently OFF. Would you like to turn it on remotely?',
                options: [
                    { label: 'Yes — turn on the fryers', next: 'confirm-switch-on' },
                    { label: 'No — escalate to IoT team', next: 'escalate-engineer' }
                ]
            },
            'confirm-switch-on': {
                type: 'action',
                title: 'Confirm Switch On',
                message: 'This will remotely turn on the fryer switch. Please confirm the customer is aware.',
                confirmLabel: 'Turn On Fryers',
                api: {
                    method: 'POST',
                    url: '/api/tuya/devices/{deviceId}/switch',
                    body: { commands: [{ code: 'switch_1', value: true }] }
                },
                next: 'switch-turned-on'
            },
            'switch-turned-on': {
                type: 'resolution',
                title: 'Fryers Switched On',
                message: 'The fryer switch has been turned on remotely. Ask the customer to confirm the fryers are warming up (may take 5-10 minutes).',
                summary: 'OOH: Remotely switched on fryers at {siteName}. Customer to confirm equipment warming.'
            },
            'switch-already-on': {
                type: 'question',
                title: 'Switch is Already ON',
                message: 'The smart switch shows as ON, but the fryers aren\'t working. This may be a physical equipment issue.',
                options: [
                    { label: 'Check the schedule', next: 'check-schedule' },
                    { label: 'Escalate — possible equipment fault', next: 'escalate-engineer' }
                ]
            },
            'check-schedule': {
                type: 'device_check',
                title: 'Checking Schedule',
                api: { method: 'GET', url: '/api/tuya/devices/{deviceId}/schedules' },
                dataCard: {
                    title: 'Fryer Schedule',
                    fields: ['scheduleName', 'time', 'action', 'enabled']
                },
                onSuccess: 'schedule-review',
                fallback: 'escalate-no-data'
            },
            'schedule-review': {
                type: 'info',
                title: 'Schedule Information',
                message: 'Here is the current schedule for this device. If the schedule looks correct, the issue may be physical.',
                next: 'escalate-engineer'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Retrieve Data',
                message: 'Could not connect to the Tuya platform. Escalating to IoT team.',
                severity: 'high'
            },
            'escalate-engineer': {
                type: 'escalation',
                title: 'Engineer Investigation Needed',
                message: 'Smart switch is working but equipment is not responding. Likely a physical fault.',
                severity: 'medium'
            }
        }
    },

    // ========================================================================
    // Flow 3: Equipment Turning Off Unexpectedly (Tuya)
    // Entry: Hardware → Kitchen Equipment → "Equipment keeps turning off"
    // ========================================================================
    'equipment-turning-off': {
        id: 'equipment-turning-off',
        name: 'Equipment Turning Off',
        description: 'Equipment keeps shutting down — check schedule conflicts',
        service: 'tuya',
        icon: 'power_off',
        entryType: 'hardware',
        states: {
            start: {
                type: 'info',
                title: 'Equipment Turning Off',
                message: 'The customer reports equipment is turning off unexpectedly. Let\'s check the schedule.',
                next: 'check-schedule'
            },
            'check-schedule': {
                type: 'device_check',
                title: 'Checking Device Schedule',
                api: { method: 'GET', url: '/api/tuya/devices/{deviceId}/schedules' },
                dataCard: {
                    title: 'Device Schedules',
                    fields: ['scheduleName', 'time', 'action', 'enabled', 'repeat']
                },
                onSuccess: 'review-schedule',
                fallback: 'escalate-no-data'
            },
            'review-schedule': {
                type: 'question',
                title: 'Schedule Review',
                message: 'Review the schedules above. Does a schedule appear to be causing the unwanted shutdowns?',
                options: [
                    { label: 'Yes — schedule is turning equipment off at wrong time', next: 'escalate-schedule-fix' },
                    { label: 'No — schedules look correct, issue is something else', next: 'escalate-engineer' },
                    { label: 'No schedules found — equipment may be faulty', next: 'escalate-engineer' }
                ]
            },
            'escalate-schedule-fix': {
                type: 'escalation',
                title: 'Schedule Adjustment Needed',
                message: 'A schedule appears to be turning off equipment at an incorrect time. IoT team to review and adjust.',
                severity: 'medium',
                summary: 'OOH: Equipment at {siteName} turning off due to schedule conflict. IoT team to review schedules.'
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Unable to Check Schedule',
                message: 'Could not retrieve schedule data. Escalating to IoT team.',
                severity: 'high'
            },
            'escalate-engineer': {
                type: 'escalation',
                title: 'Investigation Required',
                message: 'Schedules appear correct. Equipment shutdown may be caused by power issues or hardware fault.',
                severity: 'medium'
            }
        }
    },

    // ========================================================================
    // Flow 4: Is This Our Equipment? (ThingsBoard — Scope Check)
    // Entry: Problem-based → "Is this site/equipment ours?"
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
    // Flow 5: Gateway Offline (ThingsBoard)
    // Entry: Hardware → Gateway → "Gateway offline"
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
                message: 'The gateway is currently showing as ONLINE. It may have recovered, or there may be a delay in reporting.',
                summary: 'OOH: Gateway {deviceName} at {siteName} checked — currently online. Last activity: {lastActivityTime}.'
            },
            'gateway-confirmed-offline': {
                type: 'question',
                title: 'Gateway Confirmed Offline',
                message: 'The gateway is confirmed offline. Last seen: {lastActivityTime}. Let\'s try some troubleshooting.',
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
                message: 'The fuse has been reset. The gateway typically takes 2-5 minutes to reconnect. You can check the status again shortly.',
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
                severity: 'high'
            },
            'escalate-engineer': {
                type: 'escalation',
                title: 'Engineer Required',
                message: 'Gateway offline and basic troubleshooting hasn\'t resolved it. IoT team to investigate.',
                severity: 'high'
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
    // Flow 6: (Placeholder) Hot Water Issue
    // ========================================================================

    // ========================================================================
    // Flow 7: "It's Freezing" — Problem-Based Routing (Multi-Service)
    // Entry: Problem-based → "It's too cold / freezing"
    // ========================================================================
    'its-freezing': {
        id: 'its-freezing',
        name: "It's Freezing",
        description: 'Customer reports cold — routes to heating, DHW, or AC based on answers',
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
                    { label: 'No hot water (DHW)', next: 'route-dhw' },
                    { label: 'AC is blowing cold air', next: 'route-ac' },
                    { label: 'Not sure — general complaint', next: 'general-cold' }
                ]
            },
            'route-heating': {
                type: 'info',
                title: 'Routing to Heating Flow',
                message: 'Switching to the Heating Too Cold flow...',
                redirectFlow: 'heating-too-cold'
            },
            'route-dhw': {
                type: 'escalation',
                title: 'Hot Water Issue',
                message: 'Hot water issues typically require on-site investigation. Escalating to IoT team.',
                severity: 'medium',
                summary: 'OOH: Customer at {siteName} reports no hot water. Escalated for investigation.'
            },
            'route-ac': {
                type: 'info',
                title: 'AC Blowing Cold',
                message: 'If the AC is blowing cold air when it shouldn\'t be, we can check the Intesis AC Cloud.',
                next: 'check-ac'
            },
            'check-ac': {
                type: 'device_check',
                title: 'Checking AC Unit',
                api: { method: 'GET', url: '/api/intesis/config' },
                dataCard: {
                    title: 'AC Units',
                    fields: ['unitName', 'power', 'mode', 'setpoint', 'roomTemp']
                },
                onSuccess: 'ac-review',
                fallback: 'escalate-no-data'
            },
            'ac-review': {
                type: 'question',
                title: 'AC Status',
                message: 'Review the AC unit status above. What would you like to do?',
                options: [
                    { label: 'Switch AC to heating mode', next: 'escalate-ac-change' },
                    { label: 'Turn AC off (it\'s making it worse)', next: 'escalate-ac-change' },
                    { label: 'AC looks fine — issue is elsewhere', next: 'escalate-engineer' }
                ]
            },
            'escalate-ac-change': {
                type: 'escalation',
                title: 'AC Control Change Requested',
                message: 'AC mode change requested. This will be handled by the IoT team to ensure correct configuration.',
                severity: 'medium'
            },
            'general-cold': {
                type: 'question',
                title: 'General Cold Complaint',
                message: 'Let\'s narrow it down. Where is the customer experiencing the cold?',
                options: [
                    { label: 'Main dining / bar area', next: 'route-heating' },
                    { label: 'Kitchen', next: 'route-heating' },
                    { label: 'Specific room with AC unit', next: 'route-ac' },
                    { label: 'Everywhere — whole building', next: 'route-heating' }
                ]
            },
            'escalate-no-data': {
                type: 'escalation',
                title: 'Cannot Retrieve Data',
                message: 'Unable to check AC status. Escalating to IoT team.',
                severity: 'high'
            },
            'escalate-engineer': {
                type: 'escalation',
                title: 'Engineer Investigation',
                message: 'AC readings look normal. Issue needs on-site investigation.',
                severity: 'medium'
            }
        }
    },

    // ========================================================================
    // Flow 8: Contractor Escalation
    // Entry: Any flow → Escalation state → Full escalation workflow
    // ========================================================================
    'contractor-escalation': {
        id: 'contractor-escalation',
        name: 'Contractor Escalation',
        description: 'Full escalation workflow with notification, timeout, and routing',
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

// Entry point categories for the OOH landing page
const OOH_ENTRY_POINTS = {
    hardware: {
        label: 'By Equipment Type',
        icon: 'devices',
        categories: [
            {
                label: 'Heating',
                icon: 'thermostat',
                flows: ['heating-too-cold']
            },
            {
                label: 'Kitchen Equipment',
                icon: 'restaurant',
                flows: ['fryers-not-on', 'equipment-turning-off']
            },
            {
                label: 'Gateway / Connectivity',
                icon: 'router',
                flows: ['gateway-offline']
            },
            {
                label: 'Air Conditioning',
                icon: 'ac_unit',
                flows: []  // Will use intesis flow when built
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
                label: 'Is this our equipment?',
                icon: 'verified',
                flows: ['scope-check']
            },
            {
                label: 'Something else / unsure',
                icon: 'contact_support',
                flows: ['contractor-escalation']
            }
        ]
    }
};
