// Lab · Stress: pages that push snapshot limits and settle detection: thousands
// of buttons, a 1,000-level DOM, a 2,000-row table, look-alike buttons, 50
// iframes, constant mutation, a 10,000-option select and a long main-thread task.

import { h, raw } from '../lib/html.ts';
import { lab } from './kit.ts';

const score = (row: number) => (row * 7919) % 1000;
const SNACKS = Array.from({ length: 100 }, (_, i) => (i === 63 ? 'Trail Mix' : `Snack bar #${i + 1}`));

lab('stress', [
  {
    slug: 'many-buttons', title: '5,000 buttons', task: 'Click "Item 4999".', check: 'auto', needs: ['scroll', 'click'], level: 3,
    note: 'Element snapshots are capped (FastPilot keeps the 300 nearest), so the target starts out omitted.',
    body: h`<div class="btn-wall" id="wall">${raw(Array.from({ length: 5000 }, (_, i) => `<button type="button" class="small secondary" data-i="${i + 1}">Item ${i + 1}</button>`).join(''))}</div>`,
  },
  {
    slug: 'deep-dom', title: '1,000 levels deep', task: 'Click "Deep end".', check: 'auto', needs: ['click'], level: 2,
    body: h`${raw(`${'<div class="deep">'.repeat(1000)}<button type="button" data-pass="clicked 1,000 levels down">Deep end</button>${'</div>'.repeat(1000)}`)}`,
  },
  {
    slug: 'huge-table', title: '2,000 rows', task: 'What is the Score in row 1873? Submit it in the Answer box.', check: 'answer', needs: ['scroll', 'read', 'type'], level: 2,
    answer: score(1873),
    body: h`<table class="huge"><thead><tr><th>Row</th><th>Name</th><th class="num">Score</th></tr></thead><tbody>${raw(Array.from({ length: 2000 }, (_, i) => `<tr><td>${i + 1}</td><td>Hiker ${((i * 37) % 2000) + 1}</td><td class="num">${score(i + 1)}</td></tr>`).join(''))}</tbody></table>`,
  },
  {
    slug: 'look-alikes', title: '100 identical buttons', task: 'Press Add for "Trail Mix".', check: 'auto', needs: ['scroll', 'click'], level: 2,
    note: 'Every button is labelled "Add"; only the heading above tells them apart.',
    body: h`<div class="snack-grid">${SNACKS.map((s) => h`<div class="card snack"><h3>${s}</h3><button type="button" class="small" ${s === 'Trail Mix' ? h`data-pass="added Trail Mix"` : h`data-fail="added ${s}"`}>Add</button></div>`)}</div>`,
  },
  {
    slug: 'many-frames', title: '50 iframes', task: 'Press the button inside frame 37.', check: 'auto', needs: ['click'], level: 2,
    body: h`<div class="frame-grid">${Array.from({ length: 50 }, (_, i) => h`<iframe title="Frame ${i + 1}" class="mini-frame" srcdoc="${`<body style="font:13px system-ui;margin:6px"><button type="button" onclick="parent.G.report('lab/stress/many-frames', ${i === 36 ? "'pass'" : "'fail'"}, 'pressed frame ${i + 1}', event)">Frame ${i + 1}</button></body>`}"></iframe>`)}</div>`,
  },
  {
    slug: 'never-settles', title: 'A page that never stops changing', task: 'Press "Stop the clock".', check: 'auto', needs: ['click'], level: 2,
    note: 'The DOM changes every 50 ms, so "wait until the DOM is quiet" never succeeds.',
    body: h`<p class="big-counter" id="clock">00:00.000</p><ul class="churn" id="churn"></ul><button type="button" id="stop-clock">Stop the clock</button>`,
  },
  {
    slug: 'huge-select', title: '10,000 options', task: 'Choose "Option 8642" in the select.', check: 'auto', needs: ['select'], level: 1,
    body: h`<label for="big-select">Option</label><select id="big-select"><option value="">Choose…</option>${raw(Array.from({ length: 10000 }, (_, i) => `<option>Option ${i + 1}</option>`).join(''))}</select>`,
  },
  {
    slug: 'long-task', title: 'A frozen main thread', task: 'Press "Crunch numbers" and submit the result in the Answer box.', check: 'answer', needs: ['click', 'wait', 'read', 'type'], level: 2,
    answer: 7340032, note: 'The page blocks its main thread for about 3 seconds, so injected scripts cannot run meanwhile.',
    body: h`<button type="button" id="crunch">Crunch numbers</button><p id="crunch-out"></p>`,
  },
]);
