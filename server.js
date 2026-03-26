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
