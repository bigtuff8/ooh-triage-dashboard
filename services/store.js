/**
 * Durable document store abstraction.
 *
 * live mode    → Azure Cosmos DB (singleton client, Direct connection, parameterised
 *                queries, point reads with partition key, ETag optimistic concurrency).
 * fixture mode → local JSON files under data/store/ with a monotonically increasing
 *                _version field standing in for the ETag (single-process semantics).
 *
 * Containers (all partitioned on /storePartition, one logical partition per collection —
 * volumes are tiny; this keeps single-owner conditional updates simple):
 *   OohOverrides   — timed-override/hold documents (F010)
 *   OohAuditLog    — app action audit entries (F011/F021/F022)
 *   OohAppConfig   — kill-switch, notices, data-quality flags (F016 + admin)
 *   OohSmsLog      — P1 escalation dispatch/ack records (F014)
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// OOH_STORE_DIR override keeps test runs isolated from local dev state
const FILE_DIR = process.env.OOH_STORE_DIR || join(__dirname, '..', 'data', 'store');

export class ConcurrencyError extends Error {
    constructor() { super('Document was modified concurrently'); this.name = 'ConcurrencyError'; }
}

/* ------------------------------------------------------------------ */
/* File-backed store (fixture/dev)                                     */
/* ------------------------------------------------------------------ */

class FileCollection {
    constructor(name) {
        this.name = name;
        this.path = join(FILE_DIR, `${name}.json`);
        mkdirSync(FILE_DIR, { recursive: true });
        this.docs = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : {};
    }

    persist() {
        // Atomic-ish write: temp file then rename
        const tmp = this.path + '.tmp';
        writeFileSync(tmp, JSON.stringify(this.docs, null, 1));
        renameSync(tmp, this.path);
    }

    async get(id) {
        const d = this.docs[id];
        return d ? structuredClone(d) : null;
    }

    async upsert(doc, { ifVersion } = {}) {
        const id = doc.id || randomUUID();
        const existing = this.docs[id];
        if (ifVersion !== undefined && existing && existing._version !== ifVersion) throw new ConcurrencyError();
        const next = { ...doc, id, _version: (existing?._version || 0) + 1 };
        this.docs[id] = next;
        this.persist();
        return structuredClone(next);
    }

    async delete(id) {
        delete this.docs[id];
        this.persist();
    }

    async query(predicate) {
        return Object.values(this.docs).filter(predicate).map(d => structuredClone(d));
    }
}

/* ------------------------------------------------------------------ */
/* Cosmos-backed store (live)                                          */
/* ------------------------------------------------------------------ */

class CosmosCollection {
    constructor(container) {
        this.container = container;
        this.partition = 'ooh';
    }

    async get(id) {
        try {
            const { resource } = await this.container.item(id, this.partition).read();
            return resource || null;
        } catch (err) {
            if (err.code === 404) return null;
            throw err;
        }
    }

    async upsert(doc, { ifVersion } = {}) {
        const body = { ...doc, id: doc.id || randomUUID(), storePartition: this.partition };
        const options = ifVersion !== undefined ? { accessCondition: { type: 'IfMatch', condition: ifVersion } } : {};
        try {
            const { resource } = await this.container.items.upsert(body, options);
            return { ...resource, _version: resource._etag };
        } catch (err) {
            if (err.code === 412) throw new ConcurrencyError();
            throw err;
        }
    }

    async delete(id) {
        try {
            await this.container.item(id, this.partition).delete();
        } catch (err) {
            if (err.code !== 404) throw err;
        }
    }

    /**
     * Cosmos collections are queried with a SQL predicate + parameters rather than a JS
     * function; callers use querySql in live mode. query(predicate) reads the partition
     * and filters in-process — acceptable at OOH volumes (hundreds of docs).
     */
    async query(predicate) {
        const { resources } = await this.container.items
            .query({
                query: 'SELECT * FROM c WHERE c.storePartition = @p',
                parameters: [{ name: '@p', value: this.partition }]
            }, { partitionKey: this.partition })
            .fetchAll();
        return resources.map(r => ({ ...r, _version: r._etag })).filter(predicate);
    }
}

/* ------------------------------------------------------------------ */
/* Store factory                                                       */
/* ------------------------------------------------------------------ */

const COLLECTIONS = ['OohOverrides', 'OohAuditLog', 'OohAppConfig', 'OohSmsLog'];
const collections = new Map();
let cosmosReady = null;
let storeHealthy = true;

async function initCosmos() {
    const { CosmosClient } = await import('@azure/cosmos');
    // Singleton client, Direct-equivalent (Node SDK uses TCP-less gateway; keep defaults + retries)
    const clientOptions = {
        endpoint: config.cosmos.endpoint,
        connectionPolicy: { requestTimeout: 10000, enableEndpointDiscovery: true }
    };
    if (config.cosmos.key) {
        clientOptions.key = config.cosmos.key;              // local / keyed back-compat path
    } else {
        // Prod (F003/SD-586): keyless via Workload Identity — no master key in-cluster.
        // Prefer the explicit WorkloadIdentityCredential for a faster, clearer failure than
        // DefaultAzureCredential's full-chain walk (CT AD-05); fall back to the chain locally.
        const { WorkloadIdentityCredential, DefaultAzureCredential } = await import('@azure/identity');
        clientOptions.aadCredentials =
            (process.env.AZURE_FEDERATED_TOKEN_FILE && process.env.AZURE_CLIENT_ID)
                ? new WorkloadIdentityCredential()
                : new DefaultAzureCredential();
    }
    const client = new CosmosClient(clientOptions);
    // The database is PRE-CREATED out-of-band (Spencer) — the granted data-plane role cannot
    // create it, so take a handle, never databases.createIfNotExists (CR-01).
    const database = client.database(config.cosmos.database);
    for (const name of COLLECTIONS) {
        // Containers are PRE-CREATED out-of-band (CR-01). Attempt create for local/keyed envs,
        // but tolerate a 403/Forbidden (data-plane role cannot create) by falling back to a handle.
        let container;
        try {
            ({ container } = await database.containers.createIfNotExists({
                id: name,
                partitionKey: { paths: ['/storePartition'] },
                indexingPolicy: {
                    indexingMode: 'consistent',
                    includedPaths: [{ path: '/storePartition/?' }, { path: '/OohOverrideRevertAt/?' }, { path: '/OohActionAt/?' }, { path: '/status/?' }],
                    excludedPaths: [{ path: '/*' }]
                }
            }));
        } catch (err) {
            if (err.code === 403 || err.code === 'Forbidden') {
                container = database.container(name);
            } else {
                throw err;
            }
        }
        collections.set(name, new CosmosCollection(container));
    }
}

/**
 * Returns the named collection, initialising the backing store on first use.
 */
export async function collection(name) {
    if (!COLLECTIONS.includes(name)) throw new Error(`Unknown collection ${name}`);
    if (config.dataMode === 'live') {
        if (!cosmosReady) cosmosReady = initCosmos().catch(err => { storeHealthy = false; cosmosReady = null; throw err; });
        await cosmosReady;
        storeHealthy = true;
        return collections.get(name);
    }
    if (!collections.has(name)) collections.set(name, new FileCollection(name));
    return collections.get(name);
}

/**
 * Actively probes real store reachability and updates the health flag (F003, CR-02).
 *
 * In live mode this forces initCosmos() (keyless WI client construction) and performs a
 * real point-read against a pre-created container — so it proves data-plane connectivity
 * and AAD/WI token acquisition, NOT merely that the client object was built. A 404 (probe
 * doc absent) is a SUCCESS for connectivity; a 401/403/network error is a failure. Called
 * eagerly at boot from server.js so a Cosmos/WI failure surfaces with a clear log line at
 * startup instead of silently at first store write. Never throws.
 */
export async function storeProbe() {
    if (config.dataMode !== 'live') {
        storeHealthy = true;
        return storeStatus();
    }
    try {
        const c = await collection('OohAppConfig'); // forces initCosmos() on first call
        await c.get('__ooh_health_probe__');        // real point-read; 404 → null (still healthy)
        storeHealthy = true;
    } catch (err) {
        storeHealthy = false;
        console.error(`[STORE] health probe failed (Cosmos unreachable / WI token / RBAC): ${err.code || ''} ${err.message}`);
    }
    return storeStatus();
}

/**
 * Health signal for /healthz. Reflects the last real store operation or storeProbe() result
 * (CR-02 fix: the flag is only trustworthy once storeProbe() or a real store call has run —
 * server.js runs storeProbe() eagerly at boot in live mode so this is meaningful from startup).
 */
export function storeStatus() {
    return { mode: config.dataMode === 'live' ? 'cosmos' : 'file', healthy: storeHealthy };
}
