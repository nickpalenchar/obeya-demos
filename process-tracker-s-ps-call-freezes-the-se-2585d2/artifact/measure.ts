// Runs the tracker as the Codex transport does (a snapshot every 500 ms) for 6 s and measures how
// long the event loop stays unanswered: a 10 ms timer stands for a page request or an agent message.
import { spawn } from 'node:child_process';
const [, , module, label] = process.argv;
const { AgentProcesses } = await import(module!);
const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
const tracker = new AgentProcesses(child.pid!);
let last = performance.now(), worst = 0;
const stalls: number[] = [];
const probe = setInterval(() => {
  const now = performance.now(), gap = now - last - 10;
  if (gap > 100) stalls.push(Math.round(gap));
  worst = Math.max(worst, gap); last = now;
}, 10);
let busy = false;
const observe = setInterval(() => {
  if (busy) return; busy = true;
  Promise.resolve().then(() => tracker.track()).catch(() => {}).finally(() => { busy = false; });
}, 500);
await new Promise((r) => setTimeout(r, 6000));
clearInterval(probe); clearInterval(observe); child.kill('SIGKILL');
console.log(JSON.stringify({ label, worstMs: Math.round(worst), stalls }));
process.exit(0);
