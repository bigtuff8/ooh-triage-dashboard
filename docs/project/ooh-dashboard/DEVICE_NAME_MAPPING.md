# IoT OOH Triage — Device Name Mapping

**Purpose:** Map ThingsBoard device types and naming conventions to plain English labels for the OOH Triage UI.
**Status:** APPROVED — decisions confirmed 2026-03-27
**Source data:** 10 GK sites surveyed (384 devices), representing Farmhouse Inns and Flaming Grill brands
**Date:** 2026-03-27

---

## How TB Device Names Work

ThingsBoard device names follow the pattern: `gk-{sitename}-{equipment}-{number}`

Examples:
- `gk-silkwoodfarm-fryer-2a` → Fryer 2A at Silkwood Farm
- `gk-6360-externallighting-1` → External Lighting 1 at site 6360
- `gk_silkwoodfarm_salus_STA10108784 (5199-f-3)` → Salus Thermostat (front-of-house zone 3) at Silkwood Farm

The site prefix and number suffix should be stripped. The equipment name in the middle is what we translate.

---

## Proposed Mapping

### Kitchen Equipment

| TB Device Type | TB Name Pattern | Proposed Display Name | L1 Category | Notes |
|----------------|----------------|----------------------|-------------|-------|
| `fryerMonitoringProfile` | `fryer-1`, `fryer-2a` | **Fryer 1**, **Fryer 2A** | Kitchen Appliance | Most sites have 2-5 fryers. Keep the number. |
| `fryerMonitoringProfile` | `pastacooker-1` | **Pasta Cooker 1** | Kitchen Appliance | Same monitoring profile as fryers |
| `ovenMonitoringProfile` | `combioven-1` | **Combi Oven 1** | Kitchen Appliance | Rational/Unox combination ovens |
| `ovenMonitoringProfile` | `presteamer-1` | **Pre-Steamer 1** | Kitchen Appliance | Steam injection pre-cooking unit |
| `unoxDevice` | `CARVERY` | **Carvery Oven** | Kitchen Appliance | Unox connected oven, typically at carvery stations |
| `meterOnlyProfile` | `bainmarie-1` | **Bain Marie 1** | Kitchen Appliance | Hot food holding — metered only, no remote control |
| `meterOnlyProfile` | `heatedgantry-1` | **Heated Gantry 1** | Kitchen Appliance | Pass/service heated shelf |
| `meterOnlyProfile` | `hotcupboard` | **Hot Cupboard** | Kitchen Appliance | Plate/cup warming cabinet |
| `meterOnlyProfile` | `cookandhold-1` | **Cook & Hold 1** | Kitchen Appliance | Low-temp cooking/holding cabinet |
| `meterOnlyProfile` | `griddle-1` | **Griddle 1** | Kitchen Appliance | Flat-top griddle |
| `meterOnlyProfile` | `rfgrill-1` | **Rise & Fall Grill 1** | Kitchen Appliance | Adjustable-height overhead grill |
| `meterOnlyProfile` | `solidtop-1` | **Solid Top Range 1** | Kitchen Appliance | Cast-iron hob/range cooker |
| `meterOnlyProfile` | `convectionoven-1` | **Convection Oven 1** | Kitchen Appliance | Fan-assisted oven |
| `meterOnlyProfile` | `highspeedoven-1` | **High Speed Oven 1** | Kitchen Appliance | Merrychef-style rapid oven |
| `meterOnlyProfile` | `boilingtop-1` | **Boiling Top 1** | Kitchen Appliance | Gas/electric boiling rings |
| `meterOnlyProfile` | `chiller-1` | **Blast Chiller 1** | Kitchen Appliance | Rapid cooling unit |
| `tuya Profile` | `fryer-1` | **Fryer 1** (smart switch) | Kitchen Appliance | Tuya-controlled via smart switch |
| `tuya Profile` | `grill-1` | **Grill 1** (smart switch) | Kitchen Appliance | |
| `tuya Profile` | `merrychef-1` | **Merrychef 1** (smart switch) | Kitchen Appliance | High-speed microwave/convection oven |
| `tuya Profile` | `coffeemachine-1` | **Coffee Machine 1** (smart switch) | Kitchen Appliance | |
| `tuya Profile` | `bainmarie-1` | **Bain Marie 1** (smart switch) | Kitchen Appliance | |
| `tuya Profile` | `heatedgantry-1` | **Heated Gantry 1** (smart switch) | Kitchen Appliance | |
| `tuya Profile` | `hcupboard-1` | **Hot Cupboard 1** (smart switch) | Kitchen Appliance | |
| `tuya Profile` | `cookandhold-1` | **Cook & Hold 1** (smart switch) | Kitchen Appliance | |

### Warewash

| TB Device Type | TB Name Pattern | Proposed Display Name | L1 Category | Notes |
|----------------|----------------|----------------------|-------------|-------|
| `warewashMonitoringProfile` | `dishwasher-1` | **Dishwasher 1** | Warewash | Full monitoring (temp, cycles) |
| `warewashMonitoringProfile` | `glasswasher-1` | **Glasswasher 1** | Warewash | |
| `directLoraMeterProfile` | `glasswasher-1` | **Glasswasher 1** (LoRa) | Warewash | Direct LoRa metering — older install |
| `tuya Profile` | `dishwasher-1` | **Dishwasher 1** (smart switch) | Warewash | Tuya-controlled |

### Heating & Hot Water

| TB Device Type | TB Name Pattern | Proposed Display Name | L1 Category | Notes |
|----------------|----------------|----------------------|-------------|-------|
| `salusDevice` | `salusit700-1` | **Heating Zone** (+ zone label from Salus) | Heating | IT700 thermostat — controls a heating zone |
| `salusDevice` | `salusit700-gateway-1` | **Heating Gateway** | Heating | Salus gateway — connects thermostats to cloud |
| `salusDevice` | `salus_STA...` | **Heating Zone** (+ Salus serial) | Heating | Older naming convention, same device |
| `boilerControl` | `boilercontrol-1` | **Boiler Controller** | Heating | Central heating/DHW boiler monitoring |
| `heatingHotWaterMonitoringProfile` | `hhw-1` | **Hot Water System 1** | Heating | Heating & hot water combined monitoring |
| `tuya Profile` | `immersion-1` | **Immersion Heater 1** (smart switch) | Heating | Backup/accommodation hot water |
| `tuya Profile` | `accomdhw-1` | **Accommodation Hot Water** (smart switch) | Heating | Dedicated accommodation DHW |

### Ventilation

| TB Device Type | TB Name Pattern | Proposed Display Name | L1 Category | Notes |
|----------------|----------------|----------------------|-------------|-------|
| `tuya Profile` | `extractfan-1` | **Kitchen Extract Fan 1** | Ventilation | Smart-switched extraction |
| `tuya Profile` | `supplyfan-1` | **Kitchen Supply Fan 1** | Ventilation | Make-up air supply fan |
| `tuya Profile` | `loftfan-1` | **Loft Ventilation Fan** | Ventilation | Roof space ventilation |
| `tuya Profile` | `barfan-1` | **Bar Area Fan** | Ventilation | Bar ventilation/cooling |
| `meterOnlyProfile` | `extractfan-1` | **Kitchen Extract Fan 1** (metered) | Ventilation | Metered only at older sites |

### Refrigeration

| TB Device Type | TB Name Pattern | Proposed Display Name | L1 Category | Notes |
|----------------|----------------|----------------------|-------------|-------|
| `fridge and freezer profile` | `fridge-1` | **Fridge 1** | Refrigeration | Temperature monitoring + door alerts |
| `fridge and freezer profile` | `freezer-1` | **Freezer 1** | Refrigeration | |
| `cellar profile` | `cellar-1` | **Beer Cellar** | Refrigeration | Cellar temperature monitoring |
| `door profile` | `cellar-1door` | **Cellar Door Sensor** | Refrigeration | Door open/close monitoring |
| `door profile` | `freezer-1door` | **Freezer Door Sensor** | Refrigeration | |
| `door profile` | `fridge-2door` | **Fridge 2 Door Sensor** | Refrigeration | |
| `tuya Profile` | `freezer-1` | **Freezer 1** (smart switch) | Refrigeration | Tuya-controlled at newer sites |

### Air Conditioning

| TB Device Type | TB Name Pattern | Proposed Display Name | L1 Category | Notes |
|----------------|----------------|----------------------|-------------|-------|
| `airConditioningProfile` | `ac-1` | **AC Unit 1** | HVAC | Full monitoring + control via Intesis |

### External (Lighting & Heating)

| TB Device Type | TB Name Pattern | Proposed Display Name | L1 Category | Notes |
|----------------|----------------|----------------------|-------------|-------|
| `tuya Profile` | `externallighting-1` | **External Lights 1** | External | Car park, entrance, festoon lighting |
| `tuya Profile` | `externalheating-1` | **Patio Heater 1** | External | Outdoor terrace/beer garden heaters |
| `tuya Profile` | `overdoorheater-1` | **Over-Door Heater 1** | External | Entrance draught-prevention heaters |
| `tuya Profile` | `outdoortv-1` | **Outdoor TV** | External | Weatherproof garden/terrace TV |
| `meterOnlyProfile` | `hlamps-1` | **Heat Lamp 1** | External | Carvery/pass heat lamps (metered) |
| `meterOnlyProfile` | `hmat-1` | **Heated Mat** | External | Entrance heated anti-slip mats |

### Environmental Sensors

| TB Device Type | TB Name Pattern | Proposed Display Name | L1 Category | Notes |
|----------------|----------------|----------------------|-------------|-------|
| `roof profile` | `roof-1` | **Roof Sensor 1** | Sensors | External temperature/weather monitoring |
| `ambientTempMonitoringProfile` | `kitchen-temp` | **Kitchen Temperature** | Sensors | Ambient kitchen temperature |
| `ambientTempMonitoringProfile` | `cellar-temp` | **Cellar Temperature** | Sensors | Ambient cellar temperature |

### Networking & Infrastructure

| TB Device Type | TB Name Pattern | Proposed Display Name | L1 Category | Notes |
|----------------|----------------|----------------------|-------------|-------|
| `R10A Modbus Gateway` | `kitchen-r10a` | **Kitchen Gateway** | Networking | R10A gateway — connects kitchen devices |
| `R10A Modbus Gateway` | `cellar-r10a` | **Cellar Gateway** | Networking | |
| `R10A Modbus Gateway` | `ac-r10a` | **AC Gateway** | Networking | Connects AC units |
| `R10A Modbus Gateway` | `carvery-r10a` | **Carvery Gateway** | Networking | |
| `R10A Modbus Gateway` | `maindb-r10a` | **Main Distribution Board Gateway** | Networking | Primary site gateway |
| `remoteItProfile` | `maindb-r10a` | **Remote Access Gateway** | Networking | Remote.it VPN access to R10A |

### Metering & Utilities

| TB Device Type | TB Name Pattern | Proposed Display Name | L1 Category | Notes |
|----------------|----------------|----------------------|-------------|-------|
| `AMR_profile` | `ElecAMR-1` | **Electricity Meter** | Utilities | Automated Meter Reading |
| `AMR_profile` | `GasAMR-1` | **Gas Meter** | Utilities | |
| `meterOnlyProfile` | `maindb-1` | **Main Distribution Board** | Utilities | Electrical sub-metering |
| `meterOnlyProfile` | `kitchendb-1` | **Kitchen Distribution Board** | Utilities | |
| `meterOnlyProfile` | `bardb-1` | **Bar Distribution Board** | Utilities | |
| `meterOnlyProfile` | `cellardb-1` | **Cellar Distribution Board** | Utilities | |
| `meterOnlyProfile` | `pubdb-1` | **Pub Distribution Board** | Utilities | |
| `meterOnlyProfile` | `flatdb-1` | **Flat/Accommodation Distribution Board** | Utilities | |

---

## Name Transformation Rules

For the code implementation, the mapping follows these steps:

1. **Strip site prefix**: Remove `gk-{sitename}-` or `gk-{siteNo}-` or `gk_{sitename}_`
2. **Match equipment name** against the table above
3. **Keep the number suffix** (e.g., `-1`, `-2a`) and format as `#1`, `#2A`
4. **If no match**: Title-case the remaining name, replace hyphens with spaces

```javascript
// Example implementation
function friendlyDeviceName(tbName, tbType) {
    // Strip site prefix
    var name = tbName.replace(/^gk[-_][a-z]+[-_]/i, '').replace(/^gk[-_]\d+[-_]/i, '');

    // Extract number suffix
    var numMatch = name.match(/[-_](\d+[a-z]?)$/);
    var num = numMatch ? ' #' + numMatch[1].toUpperCase() : '';
    var base = name.replace(/[-_]\d+[a-z]?$/, '').replace(/[-_]/g, '');

    // Lookup table
    var map = {
        'fryer': 'Fryer', 'pastacooker': 'Pasta Cooker', 'combioven': 'Combi Oven',
        'presteamer': 'Pre-Steamer', 'bainmarie': 'Bain Marie', 'heatedgantry': 'Heated Gantry',
        'hotcupboard': 'Hot Cupboard', 'cookandhold': 'Cook & Hold', 'griddle': 'Griddle',
        'rfgrill': 'Rise & Fall Grill', 'solidtop': 'Solid Top Range', 'convectionoven': 'Convection Oven',
        'highspeedoven': 'High Speed Oven', 'boilingtop': 'Boiling Top', 'chiller': 'Blast Chiller',
        'merrychef': 'Merrychef', 'coffeemachine': 'Coffee Machine', 'hcupboard': 'Hot Cupboard',
        'dishwasher': 'Dishwasher', 'glasswasher': 'Glasswasher', 'glasswash': 'Glasswasher',
        'salusit700': 'Heating Zone', 'salusit700gateway': 'Heating Gateway',
        'boilercontrol': 'Boiler Controller', 'hhw': 'Hot Water System',
        'immersion': 'Immersion Heater', 'accomdhw': 'Accommodation Hot Water',
        'extractfan': 'Kitchen Extract Fan', 'supplyfan': 'Kitchen Supply Fan',
        'loftfan': 'Loft Fan', 'barfan': 'Bar Fan',
        'fridge': 'Fridge', 'freezer': 'Freezer', 'cellar': 'Beer Cellar',
        'ac': 'AC Unit', 'externallighting': 'External Lights',
        'externalheating': 'Patio Heater', 'overdoorheater': 'Over-Door Heater',
        'outdoortv': 'Outdoor TV', 'hlamps': 'Heat Lamp', 'hmat': 'Heated Mat',
        'roof': 'Roof Sensor', 'kitchentemp': 'Kitchen Temperature', 'cellartemp': 'Cellar Temperature',
        'ElecAMR': 'Electricity Meter', 'GasAMR': 'Gas Meter',
        'maindb': 'Main DB', 'kitchendb': 'Kitchen DB', 'bardb': 'Bar DB',
        'cellardb': 'Cellar DB', 'pubdb': 'Pub DB', 'flatdb': 'Flat DB', 'mainsdb': 'Mains DB'
    };

    return (map[base] || base.replace(/([a-z])([A-Z])/g, '$1 $2')) + num;
}
```

---

## OOH Relevance Filter

Not all devices are relevant to OOH handlers. The following should be **hidden** from the OOH Triage device panel:

| Hidden | Reason |
|--------|--------|
| `AMR_profile` (meters) | Utility metering — not actionable by OOH |
| `meterOnlyProfile` (distribution boards) | Electrical infrastructure — not actionable |
| `roof profile` (roof sensors) | Environmental data — not directly relevant to caller issues |
| `door profile` (door sensors) | Monitoring only — OOH can't close a door remotely |
| `remoteItProfile` | VPN access — internal engineering tool |
| `R10A Modbus Gateway` | Network infrastructure — OOH doesn't troubleshoot gateways directly |

**Show to OOH handlers:**
- All kitchen equipment (fryers, ovens, grills, etc.)
- Heating zones (Salus thermostats)
- Boiler controller
- Hot water systems
- Refrigeration (fridges, freezers, cellars)
- AC units
- External lighting and heating
- Ventilation fans (extract, supply)
- Coffee machines, Merrychefs

---

## Decisions (Confirmed 2026-03-27)

1. **Display names:** Approved as proposed
2. **Equipment list:** Complete — nothing missing
3. **Hidden devices:** Approved as listed (meters, DBs, roof sensors, door sensors, remote.it, gateways)
4. **"(smart switch)" suffix:** Hide it — keep names simple
5. **Salus zone codes:** Decode to plain English (e.g., `5199-f-3` → "Front of House Zone 3", `5199-r-1` → "Rear Zone 1")
