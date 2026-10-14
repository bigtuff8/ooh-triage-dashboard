/**
 * OOHDASH-123 Rosetta Stone — humane error translation (design §9, build plan §8, WU12).
 *
 * The IoT Command Gate / vendor writes a `*LastError` whose text is prefixed `gate:` or `vendor:`.
 * That raw string MUST NEVER reach the operator on screen — it is engineer-facing and alarming.
 * `translateLastError` maps it to a plain operator sentence; `safeTicketError` trims the raw text so
 * the FULL raw string can be written to the Zendesk ticket for the IoT team to diagnose.
 *
 * Rule (enforced here, consumed by control.js + the ticket writer): never render a "gate:"/"vendor:"
 * string on screen; always keep the raw text on the ticket.
 */

// The "accepted/pending past the confirm limit, no error" sentence (INDETERMINATE).
export const NOT_CONFIRMED_MESSAGE =
    "We sent the command but the device hasn't confirmed it yet. It may still take effect — check again in a few minutes, or raise a ticket if it does not respond.";

/**
 * Translate a raw gate/vendor LastError to a plain operator sentence. An empty/absent error (the
 * INDETERMINATE case) returns the "not confirmed yet" copy. An unrecognised string NEVER leaks — it
 * returns the generic provider-failure sentence.
 */
export function translateLastError(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return NOT_CONFIRMED_MESSAGE;
    const lower = s.toLowerCase();
    if (lower.startsWith('gate:')) {
        if (lower.includes('device offline')) {
            return 'The device is not responding — this may be temporary. Try again in a few minutes, or raise a ticket if it persists.';
        }
        if (lower.includes('malformed value')) {
            return 'Something went wrong sending that — we have logged it.';
        }
        if (lower.includes('no freshness keys')) {
            return 'We cannot confirm changes on this device type right now.';
        }
        if (lower.includes('internal fault')) {
            return 'Something went wrong on our end — please try again; contact support if it persists.';
        }
        // Any other gate: string — safe generic, never the raw text.
        return 'The device provider could not complete the change — try again, or raise a ticket.';
    }
    if (lower.startsWith('vendor:')) {
        if (lower.includes('no active tuya session')) {
            return 'Could not reach the device right now — try again in a moment.';
        }
        return 'The device provider could not complete the change — try again, or raise a ticket.';
    }
    // Unknown shape — never show the raw string on screen.
    return 'The device provider could not complete the change — try again, or raise a ticket.';
}

/**
 * Collapse whitespace and trim a raw LastError to a safe length before it lands on a ticket. Vendor
 * text is untrusted length/shape; keep it readable and bounded. Returns '' for empty input.
 */
export function safeTicketError(raw, max = 300) {
    const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!s) return '';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
