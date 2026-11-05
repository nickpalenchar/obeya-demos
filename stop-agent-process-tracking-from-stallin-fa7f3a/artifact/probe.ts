import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const dir = import.meta.dirname;
const worktree = '/Users/nick/.obeya/workspaces/obeya-dev/fa7f3abd';
if (process.argv[2] === 'server') {
  const { AgentProcesses } = await import(process.argv[3]!);
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  let tracker: any;
  let busy = false;
  const server = Bun.serve({ port: 0, fetch: () => new Response('ready') });
  console.log(server.port);
  process.stdin.once('data', () => {
    tracker = new AgentProcesses(child.pid!);
    setInterval(() => {
      if (busy) return;
      busy = true;
      Promise.resolve().then(() => tracker.track()).finally(() => { busy = false; });
    }, 500);
  });
  process.on('SIGTERM', () => { child.kill('SIGKILL'); server.stop(true); process.exit(0); });
} else {
  const results = [];
  for (const [label, module] of [['Before', `${dir}/before.ts`], ['Current main', `${worktree}/src/server/agent-processes.ts`]]) {
    const child = Bun.spawn([process.execPath, import.meta.filename, 'server', module!], {
      env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}` }, stdin: 'pipe', stdout: 'pipe', stderr: 'inherit',
    });
    try {
      const reader = child.stdout.getReader();
      const { value } = await reader.read();
      const port = Number(new TextDecoder().decode(value).trim());
      child.stdin.write('start\n');
      const end = performance.now() + 6500;
      const requests = [];
      while (performance.now() < end) {
        const start = performance.now();
        const response = await fetch(`http://127.0.0.1:${port}/`);
        await response.text();
        requests.push(Math.round(performance.now() - start));
        await Bun.sleep(100);
      }
      const result = { label, requests: requests.length, delaysOver500ms: requests.filter(ms => ms >= 500).length, worstMs: Math.max(...requests), latenciesMs: requests };
      results.push(result);
      console.log(JSON.stringify(result));
    } finally { child.kill('SIGTERM'); await child.exited; }
  }
  writeFileSync(`${dir}/results.json`, JSON.stringify({ measuredAt: new Date().toISOString(), delayMs: 1200, platform: process.platform, results }, null, 2));
}
