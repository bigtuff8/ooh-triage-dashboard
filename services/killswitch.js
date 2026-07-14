/**
 * Runtime write kill-switch (F016, CR-05/TQ-4).
 *
 * Global and per-site, persisted in OohAppConfig so it survives restarts and is
 * shared across replicas. Engaging requires a reason + actor; both render in the
 * global banner and the audit trail. Reads always continue.
 */

import { config } from '../config.js';
import { collection } from './store.js';

const DOC_ID = 'killswitch';

async function getDoc() {
    const col = await collection('OohAppConfig');
    return (await col.get(DOC_ID)) || {
        id: DOC_ID,
        OohWriteKillSwitchGlobal: false,
        OohKillSwitchReason: null,
        OohKillSwitchActor: null,
        OohKillSwitchAt: null,
        OohWriteKillSwitchSiteList: {} // siteNo -> { reason, actor, at }
    };
}

/**
 * Returns null when writes are allowed, or a human-readable blocking reason.
 */
export async function writesBlocked(siteNo) {
    // F005 — deploy-time lock. Checked FIRST and synchronously (no Cosmos read), so a device
    // write cannot fire at first live boot / during the canary regardless of runtime state.
    if (config.writesDisabled) {
        return 'Device control is disabled at deploy time (WRITES_DISABLED) — safety/canary lock';
    }
    const doc = await getDoc();
    if (doc.OohWriteKillSwitchGlobal) {
        return `Device control is switched off globally${doc.OohKillSwitchReason ? ` — ${doc.OohKillSwitchReason} (${doc.OohKillSwitchActor})` : ''}`;
    }
    if (siteNo && doc.OohWriteKillSwitchSiteList[siteNo]) {
        const s = doc.OohWriteKillSwitchSiteList[siteNo];
        return `Device control is switched off for this site — ${s.reason} (${s.actor})`;
    }
    return null;
}

/**
 * Current kill-switch state for the banner and Admin page.
 */
export async function killSwitchState() {
    const doc = await getDoc();
    return {
        // F005 deploy-time lock — reported so the banner and canary can prove it is engaged
        writesDisabled: config.writesDisabled,
        global: doc.OohWriteKillSwitchGlobal,
        reason: doc.OohKillSwitchReason,
        actor: doc.OohKillSwitchActor,
        at: doc.OohKillSwitchAt,
        sites: doc.OohWriteKillSwitchSiteList
    };
}

/**
 * Sets the global kill-switch. Engaging requires a reason.
 */
export async function setGlobal(enabled, reason, actor) {
    if (enabled && !reason?.trim()) throw Object.assign(new Error('A reason is required to disable device writes'), { status: 400 });
    const col = await collection('OohAppConfig');
    const doc = await getDoc();
    doc.OohWriteKillSwitchGlobal = enabled;
    doc.OohKillSwitchReason = enabled ? reason.trim() : null;
    doc.OohKillSwitchActor = enabled ? actor : null;
    doc.OohKillSwitchAt = enabled ? new Date().toISOString() : null;
    await col.upsert(doc);
    console.warn(`[KILLSWITCH] Global writes ${enabled ? 'DISABLED' : 're-enabled'} by ${actor}${enabled ? ` — ${reason}` : ''}`);
}

/**
 * Sets a per-site kill-switch. Engaging requires a reason.
 */
export async function setSite(siteNo, enabled, reason, actor) {
    if (enabled && !reason?.trim()) throw Object.assign(new Error('A reason is required to disable device writes'), { status: 400 });
    const col = await collection('OohAppConfig');
    const doc = await getDoc();
    if (enabled) doc.OohWriteKillSwitchSiteList[siteNo] = { reason: reason.trim(), actor, at: new Date().toISOString() };
    else delete doc.OohWriteKillSwitchSiteList[siteNo];
    await col.upsert(doc);
    console.warn(`[KILLSWITCH] Site ${siteNo} writes ${enabled ? 'DISABLED' : 're-enabled'} by ${actor}`);
}
