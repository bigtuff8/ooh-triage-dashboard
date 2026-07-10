/**
 * Shift notices + data-quality flags (Admin sections 4–5; register requirement 12).
 * Persisted in OohAppConfig.
 */

import { randomUUID } from 'crypto';
import { collection } from './store.js';

const NOTICES_ID = 'notices';
const DQ_ID = 'data-quality';

async function getDoc(id, empty) {
    const col = await collection('OohAppConfig');
    return (await col.get(id)) || { id, ...empty };
}

/**
 * Active notices for the handlers' New Call banner.
 */
export async function activeNotices() {
    const doc = await getDoc(NOTICES_ID, { items: [] });
    const now = new Date().toISOString();
    return doc.items.filter(n =>
        (!n.OohNoticeActiveFrom || n.OohNoticeActiveFrom <= now) &&
        (!n.OohNoticeActiveTo || n.OohNoticeActiveTo >= now)
    );
}

/**
 * All notices (Admin view).
 */
export async function allNotices() {
    return (await getDoc(NOTICES_ID, { items: [] })).items;
}

/**
 * Publishes a notice.
 */
export async function addNotice({ title, body, activeFrom, activeTo }, actor) {
    if (!title?.trim()) throw Object.assign(new Error('Notice title is required'), { status: 400 });
    const col = await collection('OohAppConfig');
    const doc = await getDoc(NOTICES_ID, { items: [] });
    doc.items.unshift({
        noticeId: randomUUID(),
        OohNoticeTitle: title.trim(),
        OohNoticeBody: (body || '').trim(),
        OohNoticeActiveFrom: activeFrom || null,
        OohNoticeActiveTo: activeTo || null,
        createdBy: actor,
        createdAt: new Date().toISOString()
    });
    await col.upsert(doc);
}

/**
 * Retires a notice.
 */
export async function retireNotice(noticeId) {
    const col = await collection('OohAppConfig');
    const doc = await getDoc(NOTICES_ID, { items: [] });
    doc.items = doc.items.filter(n => n.noticeId !== noticeId);
    await col.upsert(doc);
}

/**
 * Records an ambiguous-resolution / data-quality event (F004 follow-up trail).
 */
export async function addDataQualityFlag(text) {
    const col = await collection('OohAppConfig');
    const doc = await getDoc(DQ_ID, { items: [] });
    doc.items.unshift({ at: new Date().toISOString(), text });
    doc.items = doc.items.slice(0, 200);
    await col.upsert(doc);
}

/**
 * Data-quality flags for the Admin view.
 */
export async function dataQualityFlags() {
    return (await getDoc(DQ_ID, { items: [] })).items;
}
