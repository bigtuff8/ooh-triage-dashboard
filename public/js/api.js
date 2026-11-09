/**
 * API layer — every call checks resp.ok, surfaces plain-English errors, and
 * bounces to sign-in on 401. 503s carry degraded:true so callers fail safe.
 */
(function () {
    async function request(method, path, body) {
        let resp;
        try {
            resp = await fetch(path, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined,
                credentials: 'same-origin'
            });
        } catch (err) {
            const e = new Error('Cannot reach the OOH Dashboard server — check your connection');
            e.network = true;
            throw e;
        }
        if (resp.status === 401) {
            window.location.href = '/auth/login';
            throw new Error('Signed out — redirecting to sign-in');
        }
        let data = null;
        try { data = await resp.json(); } catch { /* non-JSON error body */ }
        if (!resp.ok) {
            const e = new Error(data?.error || `Request failed (${resp.status})`);
            e.status = resp.status;
            e.degraded = !!data?.degraded;
            e.guardrail = !!data?.guardrail;
            e.resolution = data?.resolution;
            throw e;
        }
        return data;
    }

    // OOHDASH-146 D15/D16 (B34): ticket-creating posts carry the customer's contact, built from state.caller
    // (memory only). Left out when empty or invalid; a body that already has one is not touched.
    const CONTACT_PATHS = ['/api/outcomes', '/api/oneoffs'];
    function withContact(path, body) {
        try {
            if (!body || !CONTACT_PATHS.includes(path) || body.customerContact) return body;
            if (typeof callerContactFrom !== 'function' || typeof state === 'undefined') return body;
            const cc = callerContactFrom(state.caller);
            return cc ? Object.assign({}, body, { customerContact: cc }) : body;
        } catch (e) { return body; }
    }

    window.api = {
        get: path => request('GET', path),
        post: (path, body) => request('POST', path, withContact(path, body || {})),
        del: path => request('DELETE', path)
    };
})();
