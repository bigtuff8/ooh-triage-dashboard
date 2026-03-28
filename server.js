/**
 * OOH Triage Dashboard Server v${APP_VERSION}
 *
 * Express server providing:
 * - Static frontend for OOH triage UI
 * - Zendesk API proxy (ticket creation, comments, field options)
 * - IoT service proxies (ThingsBoard, Tuya, Salus, Intesis)
 * - Pocket change management (auto-revert temporary device changes)
 */

// dotenv MUST be imported first so .env vars are available to all modules
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import axios from 'axios';

// IoT Service Proxy Modules
import thingsboardRouter from './services/thingsboard.js';
import tuyaRouter from './services/tuya.js';
import salusRouter from './services/salus.js';
import intesisRouter from './services/intesis.js';
import pocketChangesRouter from './services/pocket-changes.js';

// Version from package.json — displayed in UI and health endpoint
const APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Zendesk configuration
const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const ZENDESK_EMAIL = process.env.ZENDESK_EMAIL;
const ZENDESK_API_TOKEN = process.env.ZENDESK_API_TOKEN;

if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
    console.error('ERROR: Missing Zendesk credentials in .env file');
    console.error('Required: ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN');
    process.exit(1);
}

const ZENDESK_BASE_URL = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;
const ZENDESK_AUTH = Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString('base64');

// Read-only mode: pulls live data but blocks all writes
const READ_ONLY = process.env.READ_ONLY === 'true';

// ============================================================================
// Middleware
// ============================================================================

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(join(__dirname, 'public')));

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { error: 'Too many requests — please wait a moment' }
});
app.use('/api/', apiLimiter);

// ============================================================================
// IoT Service Proxy Routes
// ============================================================================

app.use('/api/tb', thingsboardRouter);
app.use('/api/tuya', tuyaRouter);
app.use('/api/salus', salusRouter);
app.use('/api/intesis', intesisRouter);
app.use('/api/pocket-changes', pocketChangesRouter);

// ============================================================================
// Zendesk API Proxy — Tickets
// ============================================================================

/**
 * Create a new Zendesk ticket (from triage escalation or intake form)
 */
app.post('/api/zendesk/tickets.json', async (req, res) => {
    if (READ_ONLY) return res.json({ _readOnly: true, message: 'Read-only mode — ticket not created' });
    try {
        const response = await axios.post(`${ZENDESK_BASE_URL}/tickets.json`, req.body, {
            headers: { Authorization: `Basic ${ZENDESK_AUTH}`, 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (err) {
        console.error('[ZD] Create ticket failed:', err.response?.data || err.message);
        res.status(err.response?.status || 500).json({ error: 'Failed to create ticket' });
    }
});

/**
 * Update a Zendesk ticket (add comment, change status, etc.)
 */
app.put('/api/zendesk/tickets/:id.json', async (req, res) => {
    if (READ_ONLY) return res.json({ _readOnly: true, message: 'Read-only mode — ticket not updated' });
    try {
        const response = await axios.put(`${ZENDESK_BASE_URL}/tickets/${req.params.id}.json`, req.body, {
            headers: { Authorization: `Basic ${ZENDESK_AUTH}`, 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (err) {
        console.error('[ZD] Update ticket failed:', err.response?.data || err.message);
        res.status(err.response?.status || 500).json({ error: 'Failed to update ticket' });
    }
});

/**
 * Get a single ticket
 */
app.get('/api/zendesk/tickets/:id.json', async (req, res) => {
    try {
        const response = await axios.get(`${ZENDESK_BASE_URL}/tickets/${req.params.id}.json`, {
            headers: { Authorization: `Basic ${ZENDESK_AUTH}` }
        });
        res.json(response.data);
    } catch (err) {
        res.status(err.response?.status || 500).json({ error: 'Failed to get ticket' });
    }
});

/**
 * Get ticket comments
 */
app.get('/api/zendesk/tickets/:id/comments.json', async (req, res) => {
    try {
        const response = await axios.get(`${ZENDESK_BASE_URL}/tickets/${req.params.id}/comments.json`, {
            headers: { Authorization: `Basic ${ZENDESK_AUTH}` }
        });
        res.json(response.data);
    } catch (err) {
        res.status(err.response?.status || 500).json({ error: 'Failed to get comments' });
    }
});

// ============================================================================
// Zendesk API Proxy — Field Options (for site dropdown)
// ============================================================================

app.get('/api/zendesk/field-options/:fieldId', async (req, res) => {
    try {
        const allOptions = [];
        let url = `${ZENDESK_BASE_URL}/ticket_fields/${req.params.fieldId}/options.json?per_page=100`;
        while (url) {
            const response = await axios.get(url, {
                headers: { Authorization: `Basic ${ZENDESK_AUTH}` }
            });
            allOptions.push(...(response.data.custom_field_options || []));
            url = response.data.next_page || null;
        }
        res.json({ options: allOptions });
    } catch (err) {
        res.status(err.response?.status || 500).json({ error: 'Failed to get field options' });
    }
});

// ============================================================================
// Zendesk API Proxy — Search
// ============================================================================

app.get('/api/zendesk/search', async (req, res) => {
    try {
        const response = await axios.get(`${ZENDESK_BASE_URL}/search.json`, {
            params: req.query,
            headers: { Authorization: `Basic ${ZENDESK_AUTH}` }
        });
        res.json(response.data);
    } catch (err) {
        res.status(err.response?.status || 500).json({ error: 'Search failed' });
    }
});

// ============================================================================
// Health & Version
// ============================================================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: APP_VERSION,
        readOnly: READ_ONLY,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/version', (req, res) => {
    res.json({ version: APP_VERSION });
});

// ============================================================================
// Callback Lookup — Translation Layer + Composite Endpoint
// ============================================================================

// Status translation table (custom_status_id → agent/caller phrases)
const STATUS_TRANSLATIONS = {
    11404223315612: { name: 'New', agent: 'Just received — not yet picked up', caller: 'Your issue has been logged and our team will be picking it up shortly.' },
    25999053375260: { name: 'Triage', agent: 'Being assessed by the IoT team', caller: 'Your issue has been received and our team is working out the best way to resolve it.' },
    25999053444508: { name: 'Investigating', agent: 'Being actively investigated', caller: 'Our team is actively looking into this right now.' },
    25999037104284: { name: 'Monitoring', agent: 'Being monitored — waiting to see if it settles', caller: 'Our team has made some changes and is monitoring the situation to make sure it\'s resolved.' },
    25999056203932: { name: 'Awaiting Remote Fix', agent: 'A remote fix is being applied', caller: 'Our team is applying a fix remotely — this should take effect shortly.' },
    25999081452188: { name: 'Awaiting Customer Action', agent: 'Waiting for the site to do something', caller: 'We\'re waiting for someone on site to take an action. Has that been done?' },
    25999056357276: { name: 'Follow Up Check', agent: 'Scheduled for a follow-up check', caller: 'This is scheduled for a follow-up check by our team.' },
    25999056432284: { name: 'Escalated to EM', agent: 'Escalated to the engineering manager', caller: 'This has been escalated to our senior team for action.' },
    25999081650076: { name: 'Sent to Repairs Admin', agent: 'Passed to the repair contractor', caller: 'This has been referred to the maintenance contractor. They should be in touch to arrange a visit. Please be aware that any visit may be chargeable, as all our work goes through GK Repairs Admin.' },
    25999081709724: { name: 'Sent to Network', agent: 'Passed to the network engineering team', caller: 'This has been referred to our specialist engineering team for investigation.' },
    25999056633884: { name: 'Awaiting GK Repair', agent: 'Waiting for GK repair contractor to attend', caller: 'A repair contractor has been notified. They should be in touch to arrange a visit. Please be aware that any visit may be chargeable, as all our work goes through GK Repairs Admin.' },
    25999056690332: { name: 'Post-Repair LH Check', agent: 'Repair done — our team needs to re-check', caller: 'The contractor has been out and our team just needs to do a final check on our system.' },
    25999067648796: { name: 'Escalation Query', agent: 'Query raised during escalation', caller: 'There\'s a query being resolved before this can proceed — our team is on it.' },
    25999081991196: { name: 'Escalation Overdue', agent: 'Escalation is overdue — being chased', caller: 'This escalation is being chased — our team is following up.' },
    25999082641308: { name: 'Resolved', agent: 'Resolved', caller: 'This was marked as resolved.' },
    25999068372252: { name: 'Done', agent: 'Completed and closed', caller: 'This was completed and closed.' },
    25999038553244: { name: 'Closed', agent: 'Closed', caller: 'This ticket has been closed.' },
    26381319932188: { name: 'Customer Replied', agent: 'Caller has replied — being reviewed', caller: 'Your message has been received and our team will review it.' }
};

// Known team members (fallback if Zendesk user API is slow)
const TEAM_MEMBERS = {
    // These IDs would be populated on first use from Zendesk
};
const userCache = new Map();

async function resolveUser(userId) {
    if (!userId) return { name: 'Unassigned', role: null };
    if (userCache.has(userId)) return userCache.get(userId);
    try {
        const res = await axios.get(`${ZENDESK_BASE_URL}/users/${userId}.json`, {
            headers: { Authorization: `Basic ${ZENDESK_AUTH}` }
        });
        const user = { name: res.data.user.name, role: res.data.user.role };
        userCache.set(userId, user);
        return user;
    } catch {
        return { name: 'IoT team member', role: null };
    }
}

function friendlyTimeElapsed(dateStr) {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 5) return 'just now';
    if (mins < 30) return `${mins} minutes ago`;
    if (mins < 90) return 'about an hour ago';
    if (mins < 360) return `${Math.floor(mins / 60)} hours ago`;
    if (mins < 720) return 'earlier today';
    if (mins < 1440) return new Date(dateStr).getHours() < 12 ? 'this morning' : 'last night';
    if (mins < 2880) return 'yesterday';
    if (mins < 10080) return `${Math.floor(mins / 1440)} days ago`;
    return 'about a week ago';
}

function friendlyTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function translateComment(body) {
    if (!body) return '';
    let text = body
        .replace(/ThingsBoard|TB\b/gi, 'our monitoring system')
        .replace(/Tuya|Lighthouse|LH\b/gi, 'our control system')
        .replace(/Salus/gi, 'the thermostat system')
        .replace(/Dragino|gateway|R10[aA]/gi, "the site's communication box")
        .replace(/Tongou|[Pp]ower\s*[Pp]ause|[Cc]ontactor/g, 'the power control unit')
        .replace(/\[OOH POCKET CHANGE\]/g, 'OOH agent applied a temporary change:')
        .replace(/\[TRG\]/g, 'OOH agent:')
        .replace(/\[OOH CALLBACK\]/g, 'OOH follow-up:');
    // Truncate long comments
    if (text.length > 200) text = text.substring(0, 200) + '...';
    return text;
}

function buildScript(ticket, assignee, latestComment) {
    const status = STATUS_TRANSLATIONS[ticket.custom_status_id] || { caller: 'Our team is handling this.' };
    const created = friendlyTimeElapsed(ticket.created_at);
    const assigneePhrase = assignee.name === 'Unassigned'
        ? "It hasn't been assigned to a specific person yet."
        : `One of our team, ${assignee.name.split(' ')[0]}, is handling this.`;
    const activityPhrase = latestComment
        ? translateComment(latestComment.body)
        : 'There are no updates beyond the initial report.';

    // Detect if next business day is far away (weekend)
    const now = new Date();
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    const nextBizDay = isWeekend ? 'first thing on Monday morning' : 'first thing tomorrow morning';

    const isStale = (Date.now() - new Date(ticket.updated_at).getTime()) > 4 * 60 * 60 * 1000;

    let script = `I can see your issue was reported ${created}. ${assigneePhrase} ${status.caller}`;
    if (isStale && ticket.status === 'open') {
        script += ` It looks like there hasn't been an update for a while — I'm sorry about that. Let me flag this for attention now.`;
    }
    return script;
}

function buildOffers(ticket) {
    const offers = [];
    const isStale = (Date.now() - new Date(ticket.updated_at).getTime()) > 4 * 60 * 60 * 1000;
    const isResolved = ticket.status === 'solved' || ticket.status === 'closed';

    offers.push("I'll add a note to the ticket that you've called back so the team knows.");
    if (isStale && !isResolved) offers.push("I can raise the urgency on this if the situation has got worse.");
    if (isResolved) {
        offers.push("I can log a new issue linked to the original ticket if the problem has come back.");
    }
    return offers;
}

function buildActions(ticket) {
    const actions = ['addNote'];
    const isResolved = ticket.status === 'solved' || ticket.status === 'closed';
    if (!isResolved && ticket.priority !== 'urgent') actions.push('bumpPriority');
    if (!isResolved) actions.push('reEscalate');
    if (isResolved) actions.push('reportReturned');
    return actions;
}

/**
 * GET /api/zendesk/callback-lookup?site=TAG_VALUE&days=7
 * Composite endpoint: searches tickets, enriches with comments + assignee names, translates
 */
app.get('/api/zendesk/callback-lookup', async (req, res) => {
    try {
        const { site, days = 7 } = req.query;
        if (!site) return res.status(400).json({ error: 'site parameter required' });

        const daysAgo = new Date(Date.now() - (parseInt(days) * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const query = `type:ticket custom_field_11405878329244:${site} created>${daysAgo}`;

        const searchRes = await axios.get(`${ZENDESK_BASE_URL}/search.json`, {
            params: { query, sort_by: 'updated_at', sort_order: 'desc' },
            headers: { Authorization: `Basic ${ZENDESK_AUTH}` }
        });

        const tickets = searchRes.data.results || [];

        // Enrich each ticket
        const enriched = { active: [], resolved: [], closed: [] };

        for (const ticket of tickets.slice(0, 10)) {
            // Get latest comments
            let comments = [];
            try {
                const commRes = await axios.get(
                    `${ZENDESK_BASE_URL}/tickets/${ticket.id}/comments.json?per_page=5&sort_order=desc`,
                    { headers: { Authorization: `Basic ${ZENDESK_AUTH}` } }
                );
                comments = commRes.data.comments || [];
            } catch { /* skip */ }

            // Resolve assignee
            const assignee = await resolveUser(ticket.assignee_id);

            // Translate status
            const status = STATUS_TRANSLATIONS[ticket.custom_status_id] || {
                name: ticket.status, agent: ticket.status, caller: 'Our team is handling this.'
            };

            // Latest non-system comment
            const latestComment = comments.find(c => !c.body?.startsWith('This ticket was'));

            // Build timeline
            const timeline = [];
            timeline.push({ time: friendlyTime(ticket.created_at), event: 'Ticket created', detail: ticket.subject });
            if (assignee.name !== 'Unassigned') {
                timeline.push({ time: friendlyTime(ticket.updated_at), event: `Assigned to ${assignee.name}`, detail: null });
            }
            for (const comment of comments.slice(0, 3).reverse()) {
                if (comment.body?.startsWith('This ticket was')) continue;
                const author = await resolveUser(comment.author_id);
                timeline.push({
                    time: friendlyTime(comment.created_at),
                    event: author.name === assignee.name ? 'Investigation update' : `Update from ${author.name}`,
                    detail: translateComment(comment.body)
                });
            }

            const enrichedTicket = {
                id: ticket.id,
                subject: ticket.subject,
                status: { raw: ticket.status, customStatusId: ticket.custom_status_id, name: status.name, agent: status.agent, caller: status.caller },
                priority: { raw: ticket.priority, translated: ticket.priority === 'urgent' ? 'Critical (P1)' : ticket.priority === 'high' ? 'High (P2)' : ticket.priority === 'normal' ? 'Normal' : 'Low' },
                assignee: { id: ticket.assignee_id, name: assignee.name, role: assignee.role },
                created: ticket.created_at,
                updated: ticket.updated_at,
                createdFriendly: friendlyTimeElapsed(ticket.created_at),
                updatedFriendly: friendlyTimeElapsed(ticket.updated_at),
                latestActivity: latestComment ? {
                    summary: latestComment.body?.substring(0, 200),
                    translated: translateComment(latestComment.body),
                    timestamp: latestComment.created_at,
                    author: (await resolveUser(latestComment.author_id)).name
                } : null,
                timeline,
                script: buildScript(ticket, assignee, latestComment),
                offers: buildOffers(ticket),
                actions: buildActions(ticket)
            };

            if (ticket.status === 'closed') enriched.closed.push(enrichedTicket);
            else if (ticket.status === 'solved') enriched.resolved.push(enrichedTicket);
            else enriched.active.push(enrichedTicket);
        }

        res.json({
            site: { tag: site },
            tickets: enriched,
            totalFound: tickets.length,
            searchDays: parseInt(days)
        });
    } catch (err) {
        console.error('[ZD] Callback lookup failed:', err.response?.data || err.message);
        res.status(err.response?.status || 500).json({ error: 'Callback lookup failed' });
    }
});

// ============================================================================
// SPA Fallback
// ============================================================================

app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
    console.log(`OOH Triage Dashboard v${APP_VERSION} running on port ${PORT}`);
    console.log(`Read-only mode: ${READ_ONLY}`);
    console.log(`Zendesk: ${ZENDESK_SUBDOMAIN}.zendesk.com`);
});
