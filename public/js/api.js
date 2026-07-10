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

    window.api = {
        get: path => request('GET', path),
        post: (path, body) => request('POST', path, body || {}),
        del: path => request('DELETE', path)
    };
})();
