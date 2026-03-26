/**
 * Local JSON File Storage
 *
 * Drop-in replacement for cosmos.js getConfig/saveConfig pattern.
 * Stores data in data/{key}.json files.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

export const cosmosEnabled = false;

/**
 * Get stored config/data by key
 */
export async function getConfig(key) {
    const file = join(DATA_DIR, `${key}.json`);
    if (!existsSync(file)) return null;
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * Save config/data by key
 */
export async function saveConfig(key, data) {
    const file = join(DATA_DIR, `${key}.json`);
    writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
