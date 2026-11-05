// Six sessions' trackers observing every 500 ms for 5 s: how many `ps` runs, before and after.
import { spawn } from 'node:child_process';
import { AgentProcesses, processesAsync, sharedSnapshot, tolerateTimeouts } from '/Users/nick/.obeya/workspaces/obeya-dev/dce38a33/src/server/agent-processes';

const children = Array.from({ length: 6 }, () => spawn('sleep', ['30']));
async function run(label: string, make: (count: () => void) => (r: Set<number>) => Promise<any>) {
  let ps = 0;
  const snap = make(() => ps++);
  const trackers = children.map((c) => new AgentProcesses(c.pid!, snap));
  let lag = 0, last = performance.now();
  const probe = setInterval(() => { const n = performance.now(); lag = Math.max(lag, n - last - 10); last = n; }, 10);
  const tick = setInterval(() => { for (const t of trackers) void t.track().catch(() => {}); }, 500);
  await Bun.sleep(5000);
  clearInterval(tick); clearInterval(probe);
  return { label, ps, lag: Math.round(lag) };
}
const before = await run('one snapshot per session', (count) => (r) => { count(); return processesAsync(r); });
const shared = sharedSnapshot(async (r) => { const rows = await processesAsync(r); return { rows, denied: new Map() }; });
const after = await run('one shared snapshot per tick', (count) => (r) => { count(); return shared(r); });
// Count real `ps` runs for "after": wrap the take instead of the callers.
let takes = 0;
const counted = sharedSnapshot(async (r) => { takes++; return { rows: await processesAsync(r), denied: new Map() }; });
const afterReal = await run('one shared snapshot per tick (ps runs)', () => counted);
// A single timed-out snapshot within a running session
let now = 0;
const observed = tolerateTimeouts(30_000, () => now);
const t = () => Promise.reject(Object.assign(new Error('Agent process snapshot timed out'), { code: 'ETIMEDOUT' }));
const timeline: string[] = [];
for (const at of [0, 500, 1000]) { now = at; await observed(t()).then(() => timeline.push(`${at} ms: timeout skipped, session keeps running`), (e) => timeline.push(`${at} ms: session ended (${e.message})`)); }
now = 1500; await observed(Promise.resolve()); timeline.push('1500 ms: snapshot succeeds, window reset');
for (const at of [2000, 32_000]) { now = at; await observed(t()).then(() => timeline.push(`${at} ms: timeout skipped, session keeps running`), (e) => timeline.push(`${at} ms: session ended (${e.message})`)); }
for (const c of children) c.kill();
console.log(JSON.stringify({ before, afterReal: { ...afterReal, ps: takes }, timeline }, null, 1));
process.exit(0);
