/**
 * OOH Triage Dashboard — App Shell
 *
 * Lightweight bootstrap that provides the globals ooh.js depends on
 * and initialises the OOH landing view.
 */

// ============================================================================
// Global State (shared with ooh.js)
// ============================================================================

const state = {
    siteOptions: [],
    siteOptionsLoaded: false
};

// ============================================================================
// Initialisation
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadVersion();
    renderOohNavigation(document.getElementById('sidebarNav'));
    renderOohView(document.getElementById('viewContainer'));
});

/**
 * Load version from health endpoint and display
 */
async function loadVersion() {
    try {
        const res = await fetch('/api/health');
        const data = await res.json();
        const versionEl = document.getElementById('appVersion');
        if (versionEl) versionEl.textContent = `v${data.version}`;
        const roEl = document.getElementById('readOnlyBadge');
        if (roEl && data.readOnly) roEl.style.display = '';
    } catch {
        // Silently fail — version display is non-critical
    }
}

/**
 * showView — called by ooh.js navigation items.
 * In the standalone OOH app, this always renders the OOH view.
 */
function showView(viewName) {
    if (viewName === 'ooh' || !viewName) {
        renderOohNavigation(document.getElementById('sidebarNav'));
        renderOohView(document.getElementById('viewContainer'));
    }
}
