/**
 * OOHDASH-119 — Additional notes component.
 *
 * Provides the shared notes textarea (FLOW-BOX), sessionStorage autosave helpers,
 * the character counter, and the post-submit "Add a note to ticket" box (POST-LINK).
 *
 * Loaded before flows.js (see index.html). All functions are attached to window so they
 * can be called from inline onclick handlers in the rendered HTML.
 *
 * No render() calls from notesInput — the counter updates via direct DOM manipulation
 * to avoid focus loss during live re-renders (design §5.3 WU3, WU4 focus-restore).
 */

/* -------------------------------------------------------------------------- */
/* notesField — renders the notes textarea HTML string                        */
/* -------------------------------------------------------------------------- */

/**
 * Returns the HTML string for the notes input group.
 *
 * @param {object} opts
 * @param {string} [opts.id='addnotes']   – element id and data-testid
 * @param {string|null} [opts.bind=null]  – when 'flow', notesInput writes to state.flow.data
 * @param {string} [opts.value='']        – pre-fill value (will be XSS-escaped)
 * @param {string} [opts.helperText]      – helper text beneath the textarea
 */
function notesField({ id = 'addnotes', bind = null, value = '', helperText } = {}) {
    // XSS-escape the value before injecting into the HTML attribute so sessionStorage-restored
    // content cannot break out of the textarea tag or forge surrounding HTML. esc() is in app.js.
    const safeValue = typeof esc === 'function' ? esc(value || '') : String(value || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const maxChars = (typeof state !== 'undefined' ? state?.me?.notes?.maxChars : undefined) ?? 1000;
    const warnAt = Math.floor(maxChars * 0.9); // amber from 90% (900 for 1000 cap) per design §6
    const currentLen = (value || '').length;
    const counterText = currentLen >= maxChars
        ? `${currentLen} / ${maxChars}, limit reached`
        : `${currentLen} / ${maxChars}`;
    const counterColor = currentLen >= maxChars ? 'var(--danger,#c00)' : currentLen >= warnAt ? 'var(--warning,#f80)' : 'var(--text-muted,#666)';
    const helper = helperText ||
        'For the ticket and the IoT team’s morning review. Not sent in urgent P1 texts. Keep it factual, no personal details.';
    return `<div class="notes-group" style="margin-top:10px">
  <label for="${id}" style="display:block;font-size:0.85em;font-weight:600;margin-bottom:4px">Additional notes for the IoT team (optional)</label>
  <textarea
    id="${id}"
    data-testid="${id}"
    ${bind ? `data-bind="${bind}"` : ''}
    maxlength="${maxChars}"
    rows="2"
    style="width:100%;box-sizing:border-box;font-size:16px;padding:6px 8px;border:1px solid var(--border,#ccc);border-radius:6px;resize:vertical"
    placeholder="Anything the caller or site told you that isn’t captured above, e.g. engineer due at 7am"
    oninput="notesInput(this)"
  >${safeValue}</textarea>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px">
   <span class="small" style="color:var(--text-muted,#666)">${helper}</span>
   <span id="${id}-counter" class="small" style="white-space:nowrap;margin-left:8px;color:${counterColor}">${counterText}</span>
  </div>
</div>`;
}

/* -------------------------------------------------------------------------- */
/* notesInput — called on every keystroke (oninput)                           */
/* -------------------------------------------------------------------------- */

/**
 * Handles every keystroke in a notes textarea.
 *  - Updates counter DOM node directly (no render call, preserves focus).
 *  - When data-bind="flow", writes el.value to state.flow.data.additionalNotes.
 *  - Schedules a debounced sessionStorage write (300 ms).
 */
function notesInput(el) {
    // Update the character counter directly without a re-render
    const counter = document.getElementById(el.id + '-counter');
    const maxChars = parseInt(el.maxLength, 10) || 1000;
    const warnAt = Math.floor(maxChars * 0.9); // amber from 90% per design §6
    const len = el.value.length;
    if (counter) {
        counter.textContent = len >= maxChars
            ? `${len} / ${maxChars}, limit reached`
            : `${len} / ${maxChars}`;
        counter.style.color = len >= maxChars ? 'var(--danger,#c00)' : len >= warnAt ? 'var(--warning,#f80)' : 'var(--text-muted,#666)';
    }
    // Write to in-memory flow state when bound to the flow panel
    if (el.dataset.bind === 'flow' && typeof state !== 'undefined' && state?.flow?.data) {
        state.flow.data.additionalNotes = el.value;
    }
    // Debounced sessionStorage save
    if (el.dataset.bind === 'flow') {
        const siteNo = (typeof state !== 'undefined') ? state?.workspace?.site?.siteNo : null;
        const flowKey = (typeof state !== 'undefined') ? state?.flow?.data?._flowKey : null;
        _scheduleNotesDraftSave(siteNo, flowKey, el.value);
    }
}

let _notesDraftTimer = null;
function _scheduleNotesDraftSave(siteNo, flowKey, value) {
    clearTimeout(_notesDraftTimer);
    _notesDraftTimer = setTimeout(() => notesDraftSave(siteNo, flowKey, value), 300);
}

/* -------------------------------------------------------------------------- */
/* notesValue — reads the current textarea value (trimmed)                    */
/* -------------------------------------------------------------------------- */

/** Returns el.value.trim() or null. Used by the ambiguous and query submit paths. */
function notesValue(id) {
    const el = document.getElementById(id);
    const v = el?.value?.trim();
    return v || null;
}

/* -------------------------------------------------------------------------- */
/* sessionStorage autosave helpers                                            */
/* -------------------------------------------------------------------------- */

const NOTES_DRAFT_KEY = 'ooh_note_draft';

/**
 * Persists a draft note to sessionStorage. Silent on any storage error.
 * Key schema: { siteNo, flowKey, value } — so a draft for site A/flow X never
 * restores on site B or a different flow type.
 */
function notesDraftSave(siteNo, flowKey, value) {
    try {
        sessionStorage.setItem(NOTES_DRAFT_KEY, JSON.stringify({ siteNo, flowKey, value }));
    } catch { /* storage unavailable — not fatal */ }
}

/**
 * Reads the sessionStorage draft for the given site+flow. Returns the value string if
 * the keys match, null otherwise. Silent on any storage error.
 */
function notesDraftRestore(siteNo, flowKey) {
    try {
        const entry = JSON.parse(sessionStorage.getItem(NOTES_DRAFT_KEY));
        if (entry?.siteNo === siteNo && entry?.flowKey === flowKey) return entry.value || null;
        return null;
    } catch { return null; }
}

/**
 * Removes the sessionStorage draft. Called at: submitPendingOutcome success,
 * cancelFlow, anotherIssue, endCall. NOT called at startFlow or openSite.
 */
function notesDraftClear() {
    try { sessionStorage.removeItem(NOTES_DRAFT_KEY); } catch { /* ignore */ }
}

/* -------------------------------------------------------------------------- */
/* notesPostBox — post-submit "Add a note to ticket" HTML                     */
/* -------------------------------------------------------------------------- */

/**
 * Returns the HTML for the post-submit notes link/form (POST-LINK).
 * Reads state.flow.data._postNotes to persist UI state across re-renders.
 *
 * States: idle (link) → open (textarea + save) → saving → saved | error
 *
 * @param {string|number} ticketId
 * @param {object} [opts]
 * @param {boolean} [opts.expanded=false]  – open the box immediately (control timeout path)
 */
function notesPostBox(ticketId, { expanded = false } = {}) {
    const ps = (typeof state !== 'undefined' && state?.flow?.data?._postNotes) || 'idle';
    if (ps === 'saved') {
        return `<div class="notes-group" style="margin-top:8px" data-testid="addnotes-post-saved">
  <span class="small" style="color:var(--success,green)">✓ Note saved to ticket #${ticketId}</span>
  <button class="btn link" data-testid="addnotes-post-another" onclick="window._postNotesOpen()" style="margin-left:8px;font-size:0.85em">Add another note</button>
</div>`;
    }
    if (ps === 'saving') {
        const draft = (typeof state !== 'undefined' && state?.flow?.data?._postNotesDraft) || '';
        const safeD = typeof esc === 'function' ? esc(draft) : String(draft).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<div class="notes-group" style="margin-top:8px" data-testid="addnotes-post-saving">
  <label style="display:block;font-size:0.85em;font-weight:600;margin-bottom:4px">Add a note to ticket #${ticketId} (optional)</label>
  <textarea id="addnotes-post-input" data-testid="addnotes-post-input" rows="2" disabled
    style="width:100%;box-sizing:border-box;font-size:16px;padding:6px 8px;border:1px solid var(--border,#ccc);border-radius:6px;resize:vertical"
  >${safeD}</textarea>
  <div style="margin-top:6px">
   <button class="btn primary" data-testid="addnotes-post-save" disabled>Saving…</button>
  </div>
</div>`;
    }
    if (ps === 'error') {
        const msg = state?.flow?.data?._postNotesError || 'Could not save note';
        const draft = (typeof state !== 'undefined' && state?.flow?.data?._postNotesDraft) || '';
        const safeD = typeof esc === 'function' ? esc(draft) : String(draft).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const safeMsg = typeof esc === 'function' ? esc(msg) : msg;
        return `<div class="notes-group" style="margin-top:8px" data-testid="addnotes-post-error">
  <label style="display:block;font-size:0.85em;font-weight:600;margin-bottom:4px">Add a note to ticket #${ticketId} (optional)</label>
  <textarea id="addnotes-post-input" data-testid="addnotes-post-input" rows="2"
    style="width:100%;box-sizing:border-box;font-size:16px;padding:6px 8px;border:1px solid var(--border,#ccc);border-radius:6px;resize:vertical"
  >${safeD}</textarea>
  <div style="margin-top:6px">
   <span class="small" style="color:var(--danger,#c00);display:block;margin-bottom:4px">⚠ Couldn’t save the note: ${safeMsg}. Try again, or add it later from Tonight → ticket.</span>
   <button class="btn primary" data-testid="addnotes-post-save" onclick="saveNotesPost(${ticketId})">Try again</button>
   <button class="btn link" style="margin-left:8px" onclick="window._postNotesReset()">Cancel</button>
  </div>
</div>`;
    }
    if (ps === 'open' || expanded) {
        return `<div class="notes-group" style="margin-top:8px" data-testid="addnotes-post-open">
  <label style="display:block;font-size:0.85em;font-weight:600;margin-bottom:4px">Add a note to ticket #${ticketId} (optional)</label>
  <textarea id="addnotes-post-input" data-testid="addnotes-post-input" rows="2"
    style="width:100%;box-sizing:border-box;font-size:16px;padding:6px 8px;border:1px solid var(--border,#ccc);border-radius:6px;resize:vertical"
    placeholder="Type a note…"></textarea>
  <div style="margin-top:6px">
   <button class="btn primary" data-testid="addnotes-post-save" onclick="saveNotesPost(${ticketId})">Save note</button>
   <button class="btn link" style="margin-left:8px" onclick="window._postNotesReset()">Cancel</button>
  </div>
</div>`;
    }
    // idle state: show the link
    return `<div class="notes-group" style="margin-top:8px">
  <button class="btn link" data-testid="addnotes-post-open" onclick="window._postNotesOpen()">+ Add a note to ticket #${ticketId}</button>
</div>`;
}

/* -------------------------------------------------------------------------- */
/* saveNotesPost — fires the POST /api/tickets/:id/notes call                 */
/* -------------------------------------------------------------------------- */

async function saveNotesPost(ticketId) {
    // Idempotency guard: bail if a request is already in flight (prevents double-post on rapid retry).
    if (typeof state !== 'undefined' && state?.flow?.data?._postNotesPending) return;

    const el = document.getElementById('addnotes-post-input');
    const value = el?.value?.trim();
    if (!value) return;

    // Generate a per-submission idempotency token if not already set.
    // The token is kept across retries so the server can deduplicate re-sends.
    const token = (typeof state !== 'undefined' && state?.flow?.data?._postNotesToken)
        || Math.random().toString(36).slice(2) + Date.now().toString(36);

    if (typeof state !== 'undefined' && state?.flow?.data) {
        state.flow.data._postNotesDraft = value;
        state.flow.data._postNotesToken = token;
        state.flow.data._postNotesPending = true;
        state.flow.data._postNotes = 'saving';
    }
    if (typeof render === 'function') render();
    try {
        await api.post(`/api/tickets/${ticketId}/notes`, { body: value, kind: 'additional-notes', idempotencyKey: token });
        if (typeof state !== 'undefined' && state?.flow?.data) {
            state.flow.data._postNotes = 'saved';
            state.flow.data._postNotesPending = false;
            delete state.flow.data._postNotesDraft;
            delete state.flow.data._postNotesToken;
        }
    } catch (err) {
        if (typeof state !== 'undefined' && state?.flow?.data) {
            // Humanise the error: never expose raw HTTP strings or server internals.
            let friendly;
            if (err.network) {
                friendly = 'No connection — check your internet and try again.';
            } else if (err.status >= 500) {
                friendly = 'The server had a problem. Try again in a moment.';
            } else if (err.status === 400) {
                friendly = err.message; // already a user-facing validation string
            } else {
                friendly = 'Couldn’t save — please try again.';
            }
            state.flow.data._postNotes = 'error';
            state.flow.data._postNotesError = friendly;
            state.flow.data._postNotesPending = false;
            // _postNotesDraft and _postNotesToken are kept for retry
        }
    }
    if (typeof render === 'function') render();
}

/* Internal helpers for post-submit box state transitions */
window._postNotesOpen = function () {
    if (typeof state !== 'undefined' && state?.flow?.data) {
        state.flow.data._postNotes = 'open';
    }
    if (typeof render === 'function') render();
};
window._postNotesReset = function () {
    if (typeof state !== 'undefined' && state?.flow?.data) {
        state.flow.data._postNotes = 'idle';
        state.flow.data._postNotesPending = false;
        delete state.flow.data._postNotesError;
        delete state.flow.data._postNotesDraft;
        delete state.flow.data._postNotesToken; // new token on next open
    }
    if (typeof render === 'function') render();
};
