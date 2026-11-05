// Runs Obeya's label suggestion for real (the Agent SDK on this machine's login) on sample cards,
// and writes index.html with what the model suggested.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const W = '/Users/nick/.obeya/workspaces/obeya-dev/df655a51';
const { Board } = await import(`${W}/src/server/board.ts`);
const { Store } = await import(`${W}/src/server/db.ts`);
const { Koordinator } = await import(`${W}/src/server/koordinator.ts`);
const { sdkRuntime } = await import(`${W}/src/server/runtime.ts`);
const { gitRepo } = await import(`${W}/src/server/testing.ts`);
const { LABEL_NAMES, PRIORITY_NAMES, COMPLEXITY_DESCRIPTIONS } = await import(`${W}/src/core/labels.ts`);

const dir = mkdtempSync(join(tmpdir(), 'labels-demo-'));
const main = gitRepo(join(dir, 'main'));
const board = new Board(new Store(':memory:'), { id: 'c', name: 'C', repos: [{ id: 'home', name: 'Home', path: main, branch: 'main' }] }, () => ({ docs: [], dirs: [] }));

type Case = { how: string; title: string; body: string; owner?: Record<string, unknown>; toggles?: object; note: string };
const cases: Case[] = [
  { how: 'naming', title: '', body: 'When I drag a card onto another one, the arrow between them disappears after a page reload.', note: 'No title: one naming call returns the title and all four labels.' },
  { how: 'naming', title: '', body: 'Add a column archived_at to the cards table and backfill it from the log entries of archived cards.', note: 'No title: one naming call.' },
  { how: 'start', title: 'Fix the typo in the README install section', body: '"bun instal" should be "bun install".', note: 'Titled: one short labels call at its start.' },
  { how: 'start', title: 'Login fails for every user since this morning', body: 'Every sign-in returns a 500 since the deploy at 8:00. Nobody can work.', note: 'Titled: one short labels call at its start.' },
  { how: 'start', title: 'Rename the queue helpers to match the design doc', body: 'queueOrder, reach and movable read oddly next to the chapter. No behaviour change.', owner: { priority: 'low' }, note: 'The owner set priority Low: only the other three are asked for, and Low stays.' },
  { how: 'start', title: 'Ship a dark theme for the canvas', body: 'A toggle in the preferences; every colour of cards, arrows and sheets follows it.', toggles: { priority: false }, note: 'The canvas has the Priority toggle off: priority is not asked for.' },
  { how: 'start', title: 'Add retries to the upload script', body: 'scripts/upload.ts gives up on the first network error.', owner: { category: 'tooling', subcategory: 'configuration', complexity: 2, priority: 'medium' }, note: 'Every label set by the owner: no session runs at all.' },
];

const rows: string[] = [];
let sessions = 0;
const counting = { start: (spec: any, m: any, i: any) => (sessions++, sdkRuntime.start(spec, m, i)) };
for (const c of cases) {
  const card = board.create({ title: c.title, body: c.body, x: 0, y: 0 });
  if (c.owner) board.patch(card.id, c.owner);
  const k = new Koordinator({ board, runtime: counting as never, home: () => main, repoFor: () => ({ path: main }) as never, holdMs: 0, ...(c.toggles ? { suggests: () => c.toggles } : {}) });
  const before = sessions;
  const t0 = Date.now();
  if (c.how === 'naming') await k.name(card.id);
  else {
    (k as any).suggestAtStart(card.id);
    if (sessions > before) for (const end = Date.now() + 120_000; !board.item(card.id).suggested && Date.now() < end; ) await Bun.sleep(300);
  }
  const ms = Date.now() - t0;
  const i = board.item(card.id);
  const cell = (l: string, v: unknown, name: string) =>
    v === undefined ? '<td class="empty">–</td>' : (i.suggested?.includes(l) ? `<td><span class="chip">${name}</span></td>` : `<td class="own">${name}</td>`);
  rows.push(`<tr><td><b>${i.title || '<i>(none)</i>'}</b><div class="body">${c.body}</div><div class="note">${c.note}</div></td>
    ${cell('category', i.category, LABEL_NAMES[i.category])}${cell('subcategory', i.subcategory, LABEL_NAMES[i.subcategory])}
    ${cell('complexity', i.complexity, i.complexity ? `<span title="${COMPLEXITY_DESCRIPTIONS[i.complexity]}">${i.complexity}</span>` : '')}${cell('priority', i.priority, PRIORITY_NAMES[i.priority])}
    <td class="calls">${sessions - before}<div class="ms">${sessions > before ? (ms / 1000).toFixed(1) + ' s' : ''}</div></td></tr>`);
  console.log(i.title, i.category, i.subcategory, i.complexity, i.priority, i.suggested, sessions - before, ms);
}

writeFileSync(
  join(import.meta.dirname, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Obeya suggests card labels</title><style>
body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#222;max-width:800px}
h1{font-size:20px;margin:0 0 6px}p{margin:0 0 14px;color:#444}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e3e3e3;padding:8px 6px;text-align:left;vertical-align:top}
th{font-size:12px;color:#666;font-weight:600}
.chip{display:inline-block;padding:1px 8px;border:2px solid #a855f7;border-radius:6px;color:#5b21b6;white-space:nowrap}
td.own{font-weight:600}td.empty{color:#bbb}.body{color:#555;font-size:12.5px;margin-top:2px}.note{color:#888;font-size:12px;margin-top:4px;font-style:italic}
.calls{text-align:center}.ms{font-size:11px;color:#888}.key span{display:inline-block;padding:1px 8px;border-radius:6px;margin-right:10px}
</style><h1>Obeya suggests the labels the owner left empty</h1>
<p>Each row is a card run through the real suggestion on this machine (Claude, the „Kleine Aufgaben“ group). A card without a title gets its title and labels from one naming call; a card with a title gets one short call at its start, which the start never waits for.</p>
<p class="key"><span class="chip">suggested by Obeya</span><span style="font-weight:600">set by the owner</span><span style="color:#bbb">– not asked for</span></p>
<table><tr><th>Card</th><th>Category</th><th>Sub-category</th><th>Complexity</th><th>Priority</th><th>Calls</th></tr>${rows.join('')}</table>`,
);
process.exit(0);
