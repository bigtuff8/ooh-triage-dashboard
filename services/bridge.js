/**
 * services/bridge.js — TB-direct read-plane shim (design §2.1, keep-filename swap).
 *
 * The device inventory & live-state read has moved to services/tb-device.js (a direct ThingsBoard
 * query replacing the integration-bridge /api/devices read — see that file's header for the full
 * rationale, C8). This file is now a one-line re-export so the 6 consumers (control.js, routes/api.js,
 * resolution.js, liveness.js, overrides.js, server.js) are untouched by the read swap this increment;
 * they are repointed and this shim deleted in a later increment. The public surface
 * (getSites / getSitesByNumber / searchSites / getDevice / bridgeStatus) is preserved verbatim.
 */

export * from './tb-device.js';
