// Read-only. Parses [UX] log lines from kubectl logs and prints p50/p95 per measure.
// Usage: kubectl logs deployment/ooh-dashboard -n iot-services | node scripts/ux-timing-report.mjs
import { createInterface } from 'readline';

const tSearch = [], tGate = [], tSite = [];
const PAT = /\[UX\] site=\S+ t-search=(\d+) t-gate=(\d+) t-site=(\d+)/;

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
    const m = PAT.exec(line);
    if (m) { tSearch.push(+m[1]); tGate.push(+m[2]); tSite.push(+m[3]); }
});
rl.on('close', () => {
    if (!tSearch.length) { console.log('No [UX] lines found.'); process.exit(0); }
    function pct(arr, p) {
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.ceil(p / 100 * s.length) - 1];
    }
    console.log(`${tSearch.length} lookups`);
    console.log(`t-search  p50=${pct(tSearch, 50)}ms  p95=${pct(tSearch, 95)}ms`);
    console.log(`t-gate    p50=${pct(tGate, 50)}ms  p95=${pct(tGate, 95)}ms`);
    console.log(`t-site    p50=${pct(tSite, 50)}ms  p95=${pct(tSite, 95)}ms`);
});
