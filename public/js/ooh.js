/**
 * OOH (Out of Hours) Triage Module
 *
 * Provides a guided triage interface for OOH call handlers.
 * Uses a JSON-driven state machine (triage-flows.js) to walk agents through
 * diagnostic and device control flows.
 *
 * Depends on: triage-flows.js (loaded before this file), app.js (state, api, showView)
 */

// ============================================================================
// OOH State
// ============================================================================

// Global action handler map — keyed by message index, referenced by onclick in rendered HTML
const oohChatActions = {};

const oohState = {
    currentFlow: null,          // Active flow ID (e.g. 'heating-too-cold')
    currentState: null,         // Current state ID within the flow
    history: [],                // Breadcrumb of visited states
    sessionContext: {},          // Template variables: {siteName, callerName, deviceId, ...}
    chatMessages: [],           // Chat-style message history for the UI
    activeDataCard: null,       // Current data card to display alongside chat
    pocketChanges: [],          // Pocket changes registered in this session
    triageSummary: [],          // Summary lines for Zendesk comment
    flowStartTime: null         // When the current flow started
};

// ============================================================================
// Template Engine
// ============================================================================

/**
 * Resolve template variables in a string: {varName} → value from sessionContext
 */
function resolveTemplate(template, extraContext = {}) {
    if (!template) return '';
    const ctx = { ...oohState.sessionContext, ...extraContext };
    return template.replace(/\{(\w+(?:\.\w+)*)\}/g, (match, path) => {
        const parts = path.split('.');
        let val = ctx;
        for (const part of parts) {
            val = val?.[part];
            if (val === undefined) return match; // Leave unresolved
        }
        return String(val);
    });
}

// ============================================================================
// Triage Engine
// ============================================================================

/**
 * Start a triage flow
 */
function startTriageFlow(flowId, context = {}) {
    const flow = TRIAGE_FLOWS[flowId];
    if (!flow) {
        console.error(`[OOH] Flow not found: ${flowId}`);
        return;
    }

    oohState.currentFlow = flowId;
    oohState.currentState = 'start';
    oohState.history = [];
    oohState.chatMessages = [];
    oohState.activeDataCard = null;
    oohState.triageSummary = [];
    oohState.flowStartTime = Date.now();
    oohState.sessionContext = {
        flowName: flow.name,
        ...context
    };

    addChatMessage('system', `Starting: **${flow.name}**`, 'play_arrow');
    processState();
}

/**
 * Process the current state in the active flow
 */
async function processState() {
    const flow = TRIAGE_FLOWS[oohState.currentFlow];
    if (!flow) return;

    const stateId = oohState.currentState;
    const stateDef = flow.states[stateId];
    if (!stateDef) {
        console.error(`[OOH] State not found: ${stateId} in flow ${oohState.currentFlow}`);
        addChatMessage('error', 'Flow error — state not found. Please restart or escalate.', 'error');
        return;
    }

    oohState.history.push(stateId);

    switch (stateDef.type) {
        case 'info':
            renderInfoState(stateDef);
            break;
        case 'question':
            renderQuestionState(stateDef);
            break;
        case 'device_check':
            await renderDeviceCheckState(stateDef);
            break;
        case 'action':
            renderActionState(stateDef);
            break;
        case 'escalation':
            renderEscalationState(stateDef);
            break;
        case 'input':
            renderInputState(stateDef);
            break;
        case 'referral':
            renderReferralState(stateDef);
            break;
        case 'resolution':
            renderResolutionState(stateDef);
            break;
        default:
            addChatMessage('error', `Unknown state type: ${stateDef.type}`, 'error');
    }

    renderOohView();
}

/**
 * Transition to the next state
 */
function transitionTo(nextState) {
    if (!nextState) return;

    // Check for flow redirect
    const flow = TRIAGE_FLOWS[oohState.currentFlow];
    const stateDef = flow?.states[nextState];
    if (stateDef?.redirectFlow) {
        addChatMessage('system', `Redirecting to ${TRIAGE_FLOWS[stateDef.redirectFlow]?.name || stateDef.redirectFlow}...`, 'subdirectory_arrow_right');
        startTriageFlow(stateDef.redirectFlow, oohState.sessionContext);
        return;
    }

    oohState.currentState = nextState;
    processState();
}

/**
 * Go back one step in the flow
 */
function oohGoBack() {
    if (oohState.history.length < 2) return;
    oohState.history.pop(); // Remove current
    const prev = oohState.history.pop(); // Get previous (will be re-added by processState)
    oohState.currentState = prev;

    // Remove chat messages added by the current state
    // Simple approach: remove last N messages until we hit a system message
    while (oohState.chatMessages.length > 0) {
        const last = oohState.chatMessages[oohState.chatMessages.length - 1];
        if (last._stateId === prev) break;
        oohState.chatMessages.pop();
    }

    processState();
}

// ============================================================================
// State Renderers
// ============================================================================

/**
 * Info state: display message, auto-advance button
 */
function renderInfoState(stateDef) {
    const msg = resolveTemplate(stateDef.message);
    addChatMessage('bot', msg, 'info', { stateId: oohState.currentState });

    if (stateDef.next) {
        addChatAction('Continue', () => transitionTo(stateDef.next), 'arrow_forward');
    }
}

/**
 * Question state: display options for the agent to choose
 */
function renderQuestionState(stateDef) {
    const msg = resolveTemplate(stateDef.message);
    addChatMessage('bot', msg, 'help_outline', { stateId: oohState.currentState });

    for (const option of stateDef.options) {
        addChatAction(option.label, () => {
            addChatMessage('agent', option.label, 'person');
            oohState.triageSummary.push(`Agent selected: ${option.label}`);
            transitionTo(option.next);
        });
    }
}

/**
 * Device check state: call API, show data card, branch on result
 */
async function renderDeviceCheckState(stateDef) {
    const apiUrl = resolveTemplate(stateDef.api.url);
    addChatMessage('bot', resolveTemplate(stateDef.title || 'Checking...'), 'sync', {
        stateId: oohState.currentState,
        loading: true
    });

    try {
        const response = await fetch(`${apiUrl}`, {
            method: stateDef.api.method || 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = await response.json();

        if (data.error || data.available === false) {
            throw new Error(data.error || 'Service unavailable');
        }

        // Store API response in context
        Object.assign(oohState.sessionContext, flattenForContext(data));

        // Show data card if defined
        if (stateDef.dataCard) {
            oohState.activeDataCard = {
                title: resolveTemplate(stateDef.dataCard.title),
                fields: stateDef.dataCard.fields,
                data
            };
        }

        // Remove loading message
        markLastBotComplete();

        // Branch on conditions or use onSuccess
        if (stateDef.branches) {
            for (const branch of stateDef.branches) {
                if (evaluateCondition(branch.condition, data)) {
                    transitionTo(branch.next);
                    return;
                }
            }
        }

        if (stateDef.onSuccess) {
            transitionTo(stateDef.onSuccess);
        } else if (stateDef.onEmpty && isEmptyResult(data)) {
            transitionTo(stateDef.onEmpty);
        }

    } catch (err) {
        console.error(`[OOH] Device check failed: ${err.message}`);
        markLastBotComplete();
        addChatMessage('error', `Could not retrieve data: ${err.message}`, 'error');

        if (stateDef.fallback) {
            addChatAction('Continue to escalation', () => transitionTo(stateDef.fallback), 'arrow_forward');
        }
    }
}

/**
 * Action state: confirm and execute a write operation
 */
function renderActionState(stateDef) {
    const msg = resolveTemplate(stateDef.message);
    addChatMessage('bot', msg, 'warning', { stateId: oohState.currentState });

    addChatAction(stateDef.confirmLabel || 'Confirm', async () => {
        addChatMessage('agent', `Confirmed: ${stateDef.confirmLabel || 'Action'}`, 'check');

        try {
            const apiUrl = resolveTemplate(stateDef.api.url);
            const body = stateDef.api.body ? JSON.parse(resolveTemplate(JSON.stringify(stateDef.api.body))) : {};

            const response = await fetch(apiUrl, {
                method: stateDef.api.method || 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await response.json();

            if (result._readOnly) {
                addChatMessage('system', 'Read-only mode — action simulated but not executed.', 'lock');
            }

            // Register pocket change if defined
            if (stateDef.pocketChange) {
                await registerPocketChange(stateDef.pocketChange);
            }

            oohState.triageSummary.push(`Action: ${stateDef.confirmLabel || stateDef.title}`);
            transitionTo(stateDef.next);
        } catch (err) {
            addChatMessage('error', `Action failed: ${err.message}`, 'error');
            if (stateDef.fallback) {
                addChatAction('Escalate instead', () => transitionTo(stateDef.fallback), 'arrow_forward');
            }
        }
    }, 'check_circle');

    addChatAction('Cancel — go back', () => oohGoBack(), 'undo');
}

/**
 * Escalation state: show escalation details and options
 */
function renderEscalationState(stateDef) {
    const msg = resolveTemplate(stateDef.message);
    const severity = stateDef.severity || 'medium';
    const severityIcons = { critical: 'report', high: 'warning', medium: 'info', low: 'info' };
    const severityColours = { critical: 'var(--danger)', high: 'var(--warning)', medium: 'var(--primary)', low: 'var(--text-secondary)' };

    addChatMessage('escalation', msg, severityIcons[severity] || 'warning', {
        stateId: oohState.currentState,
        severity,
        colour: severityColours[severity]
    });

    oohState.triageSummary.push(`Escalation (${severity}): ${resolveTemplate(stateDef.title)}`);

    if (stateDef.summary) {
        oohState.triageSummary.push(resolveTemplate(stateDef.summary));
    }

    // Track referrals from escalation states
    if (stateDef.referralTo) {
        if (!oohState.sessionContext.referrals) oohState.sessionContext.referrals = [];
        oohState.sessionContext.referrals.push({
            to: stateDef.referralTo,
            phone: stateDef.referralPhone || '',
            reason: resolveTemplate(stateDef.title || '')
        });
    }

    addChatAction('Create Zendesk Ticket & Escalate', () => {
        completeTriageWithEscalation(stateDef);
    }, 'send');

    addChatAction('Go back', () => oohGoBack(), 'undo');
}

/**
 * Resolution state: end of flow, post summary
 */
function renderResolutionState(stateDef) {
    const msg = resolveTemplate(stateDef.message);
    addChatMessage('resolution', msg, 'check_circle', {
        stateId: oohState.currentState
    });

    if (stateDef.summary) {
        oohState.triageSummary.push(resolveTemplate(stateDef.summary));
    }

    addChatAction('Post Summary to Zendesk Ticket', () => {
        postTriageSummary();
    }, 'note_add');

    addChatAction('Start New Triage', () => {
        resetOohState();
        renderOohView();
    }, 'restart_alt');
}

// ============================================================================
// Input & Referral State Renderers (v2 additions)
// ============================================================================

/**
 * Input state: free-text input from the agent
 * Stores value in sessionContext.inputValue for use in subsequent states
 */
function renderInputState(stateDef) {
    const msg = resolveTemplate(stateDef.message);
    addChatMessage('bot', msg, 'edit', { stateId: oohState.currentState });

    const inputIdx = oohState.chatMessages.length;
    oohState.chatMessages.push({
        role: 'input',
        placeholder: stateDef.placeholder || 'Enter details...',
        _stateId: oohState.currentState
    });

    addChatAction('Submit', () => {
        const inputEl = document.getElementById(`ooh-input-${inputIdx}`);
        const value = inputEl ? inputEl.value.trim() : '';
        if (!value) {
            inputEl?.focus();
            return;
        }
        oohState.sessionContext.inputValue = value;
        oohState.triageSummary.push(`Agent input: ${value}`);
        addChatMessage('agent', value, 'person');
        transitionTo(stateDef.next);
    }, 'send');

    addChatAction('Skip', () => {
        oohState.sessionContext.inputValue = '(not provided)';
        transitionTo(stateDef.next);
    }, 'skip_next');
}

/**
 * Referral state: advises caller to contact an external party
 * Similar to resolution but also logs the referral
 */
function renderReferralState(stateDef) {
    const msg = resolveTemplate(stateDef.message);
    addChatMessage('referral', msg, 'phone_forwarded', {
        stateId: oohState.currentState,
        colour: 'var(--info)'
    });

    if (stateDef.summary) {
        oohState.triageSummary.push(resolveTemplate(stateDef.summary));
    }

    // Track referral in handoff data
    if (stateDef.referralTo) {
        if (!oohState.sessionContext.referrals) oohState.sessionContext.referrals = [];
        oohState.sessionContext.referrals.push({
            to: stateDef.referralTo,
            phone: stateDef.referralPhone || '',
            reason: resolveTemplate(stateDef.title || '')
        });
    }

    // If this referral also escalates to IoT, offer that
    if (stateDef.alsoEscalate) {
        addChatAction('Also Escalate to IoT Team', () => {
            oohState.triageSummary.push('Also escalated to IoT Support.');
            postTriageSummary();
        }, 'send');
    }

    addChatAction('Post Summary to Zendesk Ticket', () => {
        postTriageSummary();
    }, 'note_add');

    addChatAction('Start New Triage', () => {
        resetOohState();
        renderOohView();
    }, 'restart_alt');
}

// ============================================================================
// Pocket Changes Integration
// ============================================================================

/**
 * Register a pocket change via the API
 */
async function registerPocketChange(pocketDef) {
    try {
        const payload = {
            service: pocketDef.service,
            deviceId: oohState.sessionContext.deviceId || 'unknown',
            description: resolveTemplate(pocketDef.description),
            revertAfterMinutes: pocketDef.revertAfterMinutes,
            reason: oohState.sessionContext.reason || 'OOH triage',
            agentName: oohState.sessionContext.agentName || 'OOH handler',
            ticketId: oohState.sessionContext.ticketId || null,
            newValue: oohState.sessionContext.newValue || {},
            originalValue: oohState.sessionContext.originalValue || {}
        };

        const res = await fetch('/api/pocket-changes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            oohState.pocketChanges.push(result.change);
            addChatMessage('system', `Auto-revert registered: will revert in ${pocketDef.revertAfterMinutes} minutes`, 'timer');
        } else if (result._readOnly) {
            addChatMessage('system', 'Read-only mode — pocket change simulated.', 'lock');
        }
    } catch (err) {
        console.error(`[OOH] Pocket change registration failed: ${err.message}`);
        addChatMessage('error', `Warning: auto-revert could not be registered. Manual revert may be needed.`, 'warning');
    }
}

// ============================================================================
// Zendesk Integration
// ============================================================================

/**
 * Post triage summary as internal note on Zendesk ticket
 */
async function postTriageSummary() {
    const ticketId = oohState.sessionContext.ticketId;
    if (!ticketId) {
        addChatMessage('system', 'No ticket ID in context — summary not posted. Copy it manually if needed.', 'info');
        showTriageSummaryText();
        return;
    }

    const summary = buildTriageSummaryText();
    try {
        const res = await fetch(`/api/zendesk/tickets/${ticketId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ticket: {
                    comment: {
                        body: summary,
                        public: false
                    }
                }
            })
        });
        const result = await res.json();
        if (result._readOnly) {
            addChatMessage('system', 'Read-only mode — summary not posted.', 'lock');
        } else {
            addChatMessage('system', `Triage summary posted to ticket #${ticketId}`, 'check_circle');
        }
    } catch (err) {
        addChatMessage('error', `Failed to post summary: ${err.message}`, 'error');
    }
    showTriageSummaryText();
}

/**
 * Build the summary text from triage log
 */
function buildTriageSummaryText() {
    const flow = TRIAGE_FLOWS[oohState.currentFlow];
    const duration = Math.round((Date.now() - oohState.flowStartTime) / 60000);
    const lines = [
        `=== OOH Triage Summary ===`,
        `Flow: ${flow?.name || oohState.currentFlow}`,
        `Duration: ${duration} min`,
        `Agent: ${oohState.sessionContext.agentName || 'OOH handler'}`,
        `Site: ${oohState.sessionContext.siteName || '(not selected)'}`,
        ''
    ];

    // --- Structured handoff (Change 11) ---

    // T1 Checks Completed — derive from flow history
    const completedStates = oohState.history
        .map(id => flow?.states?.[id])
        .filter(Boolean);
    const t1Steps = completedStates
        .filter(s => s.title && (s.type === 'question' || s.type === 'info' || s.type === 'input'))
        .map(s => s.title);
    if (t1Steps.length > 0) {
        lines.push('--- T1 Checks Completed ---');
        t1Steps.forEach(s => lines.push(`• ${s}`));
        lines.push('');
    }

    // T1 Findings — agent selections and inputs
    const findings = oohState.triageSummary.filter(s => s.startsWith('Agent'));
    if (findings.length > 0) {
        lines.push('--- T1 Findings ---');
        findings.forEach(f => lines.push(`• ${f}`));
        lines.push('');
    }

    // Suggested Diagnostic Flow
    const lastState = completedStates[completedStates.length - 1];
    if (lastState?.suggestedDiagnostic) {
        lines.push(`--- Suggested Diagnostic Flow ---`);
        lines.push(`${lastState.suggestedDiagnostic}`);
        lines.push('');
    }

    // What's Been Ruled Out — derive from question paths NOT taken
    const ruledOut = oohState.triageSummary.filter(s =>
        s.includes('not Lighthouse') || s.includes('Appliance fault') ||
        s.includes('not responding') || s.includes('GK Repairs') ||
        s.includes('site power')
    );
    if (ruledOut.length > 0) {
        lines.push('--- What\'s Been Ruled Out ---');
        ruledOut.forEach(r => lines.push(`• ${r}`));
        lines.push('');
    }

    // Non-LH Referral Made
    const referrals = oohState.sessionContext.referrals || [];
    if (referrals.length > 0) {
        lines.push('--- Non-LH Referral Made ---');
        referrals.forEach(r => lines.push(`• ${r.to}${r.phone ? ` (${r.phone})` : ''}: ${r.reason}`));
        lines.push('');
    }

    // Full triage log
    lines.push('--- Triage Log ---');
    oohState.triageSummary.forEach(s => lines.push(`• ${s}`));

    // Pocket changes
    if (oohState.pocketChanges.length > 0) {
        lines.push('', '--- Pocket Changes ---');
        for (const pc of oohState.pocketChanges) {
            lines.push(`• ${pc.description} (reverts at ${new Date(pc.revertAt).toLocaleTimeString()})`);
        }
    }

    return lines.join('\n');
}

/**
 * Show summary text in chat for manual copy
 */
function showTriageSummaryText() {
    const text = buildTriageSummaryText();
    addChatMessage('system', `**Triage Summary:**\n\`\`\`\n${text}\n\`\`\``, 'description');
}

/**
 * Complete triage with escalation
 */
async function completeTriageWithEscalation(stateDef) {
    addChatMessage('system', 'Creating escalation...', 'hourglass_empty');
    oohState.triageSummary.push(`Escalated: ${resolveTemplate(stateDef.title)} (${stateDef.severity})`);
    await postTriageSummary();
}

// ============================================================================
// Chat Message Management
// ============================================================================

/**
 * Add a message to the chat history
 */
function addChatMessage(role, text, icon, meta = {}) {
    oohState.chatMessages.push({
        role,
        text,
        icon,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _stateId: oohState.currentState,
        ...meta
    });
}

/**
 * Add an action button to the chat.
 * Stores the handler in oohChatActions keyed by message index so
 * onclick="oohChatActions[i]()" works from rendered HTML strings.
 */
function addChatAction(label, handler, icon) {
    const idx = oohState.chatMessages.length;
    oohState.chatMessages.push({
        role: 'action',
        label,
        icon,
        _stateId: oohState.currentState
    });
    oohChatActions[idx] = handler;
}

/**
 * Mark the last bot loading message as complete
 */
function markLastBotComplete() {
    for (let i = oohState.chatMessages.length - 1; i >= 0; i--) {
        if (oohState.chatMessages[i].loading) {
            oohState.chatMessages[i].loading = false;
            break;
        }
    }
}

// ============================================================================
// Utility
// ============================================================================

/**
 * Flatten an API response into dot-notation context variables
 */
function flattenForContext(data, prefix = '') {
    const result = {};
    for (const [key, value] of Object.entries(data)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenForContext(value, fullKey));
        } else {
            result[fullKey] = value;
        }
    }
    return result;
}

/**
 * Evaluate a simple condition string against data
 * Supports: "key === value", "key !== value", "key === true/false"
 */
function evaluateCondition(condition, data) {
    if (!condition) return false;
    const match = condition.match(/^(\w+(?:\.\w+)*)\s*(===|!==)\s*(.+)$/);
    if (!match) return false;

    const [, path, operator, rawValue] = match;
    const parts = path.split('.');
    let actual = data;
    for (const part of parts) {
        actual = actual?.[part];
    }

    let expected = rawValue.trim();
    if (expected === 'true') expected = true;
    else if (expected === 'false') expected = false;
    else if (expected === 'null') expected = null;
    else if (!isNaN(expected)) expected = Number(expected);
    else expected = expected.replace(/^['"]|['"]$/g, '');

    return operator === '===' ? actual === expected : actual !== expected;
}

/**
 * Check if an API result is "empty"
 */
function isEmptyResult(data) {
    if (!data) return true;
    if (Array.isArray(data)) return data.length === 0;
    if (data.devices) return data.devices.length === 0;
    if (data.data) return data.data.length === 0;
    return false;
}

/**
 * Reset OOH state for a new triage
 */
function resetOohState() {
    oohState.currentFlow = null;
    oohState.currentState = null;
    oohState.history = [];
    oohState.chatMessages = [];
    oohState.activeDataCard = null;
    oohState.pocketChanges = [];
    oohState.triageSummary = [];
    oohState.flowStartTime = null;
    // Clear action handlers
    for (const key of Object.keys(oohChatActions)) delete oohChatActions[key];
    // Keep sessionContext for site info between flows
}

// ============================================================================
// OOH View Rendering
// ============================================================================

/**
 * Render the OOH navigation sidebar
 */
function renderOohNavigation(nav) {
    nav.innerHTML = `
        <div class="nav-section">
            <div class="nav-section-label">OOH Triage</div>
            <a class="nav-item ${!oohState.currentFlow ? 'active' : ''}" onclick="resetOohAndShow()">
                <span class="material-icons-outlined nav-item-icon">home</span>
                <span class="nav-item-text">Triage Home</span>
            </a>
            <a class="nav-item ${oohState.currentFlow ? 'active' : ''}" onclick="showView('ooh')" style="${oohState.currentFlow ? '' : 'opacity:0.5;pointer-events:none'}">
                <span class="material-icons-outlined nav-item-icon">chat</span>
                <span class="nav-item-text">Active Triage</span>
                ${oohState.currentFlow ? '<span class="nav-item-badge" style="background:var(--success)">Live</span>' : ''}
            </a>
        </div>
        <div class="nav-section">
            <div class="nav-section-label">Quick Flows</div>
            ${Object.values(TRIAGE_FLOWS).map(flow => `
                <a class="nav-item ${oohState.currentFlow === flow.id ? 'active' : ''}"
                   onclick="startTriageFlow('${flow.id}')">
                    <span class="material-icons-outlined nav-item-icon">${flow.icon}</span>
                    <span class="nav-item-text">${flow.name}</span>
                </a>
            `).join('')}
        </div>
        <div class="nav-section">
            <div class="nav-section-label">Monitor</div>
            <a class="nav-item" onclick="showPocketChanges()">
                <span class="material-icons-outlined nav-item-icon">timer</span>
                <span class="nav-item-text">Pocket Changes</span>
                <span class="nav-item-badge" id="pocketChangeCount">-</span>
            </a>
        </div>
    `;

    // Load pocket change count
    loadPocketChangeCount();
}

/**
 * Load and display active pocket change count
 */
async function loadPocketChangeCount() {
    try {
        const res = await fetch('/api/pocket-changes');
        const data = await res.json();
        const badge = document.getElementById('pocketChangeCount');
        if (badge) badge.textContent = data.total || '0';
    } catch {
        // Silently fail
    }
}

/**
 * Main OOH view renderer — called by renderView() in app.js
 */
function renderOohView(container) {
    // If no container passed, get it from DOM
    if (!container) container = document.getElementById('viewContainer');
    if (!container) return;

    if (!oohState.currentFlow) {
        renderOohLanding(container);
    } else {
        renderOohTriageView(container);
    }
}

// ============================================================================
// OOH Site Picker (uses state.siteOptions from app.js)
// ============================================================================

/**
 * Ensure site options are loaded, then open the dropdown
 */
async function openOohSitePicker() {
    // Load site options if not already loaded (reuses app.js data)
    if (!state.siteOptionsLoaded) {
        try {
            const data = await fetch('/api/zendesk/field-options/11405878329244').then(r => r.json());
            state.siteOptions = (data.options || []).map(o => ({ value: o.value, name: o.name }));
            state.siteOptionsLoaded = true;
        } catch (err) {
            console.error('[OOH] Failed to load site options:', err);
            return;
        }
    }

    const dropdown = document.getElementById('oohSiteDropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('open');

    if (dropdown.classList.contains('open')) {
        const input = document.getElementById('oohSiteSearch');
        if (input) { input.value = ''; input.focus(); }
        filterOohSites('');

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', closeOohSitePickerOutside);
        }, 0);
    }
}

function closeOohSitePickerOutside(e) {
    const field = document.querySelector('.ooh-site-picker-field');
    if (field && !field.contains(e.target)) {
        const dropdown = document.getElementById('oohSiteDropdown');
        if (dropdown) dropdown.classList.remove('open');
        document.removeEventListener('click', closeOohSitePickerOutside);
    }
}

/**
 * Filter and render site list
 */
function filterOohSites(query) {
    query = query.toLowerCase().trim();
    const sites = state.siteOptions || [];
    const filtered = query
        ? sites.filter(s => s.name.toLowerCase().includes(query))
        : sites.slice(0, 50); // Show first 50 by default

    const countEl = document.getElementById('oohSiteCount');
    if (countEl) {
        countEl.textContent = query
            ? filtered.length + ' matches'
            : sites.length + ' sites — type to search';
    }

    const list = document.getElementById('oohSiteList');
    if (!list) return;

    if (filtered.length === 0) {
        list.innerHTML = '<div class="ooh-site-empty">No sites match</div>';
        return;
    }

    list.innerHTML = filtered.slice(0, 80).map(s => {
        var parts = s.name.split('::');
        var brand = parts.length >= 2 ? parts.slice(0, -1).join(' > ') : '';
        var siteName = parts[parts.length - 1] || s.name;
        return '<div class="ooh-site-option" onclick="selectOohSite(\'' +
            s.value.replace(/'/g, "\\'") + '\', \'' +
            s.name.replace(/'/g, "\\'") + '\')">' +
            (brand ? '<span class="ooh-site-brand">' + brand + '</span>' : '') +
            '<span class="ooh-site-name">' + siteName + '</span>' +
        '</div>';
    }).join('');
}

/**
 * Select a site and populate session context
 */
function selectOohSite(value, fullName) {
    var parts = fullName.split('::');
    var siteName = parts[parts.length - 1] || fullName;

    // Extract site number from name (e.g. "12345 - The Red Lion" → "12345")
    var numMatch = siteName.match(/^(\d+)/);
    var siteNo = numMatch ? numMatch[1] : value;

    oohState.sessionContext.siteValue = value;
    oohState.sessionContext.siteName = siteName;
    oohState.sessionContext.siteFullName = fullName;
    oohState.sessionContext.siteNo = siteNo;
    if (parts.length >= 2) oohState.sessionContext.client = parts[0];
    if (parts.length >= 3) oohState.sessionContext.brand = parts[1];

    // Close dropdown and update display
    var dropdown = document.getElementById('oohSiteDropdown');
    if (dropdown) dropdown.classList.remove('open');
    document.removeEventListener('click', closeOohSitePickerOutside);

    var display = document.getElementById('oohSiteDisplay');
    if (display) {
        display.textContent = siteName;
        display.classList.remove('placeholder');
    }

    // Re-render landing to show clear button
    renderOohView();
}

/**
 * Clear selected site
 */
function clearOohSite() {
    oohState.sessionContext.siteValue = null;
    oohState.sessionContext.siteName = null;
    oohState.sessionContext.siteFullName = null;
    oohState.sessionContext.siteNo = null;
    oohState.sessionContext.client = null;
    oohState.sessionContext.brand = null;
    renderOohView();
}

/**
 * Render the OOH landing page — entry point selection
 */
function renderOohLanding(container) {
    container.innerHTML = `
        <div class="ooh-landing">
            <div class="ooh-landing-header">
                <span class="material-icons-outlined" style="font-size:32px;color:var(--primary)">support_agent</span>
                <div>
                    <h2 style="margin:0;font-size:20px">OOH Triage</h2>
                    <p style="margin:4px 0 0;color:var(--text-secondary);font-size:13px">Select how to begin the triage</p>
                </div>
            </div>

            <div class="ooh-context-bar">
                <div class="ooh-context-field">
                    <label>Caller Name</label>
                    <input type="text" id="oohCallerName" placeholder="e.g. John from The Red Lion"
                           value="${oohState.sessionContext.callerName || ''}"
                           onchange="oohState.sessionContext.callerName = this.value">
                </div>
                <div class="ooh-context-field ooh-site-picker-field" style="flex:2">
                    <label>Site</label>
                    <div class="ooh-site-picker" onclick="openOohSitePicker()">
                        <span class="material-icons-outlined" style="font-size:16px;color:var(--text-secondary)">location_on</span>
                        <span id="oohSiteDisplay" class="${oohState.sessionContext.siteName ? '' : 'placeholder'}">${oohState.sessionContext.siteName || 'Search sites...'}</span>
                        ${oohState.sessionContext.siteName ? '<span class="ooh-site-clear" onclick="event.stopPropagation();clearOohSite()"><span class="material-icons-outlined" style="font-size:14px">close</span></span>' : ''}
                    </div>
                    <div class="ooh-site-dropdown" id="oohSiteDropdown">
                        <input type="text" id="oohSiteSearch" class="ooh-site-search-input"
                               placeholder="Type site number or name..."
                               oninput="filterOohSites(this.value)" autocomplete="off">
                        <div class="ooh-site-count" id="oohSiteCount"></div>
                        <div class="ooh-site-list" id="oohSiteList"></div>
                    </div>
                </div>
                <div class="ooh-context-field">
                    <label>Zendesk Ticket #</label>
                    <input type="text" id="oohTicketId" placeholder="e.g. 28500"
                           value="${oohState.sessionContext.ticketId || ''}"
                           onchange="oohState.sessionContext.ticketId = this.value">
                </div>
            </div>

            ${Object.entries(OOH_ENTRY_POINTS).map(([key, entry]) => `
                <div class="ooh-entry-section">
                    <h3 class="ooh-entry-title">
                        <span class="material-icons-outlined">${entry.icon}</span>
                        ${entry.label}
                    </h3>
                    <div class="ooh-entry-grid">
                        ${entry.categories.map(cat => `
                            <div class="ooh-entry-card ${cat.flows.length === 0 ? 'disabled' : ''}"
                                 onclick="${cat.flows.length === 1
                                     ? `startTriageFlow('${cat.flows[0]}')`
                                     : cat.flows.length > 1
                                         ? `showFlowPicker(${JSON.stringify(cat.flows).replace(/"/g, '&quot;')})`
                                         : ''}">
                                <span class="material-icons-outlined ooh-entry-icon">${cat.icon}</span>
                                <span class="ooh-entry-label">${cat.label}</span>
                                ${cat.flows.length === 0 ? '<span class="ooh-entry-badge">Coming soon</span>' : ''}
                                ${cat.flows.length > 1 ? `<span class="ooh-entry-badge">${cat.flows.length} flows</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}

            <div class="ooh-service-status" id="oohServiceStatus">
                <h3 class="ooh-entry-title">
                    <span class="material-icons-outlined">monitor_heart</span>
                    Service Status
                </h3>
                <div class="ooh-service-grid" id="oohServiceGrid">
                    Loading service status...
                </div>
            </div>
        </div>
    `;

    loadServiceStatus();
}

/**
 * Load and display service health status
 */
async function loadServiceStatus() {
    const grid = document.getElementById('oohServiceGrid');
    if (!grid) return;

    const services = [
        { name: 'ThingsBoard', endpoint: '/api/tb/status', icon: 'router' },
        { name: 'Tuya', endpoint: '/api/tuya/status', icon: 'power' },
        { name: 'Salus', endpoint: '/api/salus/status', icon: 'thermostat' },
        { name: 'Intesis', endpoint: '/api/intesis/status', icon: 'ac_unit' },
        { name: 'Pocket Changes', endpoint: '/api/pocket-changes/status', icon: 'timer' }
    ];

    const results = await Promise.allSettled(
        services.map(s => fetch(s.endpoint).then(r => r.json()).catch(() => ({ available: false })))
    );

    grid.innerHTML = services.map((s, i) => {
        const result = results[i].status === 'fulfilled' ? results[i].value : { available: false };
        const isAvailable = result.available;
        const isConfigured = result.configured !== false;
        return `
            <div class="ooh-service-card ${isAvailable ? 'available' : isConfigured ? 'degraded' : 'unavailable'}">
                <span class="material-icons-outlined">${s.icon}</span>
                <span class="ooh-service-name">${s.name}</span>
                <span class="ooh-service-dot ${isAvailable ? 'green' : isConfigured ? 'amber' : 'red'}"></span>
            </div>
        `;
    }).join('');
}

/**
 * Show flow picker when a category has multiple flows
 */
function showFlowPicker(flowIds) {
    const flows = flowIds.map(id => TRIAGE_FLOWS[id]).filter(Boolean);
    if (flows.length === 1) {
        startTriageFlow(flows[0].id);
        return;
    }

    // Simple inline picker
    const container = document.getElementById('viewContainer');
    const existing = container.querySelector('.ooh-flow-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.className = 'ooh-flow-picker';
    picker.innerHTML = `
        <div class="ooh-flow-picker-content">
            <h3>Select a Flow</h3>
            ${flows.map(f => `
                <button class="ooh-flow-picker-btn" onclick="startTriageFlow('${f.id}')">
                    <span class="material-icons-outlined">${f.icon}</span>
                    <div>
                        <strong>${f.name}</strong>
                        <p>${f.description}</p>
                    </div>
                </button>
            `).join('')}
            <button class="btn btn-secondary" onclick="this.closest('.ooh-flow-picker').remove()">Cancel</button>
        </div>
    `;
    container.appendChild(picker);
}

/**
 * Render the active triage view — chat + data card side-by-side
 */
function renderOohTriageView(container) {
    const flow = TRIAGE_FLOWS[oohState.currentFlow];

    container.innerHTML = `
        <div class="ooh-triage-layout">
            <div class="ooh-triage-chat">
                <div class="ooh-triage-header">
                    <button class="btn btn-secondary btn-sm" onclick="confirmAbortTriage()">
                        <span class="material-icons-outlined" style="font-size:16px">close</span>
                        End Triage
                    </button>
                    <div class="ooh-triage-flow-name">
                        <span class="material-icons-outlined">${flow?.icon || 'chat'}</span>
                        ${flow?.name || 'Triage'}
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="oohGoBack()" ${oohState.history.length < 2 ? 'disabled' : ''}>
                        <span class="material-icons-outlined" style="font-size:16px">undo</span>
                        Back
                    </button>
                </div>
                <div class="ooh-chat-messages" id="oohChatMessages">
                    ${renderChatMessages()}
                </div>
            </div>
            <div class="ooh-triage-sidebar">
                ${renderDataCard()}
                ${renderPocketChangeSummary()}
                ${renderContextInfo()}
            </div>
        </div>
    `;

    // Scroll chat to bottom
    const chatContainer = document.getElementById('oohChatMessages');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Render chat messages as HTML
 */
function renderChatMessages() {
    return oohState.chatMessages.map((msg, i) => {
        if (msg.role === 'action') {
            return `
                <div class="ooh-chat-action">
                    <button class="ooh-action-btn" onclick="oohChatActions[${i}]()">
                        ${msg.icon ? `<span class="material-icons-outlined" style="font-size:16px">${msg.icon}</span>` : ''}
                        ${msg.label}
                    </button>
                </div>
            `;
        }

        if (msg.role === 'input') {
            return `
                <div class="ooh-chat-input">
                    <textarea id="ooh-input-${i}" class="ooh-input-field" placeholder="${msg.placeholder || 'Enter details...'}" rows="3"></textarea>
                </div>
            `;
        }

        const roleClass = {
            bot: 'ooh-msg-bot',
            agent: 'ooh-msg-agent',
            system: 'ooh-msg-system',
            error: 'ooh-msg-error',
            escalation: 'ooh-msg-escalation',
            resolution: 'ooh-msg-resolution',
            referral: 'ooh-msg-referral'
        }[msg.role] || 'ooh-msg-bot';

        return `
            <div class="ooh-chat-msg ${roleClass}" ${msg.colour ? `style="border-left-color:${msg.colour}"` : ''}>
                <div class="ooh-msg-header">
                    <span class="material-icons-outlined ooh-msg-icon">${msg.icon || 'chat'}</span>
                    <span class="ooh-msg-time">${msg.time}</span>
                    ${msg.loading ? '<span class="material-icons-outlined spinning" style="font-size:14px">sync</span>' : ''}
                </div>
                <div class="ooh-msg-text">${renderMarkdown(msg.text)}</div>
            </div>
        `;
    }).join('');
}

/**
 * Render the data card sidebar panel
 */
function renderDataCard() {
    if (!oohState.activeDataCard) {
        return '<div class="ooh-data-card empty"><span class="material-icons-outlined">info</span>Data will appear here during device checks</div>';
    }

    const { title, data } = oohState.activeDataCard;
    return `
        <div class="ooh-data-card">
            <h4>${title}</h4>
            <div class="ooh-data-content">
                <pre>${JSON.stringify(data, null, 2)}</pre>
            </div>
        </div>
    `;
}

/**
 * Render pocket change summary in sidebar
 */
function renderPocketChangeSummary() {
    if (oohState.pocketChanges.length === 0) return '';
    return `
        <div class="ooh-data-card">
            <h4><span class="material-icons-outlined" style="font-size:16px">timer</span> Active Changes</h4>
            ${oohState.pocketChanges.map(pc => `
                <div class="ooh-pocket-item">
                    <span>${pc.description}</span>
                    <span class="ooh-pocket-time">Reverts: ${new Date(pc.revertAt).toLocaleTimeString()}</span>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Render context info in sidebar
 */
function renderContextInfo() {
    const ctx = oohState.sessionContext;
    const fields = [];
    if (ctx.callerName) fields.push(['Caller', ctx.callerName]);
    if (ctx.siteNo) fields.push(['Site #', ctx.siteNo]);
    if (ctx.siteName) fields.push(['Site', ctx.siteName]);
    if (ctx.ticketId) fields.push(['Ticket', `#${ctx.ticketId}`]);

    if (fields.length === 0) return '';
    return `
        <div class="ooh-data-card">
            <h4>Session Context</h4>
            ${fields.map(([k, v]) => `<div class="ooh-context-row"><span>${k}</span><span>${v}</span></div>`).join('')}
        </div>
    `;
}

/**
 * Simple markdown renderer (bold, code blocks, newlines)
 */
function renderMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/```\n?([\s\S]*?)```/g, '<pre>$1</pre>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}


/**
 * Confirm before aborting an active triage
 */
function confirmAbortTriage() {
    if (oohState.history.length > 1) {
        if (!confirm('End this triage? Progress will be lost.')) return;
    }
    resetOohState();
    renderOohView();
}

/**
 * Reset OOH and show landing
 */
function resetOohAndShow() {
    resetOohState();
    if (typeof showView === 'function') showView('ooh');
}

/**
 * Render a single active pocket change card
 */
function renderActivePocketCard(pc) {
    return '<div class="ooh-pocket-card active">' +
        '<div class="ooh-pocket-header">' +
            '<strong>' + pc.description + '</strong>' +
            '<span class="ooh-pocket-countdown">' + formatCountdown(pc.remainingMs) + '</span>' +
        '</div>' +
        '<div class="ooh-pocket-meta">' +
            'Service: ' + pc.service + ' | Device: ' + pc.deviceId + ' | Reason: ' + (pc.reason || 'N/A') +
        '</div>' +
        '<div class="ooh-pocket-actions">' +
            '<button class="btn btn-secondary btn-sm" onclick="cancelPocketChange(\'' + pc.id + '\')">Cancel Revert</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="extendPocketChange(\'' + pc.id + '\')">Extend +60min</button>' +
        '</div>' +
    '</div>';
}

/**
 * Render a single history pocket change card
 */
function renderHistoryPocketCard(pc) {
    var badgeClass = pc.status === 'reverted' ? 'success' : pc.status === 'failed' ? 'danger' : 'default';
    return '<div class="ooh-pocket-card ' + pc.status + '">' +
        '<div class="ooh-pocket-header">' +
            '<strong>' + pc.description + '</strong>' +
            '<span class="badge badge-' + badgeClass + '">' + pc.status + '</span>' +
        '</div>' +
        '<div class="ooh-pocket-meta">' +
            'Created: ' + new Date(pc.createdAt).toLocaleString() + ' | Service: ' + pc.service +
        '</div>' +
    '</div>';
}

/**
 * Show pocket changes monitor view
 */
async function showPocketChanges() {
    const container = document.getElementById('viewContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading-state"><span class="material-icons-outlined spinning">refresh</span>Loading pocket changes...</div>';

    try {
        const [activeRes, historyRes] = await Promise.all([
            fetch('/api/pocket-changes').then(r => r.json()),
            fetch('/api/pocket-changes/history').then(r => r.json())
        ]);

        const activeCards = (activeRes.changes || []).map(renderActivePocketCard).join('');
        const historyCards = (historyRes.changes || []).slice(0, 20).map(renderHistoryPocketCard).join('');

        container.innerHTML = '<div class="ooh-pocket-view">' +
            '<h2><span class="material-icons-outlined">timer</span> Pocket Changes</h2>' +
            '<h3>Active (' + (activeRes.total || 0) + ')</h3>' +
            (activeCards || '<p class="text-muted">No active pocket changes</p>') +
            '<h3 style="margin-top:24px">History (' + (historyRes.total || 0) + ')</h3>' +
            (historyCards || '<p class="text-muted">No history yet</p>') +
            '</div>';
    } catch (err) {
        container.innerHTML = '<div class="ooh-error">Failed to load pocket changes: ' + err.message + '</div>';
    }
}

/**
 * Format milliseconds as MM:SS countdown
 */
function formatCountdown(ms) {
    if (!ms || ms <= 0) return 'Expired';
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

/**
 * Cancel a pocket change
 */
async function cancelPocketChange(id) {
    if (!confirm('Cancel this auto-revert? The change will remain in effect.')) return;
    try {
        await fetch(`/api/pocket-changes/${id}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentName: oohState.sessionContext.agentName || 'OOH handler' })
        });
        showPocketChanges(); // Refresh
    } catch (err) {
        alert(`Failed to cancel: ${err.message}`);
    }
}

/**
 * Extend a pocket change by 60 minutes
 */
async function extendPocketChange(id) {
    try {
        await fetch(`/api/pocket-changes/${id}/extend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ additionalMinutes: 60 })
        });
        showPocketChanges(); // Refresh
    } catch (err) {
        alert(`Failed to extend: ${err.message}`);
    }
}

