/**
 * Pocket Changes Service
 *
 * Manages temporary device overrides with auto-revert timers.
 * Storage: Cosmos DB with local JSON file fallback.
 * On server restart: reloads pending reverts and re-registers timers.
 */

import { Router } from 'express';
import axios from 'axios';
import { getConfig, saveConfig, cosmosEnabled } from '../storage.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FALLBACK_FILE = join(__dirname, '..', 'data', 'pocket-changes.json');

const router = Router();
const READ_ONLY = process.env.READ_ONLY === 'true';

// In-memory map of active pocket changes with their revert timers
const activeChanges = new Map();

/**
 * Load pocket changes from persistent storage
 */
async function loadChanges() {
    try {
        const stored = await getConfig('pocket-changes');
        return stored?.changes || [];
    } catch {
        if (existsSync(FALLBACK_FILE)) {
            return JSON.parse(readFileSync(FALLBACK_FILE, 'utf8'));
        }
        return [];
    }
}

/**
 * Save pocket changes to persistent storage
 */
async function persistChanges(changes) {
    try {
        await saveConfig('pocket-changes', { id: 'pocket-changes', changes });
    } catch {
        writeFileSync(FALLBACK_FILE, JSON.stringify(changes, null, 2));
    }
}

/**
 * Register a revert timer for a pocket change
 */
function registerRevertTimer(change) {
    const now = Date.now();
    const revertAt = new Date(change.revertAt).getTime();
    const delay = Math.max(revertAt - now, 0);

    const timerId = setTimeout(async () => {
        console.log(`[POCKET] Auto-reverting change ${change.id}: ${change.description}`);
        try {
            // Execute the revert — calls the appropriate service
            await executeRevert(change);
            change.status = 'reverted';
            change.revertedAt = new Date().toISOString();
        } catch (err) {
            console.error(`[POCKET] Revert failed for ${change.id}: ${err.message}`);
            // Retry once after 60s
            setTimeout(async () => {
                try {
                    await executeRevert(change);
                    change.status = 'reverted';
                    change.revertedAt = new Date().toISOString();
                } catch (retryErr) {
                    console.error(`[POCKET] Revert retry failed for ${change.id}: ${retryErr.message}`);
                    change.status = 'failed';
                    change.failedAt = new Date().toISOString();
                    createRevertFailureTicket(change);
                }
                // Persist after retry attempt
                activeChanges.delete(change.id);
                const retryAll = await loadChanges();
                const retryIdx = retryAll.findIndex(c => c.id === change.id);
                if (retryIdx >= 0) retryAll[retryIdx] = change;
                await persistChanges(retryAll);
            }, 60000);
            return;
        }

        activeChanges.delete(change.id);
        const all = await loadChanges();
        const idx = all.findIndex(c => c.id === change.id);
        if (idx >= 0) all[idx] = change;
        await persistChanges(all);
    }, delay);

    activeChanges.set(change.id, { ...change, timerId });
}

/**
 * Execute the actual revert API call.
 * Dispatches to the appropriate service based on change.service.
 * Calls the local Express endpoints (same server) via localhost.
 */
async function executeRevert(change) {
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    const original = change.originalValue;

    console.log(`[POCKET] Reverting: service=${change.service}, device=${change.deviceId}, ` +
        `originalValue=${JSON.stringify(original)}`);

    switch (change.service) {
        case 'salus': {
            const accountId = change.accountId || change.deviceId?.split('/')[0];
            const deviceId = change.deviceId?.split('/').pop() || change.deviceId;
            await axios.post(`${baseUrl}/api/salus/${accountId}/devices/${deviceId}/setpoint`, {
                temperature: original?.temperature,
                reason: `Auto-revert from pocket change ${change.id}`
            }, { timeout: 15000 });
            break;
        }
        case 'tuya': {
            const commands = original?.commands || [{ code: 'switch_1', value: original?.switchState ?? false }];
            await axios.post(`${baseUrl}/api/tuya/devices/${change.deviceId}/switch`, {
                commands
            }, { timeout: 15000 });
            break;
        }
        case 'intesis': {
            await axios.post(`${baseUrl}/api/intesis/set`, {
                deviceId: change.deviceId,
                commands: original || {}
            }, { timeout: 15000 });
            break;
        }
        default:
            console.warn(`[POCKET] No revert handler for service: ${change.service}`);
    }
}

/**
 * Create a P1 review ticket in Zendesk when a revert fails
 */
async function createRevertFailureTicket(change) {
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    try {
        await axios.post(`${baseUrl}/api/zendesk/tickets.json`, {
            ticket: {
                subject: `[AUTO] Pocket change revert FAILED — ${change.description}`,
                comment: {
                    body: `An automatic revert failed and requires manual attention.\n\n` +
                        `Pocket Change ID: ${change.id}\n` +
                        `Service: ${change.service}\n` +
                        `Device: ${change.deviceId}\n` +
                        `Original Value: ${JSON.stringify(change.originalValue)}\n` +
                        `New Value: ${JSON.stringify(change.newValue)}\n` +
                        `Reason: ${change.reason}\n` +
                        `Created: ${change.createdAt}\n` +
                        `Failed At: ${change.failedAt}\n\n` +
                        `Please manually revert this change.`,
                    public: false
                },
                priority: 'high',
                tags: ['ooh', 'pocket-change', 'revert-failed', 'auto-generated']
            }
        }, { timeout: 15000 });
        console.log(`[POCKET] Created P1 review ticket for failed revert: ${change.id}`);
    } catch (err) {
        console.error(`[POCKET] Failed to create review ticket: ${err.message}`);
    }
}

/**
 * Initialise: reload pending changes from storage and re-register timers
 */
async function initPocketChanges() {
    const changes = await loadChanges();
    const pending = changes.filter(c => c.status === 'active');
    let restored = 0;

    for (const change of pending) {
        const revertAt = new Date(change.revertAt).getTime();
        if (revertAt > Date.now()) {
            registerRevertTimer(change);
            restored++;
        } else {
            // Expired while server was down — execute revert now
            change.status = 'expired-reverted';
            change.revertedAt = new Date().toISOString();
            try {
                await executeRevert(change);
                change.status = 'reverted';
            } catch {
                change.status = 'failed';
            }
        }
    }

    if (restored > 0) {
        console.log(`[POCKET] Restored ${restored} pending revert timer(s)`);
    }
    await persistChanges(changes);
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/pocket-changes/status — Service health
 */
router.get('/status', (req, res) => {
    res.json({
        service: 'pocket-changes',
        available: true,
        activeCount: activeChanges.size,
        storage: cosmosEnabled ? 'cosmos' : 'local-files'
    });
});

/**
 * GET /api/pocket-changes — Active overrides with countdown
 */
router.get('/', async (req, res) => {
    try {
        const changes = await loadChanges();
        const active = changes.filter(c => c.status === 'active').map(c => ({
            ...c,
            remainingMs: Math.max(new Date(c.revertAt).getTime() - Date.now(), 0)
        }));
        res.json({ changes: active, total: active.length });
    } catch (err) {
        console.error(`[POCKET] Load failed: ${err.message}`);
        res.status(500).json({ error: err.message, service: 'pocket-changes' });
    }
});

/**
 * GET /api/pocket-changes/history — All changes including completed
 */
router.get('/history', async (req, res) => {
    try {
        const changes = await loadChanges();
        res.json({ changes, total: changes.length });
    } catch (err) {
        res.status(500).json({ error: err.message, service: 'pocket-changes' });
    }
});

/**
 * POST /api/pocket-changes — Register a new pocket change with auto-revert
 * Body: {
 *   service: "salus"|"tuya"|"intesis",
 *   deviceId: "...",
 *   description: "Boosted heating to 21°C at The Red Lion",
 *   newValue: { temperature: 21 },
 *   originalValue: { temperature: 18 },
 *   revertAfterMinutes: 120,
 *   reason: "Customer reported too cold",
 *   agentName: "...",
 *   ticketId: 12345
 * }
 */
router.post('/', async (req, res) => {
    if (READ_ONLY) {
        return res.json({ _readOnly: true, message: 'Read-only mode — pocket change not registered' });
    }

    try {
        const { service, deviceId, description, newValue, originalValue,
            revertAfterMinutes, reason, agentName, ticketId } = req.body;

        if (!service || !deviceId || !revertAfterMinutes) {
            return res.status(400).json({ error: 'service, deviceId, and revertAfterMinutes required' });
        }

        const change = {
            id: `pc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            service,
            deviceId,
            description: description || `${service} change on ${deviceId}`,
            newValue,
            originalValue,
            reason,
            agentName,
            ticketId,
            status: 'active',
            createdAt: new Date().toISOString(),
            revertAt: new Date(Date.now() + revertAfterMinutes * 60 * 1000).toISOString(),
            revertAfterMinutes
        };

        // Persist
        const changes = await loadChanges();
        changes.push(change);
        await persistChanges(changes);

        // Register timer
        registerRevertTimer(change);

        console.log(`[POCKET] Registered: ${change.id} — reverts at ${change.revertAt}`);
        res.json({ success: true, change });
    } catch (err) {
        console.error(`[POCKET] Create failed: ${err.message}`);
        res.status(500).json({ error: err.message, service: 'pocket-changes' });
    }
});

/**
 * POST /api/pocket-changes/:id/cancel — Cancel a pending revert
 */
router.post('/:id/cancel', async (req, res) => {
    try {
        const { id } = req.params;
        const entry = activeChanges.get(id);
        if (!entry) {
            return res.status(404).json({ error: 'Pocket change not found or already completed' });
        }

        clearTimeout(entry.timerId);
        activeChanges.delete(id);

        const changes = await loadChanges();
        const change = changes.find(c => c.id === id);
        if (change) {
            change.status = 'cancelled';
            change.cancelledAt = new Date().toISOString();
            change.cancelledBy = req.body.agentName || 'unknown';
            await persistChanges(changes);
        }

        console.log(`[POCKET] Cancelled: ${id}`);
        res.json({ success: true, id });
    } catch (err) {
        console.error(`[POCKET] Cancel failed: ${err.message}`);
        res.status(500).json({ error: err.message, service: 'pocket-changes' });
    }
});

/**
 * POST /api/pocket-changes/:id/extend — Extend revert timer
 * Body: { additionalMinutes: 60 }
 */
router.post('/:id/extend', async (req, res) => {
    try {
        const { id } = req.params;
        const { additionalMinutes } = req.body;
        if (!additionalMinutes) {
            return res.status(400).json({ error: 'additionalMinutes required' });
        }

        const entry = activeChanges.get(id);
        if (!entry) {
            return res.status(404).json({ error: 'Pocket change not found or already completed' });
        }

        // Cancel old timer
        clearTimeout(entry.timerId);
        activeChanges.delete(id);

        // Update revert time
        const changes = await loadChanges();
        const change = changes.find(c => c.id === id);
        if (change) {
            change.revertAt = new Date(
                new Date(change.revertAt).getTime() + additionalMinutes * 60 * 1000
            ).toISOString();
            await persistChanges(changes);
            registerRevertTimer(change);
        }

        console.log(`[POCKET] Extended: ${id} by ${additionalMinutes} minutes`);
        res.json({ success: true, id, newRevertAt: change?.revertAt });
    } catch (err) {
        console.error(`[POCKET] Extend failed: ${err.message}`);
        res.status(500).json({ error: err.message, service: 'pocket-changes' });
    }
});

// Initialise on import (non-blocking)
initPocketChanges().catch(err => {
    console.warn(`[POCKET] Init failed: ${err.message}`);
});

export default router;
