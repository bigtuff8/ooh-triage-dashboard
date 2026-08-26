# IoT OOH Triage — Equipment Image Catalogue

**Source:** Flaming Grill Scope of Works V1.0.pptx (extracted images)
**Location:** `OOH Dashboard/equipment-images/catalogued/`
**Date:** 2026-03-28
**Total:** 26 catalogued images

---

## Images Available — Mapped to Equipment & Flows

### Heating & Hot Water

| Image File | Shows | Use In Flow | Use In Device Panel |
|------------|-------|-------------|-------------------|
| `salus-it700-thermostat.png` | Salus IT700 programmable thermostat (LCD display showing 20.5°C) | tooCold (accommodation), controlsIssue (Salus blank), heatingStuck (Salus standby) | Heating Zone |
| `salus-receiver.png` | Salus receiver unit (Auto/Manual, On/Off switches) | controlsIssue (Salus), heatingStuck | Heating Gateway |
| `boiler-unit.jpeg` | Wall-mounted gas boiler (on-site photo with GAS labels) | noHotWater (boiler visual check) | Boiler Controller |
| `old-thermostat-dial.jpeg` | Old-style dial thermostat on wall (being replaced by Salus) | Reference only — shows what's being replaced | — |
| `honeywell-programmer.jpeg` | Honeywell programmer with LCD (being replaced) | Reference only — shows what's being replaced | — |

### Kitchen Equipment / PowerPause

| Image File | Shows | Use In Flow | Use In Device Panel |
|------------|-------|-------------|-------------------|
| `powerpause-sticker.jpeg` | PowerPause sticker with QR code — "The power to this appliance is controlled automatically" | kitchenEquip (PowerPause sticker check), ovensGrills | All PowerPause-controlled equipment |
| `lighthouse-qr-label.jpeg` | Lighthouse monitoring label — "This appliance is being monitored remotely" | Any flow referencing Lighthouse/QR | — |
| `tongou-wifi-switch.png` | Tongou TO-Q-SY1-JWT WiFi smart switch (DIN rail mount, 16A) | kitchenEquip (T2), externalLighting, keepsTurningOff | All Tuya-controlled devices |
| `isolator-switch.jpeg` | ESR rotary isolator switch (red/yellow, IP65) | kitchenEquip (interlock panel check) | — |
| `contactor-hager.jpeg` | Hager ESC 425 contactor (25A, DIN rail) | kitchenEquip (contactor fault) | — |

### External Lighting & Heating

| Image File | Shows | Use In Flow | Use In Device Panel |
|------------|-------|-------------|-------------------|
| `external-light.png` | LED external light fixture (pole-mounted) | externalLighting | External Lights |
| `sangamo-timeclock.jpeg` | Sangamo 24hr timeclock (being replaced by Tongou) | Reference — shows what Tongou replaces | — |

### Refrigeration & Cellar

| Image File | Shows | Use In Flow | Use In Device Panel |
|------------|-------|-------------|-------------------|
| `door-contact-sensor.png` | Magnetic door contact sensor (metal, surface mount) | fridgeIssue (door check) | Door Sensor |
| `lorawan-sensor-node.png` | Dragino SN50v3-LB LoRaWAN sensor node (with antenna) | fridgeIssue (T2 sensor data) | Temperature sensors |

### Networking & Infrastructure

| Image File | Shows | Use In Flow | Use In Device Panel |
|------------|-------|-------------|-------------------|
| `r10a-gateway.png` | R10A Modbus gateway (black, DIN rail, WiFi/4G/Ethernet) | gatewayOffline | Kitchen/Cellar/AC Gateway |
| `dragino-gateway.jpeg` | Dragino LoRaWAN gateway (white, dual antennas, "looks like a router") | gatewayOffline (fuse check — "small box with lights") | LoRaWAN Gateway |
| `pmac211-meter.png` | Pilot PMAC211 energy meter (DIN rail, LCD display) | — (infrastructure, not OOH relevant) | — |
| `distribution-board.jpeg` | Main distribution board (on-site photo, MCBs visible) | keepsTurningOff (MCB check), wontTurnOn (total power check) | — |
| `eaton-panel-board.jpeg` | Eaton Memshield 3 panel board (closed, door handle) | Reference — shows new panel board | — |
| `mcb-breaker.jpeg` | CHINT NB1-63 3-phase MCB (blue toggle) | kitchenEquip (MCB check), keepsTurningOff | — |
| `mcb-3phase.png` | RS PRO 3-phase MCB (grey toggle) | Same as above — variant | — |
| `electrical-enclosure.jpeg` | IP65 electrical enclosure (grey, wall-mount) | Reference — PowerPause panel housing | — |

### Warewash

| Image File | Shows | Use In Flow | Use In Device Panel |
|------------|-------|-------------|-------------------|
| `belimo-flow-meter.jpeg` | Belimo water flow meter (orange, inline) | — (warewash monitoring, not OOH relevant) | — |

### Branding

| Image File | Shows | Use In |
|------------|-------|--------|
| `lighthouse-logo.png` | Lighthouse logo (full size) | App branding, headers |
| `lighthouse-logo-small.png` | Lighthouse logo (compact) | Sidebar, badges |
| `site-labels-sheet.jpeg` | Full site label sheet showing all equipment names/panels | Reference — shows naming convention |

---

## Gaps — Images Still Needed

| Equipment | Why It's Needed | Source Suggestion |
|-----------|----------------|-------------------|
| **Interlock panel (green light/button)** | kitchenEquip flow — "Can you see a small panel with a green light and a green button?" | Photo from IoT team — any installed PowerPause interlock panel |
| **Boiler panel with error display** | noHotWater/controlsIssue — "Can you see any error codes on the display?" | Photo of a boiler with digital error display |
| **Salus IT700 icon legend** | controlsIssue — walk through Wi-Fi, battery, flame icons | Annotated screenshot/diagram of the IT700 display with icon labels |
| **Walk-in fridge/freezer (exterior)** | fridgeIssue — "monitoring only" scope context | On-site photo or stock image |
| **Patio heater** | externalHeating flow | Stock image of typical pub patio heater |
| **Festoon lighting** | externalLighting flow — "festoon" reference | Stock image of festoon/outdoor string lighting |

---

## Implementation Plan

1. Copy `catalogued/` folder to `ooh-triage-dashboard/public/images/equipment/`
2. Update triage flows to reference images where relevant (e.g., show Salus thermostat photo during controlsIssue walkthrough)
3. Add images to device panel tooltips/expandable sections
4. For gaps: request photos from IoT team or source appropriate stock images
