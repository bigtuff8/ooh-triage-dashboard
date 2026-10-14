# RESEARCH-S7: re-sending when Desired already equals the value (OOHDASH-123, 2026-10-14)

Method: read-only prod ThingsBoard GETs (rule chain metadata, per-entity audit logs sliced by time window, attributes, telemetry history, estate attribute scan of 1,059 gk- Salus/AC/default devices). Credentials were loaded inside a script and never printed or stored. The doorbell secret in the gate's REST node was NOT copied. No writes of any kind.

## Question (verbatim)
S7: When Desired already equals the requested value but the device shows something else (6261: setpointDesired 19 since 24 Sep, room at 16.5), how should we re-send? Is clear-then-set safe through the gate?

## Verdict
- Does the gate fire on every Requested write? PROVEN yes.
- Does the bridge act on a repeated identical Requested? PROVEN yes (for the Tuya path it was seen on; Salus path is DEDUCED, medium).
- Is clear-then-set safe? Not needed, and an empty or "null" clear is rejected by the gate. PROVEN.
- 6261's stuck state has a different cause from the one we assumed: see section 3. PROVEN for the facts, DEDUCED for the cause.

## 1. The gate has no dedupe (PROVEN, rule chain source)
Rule chain "IoT Command Gate" (id 19b53ec0-c4b1-11f1-bf95-995fa7662af0), metadata read today:
- Entry filter is message type ATTRIBUTES_UPDATED only. No originator filter, no ts comparison, no "changed" filter, no get-attribute-then-compare node anywhere in the 21 nodes.
- "identify capability" only checks the value is non-empty and not "null".
- Both attribute writers ("write pending (SERVER)" and "write desired (SHARED)") are configured updateAttributesOnlyOnValueChange false with processing type ON_EVERY_MESSAGE, and the Desired writer has notifyDevice true. So pending and Desired are rewritten on every pass, even if the value is identical.
- The "ring doorbell" REST call is unconditional once freshness passes (or the ON-bypass applies) and the device is bridge-claimed (has vendor_device_id) or Tuya (has devId).

## 2. Real audit examples: identical Requested re-fires and gets a fresh bridge verdict (PROVEN)
Device ag-brackley-poweroutlet-6 (34321500-398f-11f1-be0a-ab8c63f251de), svc-control, SERVER_SCOPE audit entries (UTC):

| Time | Requested | Result written ~0.2 to 1.1 s later |
|---|---|---|
| 10 Oct 17:31:45 | true | rejected "vendor: No active Tuya session..." |
| 10 Oct 17:39:33 | true (identical) | rejected, same text (fresh verdict) |
| 12 Oct 07:27:57 | true | rejected "vendor: No active Tuya session..." |
| 12 Oct 07:37:13 | true (identical) | accepted |
| 12 Oct 09:40:39 | true | rejected "vendor: No active Tuya session..." |
| 12 Oct 09:50:30 | true (identical) | accepted |
| 12 Oct 10:28:27 | true (identical to 09:50) | accepted |
| 12 Oct 07:47:45 then 07:47:46 | false, then true, 1.1 s apart | both accepted |

What this proves:
- The TB save path emits ATTRIBUTES_UPDATED even when the value is unchanged (otherwise the chain would never have run for true after true).
- The bridge acts on the doorbell ring, not on a Desired value change: it produced a new vendor-layer outcome each time (a vendor call is evidently attempted, since a vendor-prefixed rejection arrives for an unchanged value, then the same value is accepted minutes later). This contradicts the older contract text "edge-triggered: re-writing the same value dispatches nothing" (OOH_TB_DIRECT_CONTROL_CONTRACT.md rule 1). That rule describes the direct Desired path, which the gate and doorbell replaced for gated devices.
- Limit: the Tuya path only. The audit shows no Salus setpoint Requested write anywhere I could reach (no setpointRequested key exists on any of the 1,059 scanned gk- Salus/AC/default devices). So Salus re-send via Requested is DEDUCED (medium): same chain, same doorbell branch (6261 carries vendor_id and vendor_device_id, which routes it to the doorbell), but the bridge's Salus command code is unseen and a Salus "synced" has never been observed (contract doc, 6 Oct).

## 3. What actually happened on 6261 (PROVEN facts)
Device gk-6261-salusit700-1 (4b3882d0-7b79-11f1-a25c-c7bd0b73b31f). No setpointRequested ever existed. Both writes were DIRECT SHARED_SCOPE setpointDesired writes by svc-control (the OOH app), bypassing the gate:
- 24 Sep 13:07:06.450 setpointDesired 20.5. Telemetry setpointSyncStatus=pending at 13:07:06.472 (22 ms later), then pending again at 13:08:07.024 with setpointReported=21.5.
- 24 Sep 13:23:31.246 setpointDesired 19. pending at 13:23:31.260, again at 13:24:31.597 with Reported=21.5.
- Nothing after: SyncStatus has been pending for 20 days and never reached synced or failed. heatingSetpoint stayed 21.5 for the rest of that day and the wall setPoint did not move to 19 or 20.5 afterwards; it has since swung many times by occupant use (21.5, 7.5, 25, 21 ... now 16.5 since 12 Oct 14:46).
- So the bridge reacted to a direct Desired change twice (immediate pending, one retry 60 s later reading the device at 21.5), then gave up leaving pending. The command never landed. This is a failed or never-confirmed delivery, not a "Desired equals request so nothing sent" problem. The mismatch (19 vs 16.5) is largely occupants having changed the wall unit since, which is normal and means Desired is a stale request, not a live target.
- Same pattern on gk-6832-salusit700-1: Desired 19 on 25 Sep 08:19, pending 08:19:02 and 08:20:03 (Reported 21), stuck pending.
- Contrast: gk-6835-salusit700-1, direct Desired 5 on 12 Oct 19:16:22 (after the 12 Oct claim stamping and gate regime) produced NO pending and no SyncStatus at all in 60 days. DEDUCED (medium): on the current regime a direct Desired write to a claimed device is silently ignored (the gate only listens for *Requested). Not provable without a write.

## 4. Quantification (cheap sweep only; the estate sweep agent owns the real count)
Of 1,059 gk- devices on profiles salusDevice, IT700TX, airConditioningProfile, default, only 6 carry any *Desired/*Requested key, all setpointDesired, none a Requested: 6261 (19, 24 Sep), 6832 (19, 25 Sep), 1648 (21, 25 Sep, written by a personal-account user), 6835 (5, 12 Oct), plus a test device gk-9999-salusit500-t1 (18, June). Two of them (6261, 6832) show the stuck-pending pattern in SyncStatus telemetry. Tuya, Intesis and other profiles were not scanned.

## 5. Answer to "how do we re-send, and is clear-then-set safe?"
- Re-send by writing the same <cap>Requested value again (SERVER_SCOPE). The gate will rewrite pending and Desired and ring the doorbell regardless of equality, and the bridge treats it as a new command (PROVEN on Tuya, DEDUCED on Salus). No clear step is needed.
- Clear-then-set is pointless and partly unsafe. Writing "" or "null" to Requested is rejected by the gate ("gate: malformed value") and sets SyncStatus rejected without touching Desired, so it only dirties the status the dashboard is reading. Deleting the Desired attribute needs a DELETE call (not through the gate, outside our contract, and a Desired deletion does not notify anything). Do not do either.
- Opposite-value then target (false then true, 1 s apart) is proven safe on Tuya (07:47:45/46, both accepted), but it would flip a real appliance and is only worthwhile as a last resort. For a setpoint, never bounce through a different temperature.
- The dashboard must stop using direct Desired writes for control (already recorded under S3). 6261 and 6832 will not recover until a Requested write is made.
- The dashboard's settle rule must treat the old pending (20 days) as stale: SyncStatus.lastUpdateTs must be at or after the Requested timestamp of THIS dispatch. A re-send overwrites the status to pending via the gate, so ts ordering is reliable.

## What this changes
- Matrix S7 closes: default becomes "re-send by rewriting <cap>Requested with the same value; no clear". It also records that Desired==requested is not a precondition for no-op on gated devices.
- Reframes 6261: the issue is an undelivered direct-Desired command that stuck pending (and later occupant changes), not dedupe. Design should show "last command 24 Sep never confirmed" as INDETERMINATE, with a re-send action.
- Contract doc OOH_TB_DIRECT_CONTROL_CONTRACT.md rule 1 (edge-triggered) is superseded for gated devices; CIR update recommended (not done: read-only brief).
- Need an idempotence guard on our side: since every Requested write re-fires a vendor command, the dashboard must debounce double-clicks (cost: every re-send is a real vendor API call and possibly a real relay or thermostat actuation).

## UNRESOLVED: residual questions for Spencer (one line each, our default)
- Q-S7a: Does the bridge's Salus setpoint path treat a Requested/doorbell with an unchanged value as a new command, and has any Salus command ever reached "synced"? Default: yes, re-send is allowed; prove in J8 on a bench Salus.
- Q-S7b: Why did direct setpointDesired writes on 24 and 25 Sep get pending twice (immediately and 60 s later) and then stall for 6261 and 6832, and is 6835's lack of any pending after 12 Oct 19:16 by design? Default: direct Desired is unsupported; use Requested.
- Q-S7c: Should stale pending (days old) be cleared by a bridge or TB job? Default: our own staleness limit marks it INDETERMINATE; a new Requested overwrites it.

## Sources
- TB prod GETs 2026-10-14: /api/ruleChain/19b53ec0-.../metadata; /api/audit/logs/entity/DEVICE/{34321500-...,4b3882d0-...} (sliced windows, long windows return a DB error 500); attributes and timeseries for 4b3882d0-... (6261), gk-6832, gk-6835, gk-1648; /api/tenant/devices paged scan.
- CIR: OOH_TB_DIRECT_CONTROL_CONTRACT.md (rule 1, prod status), THINGSBOARD_ALARM_ACCESS.md (auth path).
- C:/harness-runs/iot-ooh-dash/research/RESEARCH-S2-S3.md.
- Gaps: bridge source not found (gh code search unproductive; bridge repo not searched further); Teams, Jira, SharePoint not searched as the rule chain and audit were conclusive; Tuya, Intesis scan not done.
