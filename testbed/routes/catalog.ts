// The challenge catalog, the scoreboard, and starting/ending a challenge.

import { AREAS, challenge, challenges, GAPS, supportedToday, type Challenge } from '../challenges.ts';
import { h } from '../lib/html.ts';
import { get, redirect, setCookie } from '../lib/http.ts';
import { page } from '../lib/layout.ts';
import { resultFor } from '../lib/results.ts';

const needsChips = (c: Challenge) =>
  c.needs.map((n) => h`<span class="chip ${GAPS.has(n) ? 'chip-gap' : ''}" title="${GAPS.has(n) ? 'FastPilot has no tool for this yet' : ''}">${n}</span>`);

const STATUS_TEXT = { pending: 'Pending', pass: 'Passed', fail: 'Failed', violation: 'Violation' };

get('/challenges', (req) => {
  const all = challenges();
  const byArea = AREAS.map(([area, title]) => [area, title, all.filter((c) => c.area === area)] as const).filter(([, , list]) => list.length);
  const gaps = all.filter((c) => !supportedToday(c)).length;
  return page({
    req, title: 'Challenges', crumbs: [['Home', '/'], ['Challenges']], scripts: ['/static/js/pages/catalog.js'],
    body: h`<h1>Challenges</h1>
      <p class="lede">${all.length} tasks for browser agents. Press <strong>Start</strong> to open a challenge (this also starts its timer),
        then paste the task into FastPilot. Results show up on the <a href="/scoreboard">scoreboard</a>.
        ${gaps} challenges probe things FastPilot has no tool for yet; their missing capabilities are <span class="chip chip-gap">marked</span>.</p>
      <div class="toolbar catalog-tools">
        <input type="search" id="cat-filter" placeholder="Filter by name, task or capability" aria-label="Filter challenges">
        <select id="area-filter" aria-label="Area"><option value="">All areas</option>${byArea.map(([area, title]) => h`<option value="${area}">${title}</option>`)}</select>
        <label class="inline"><input type="checkbox" id="only-supported"> Only supported today</label>
        <span class="spacer"></span>
        ${req.session.user ? h`<span class="muted">Signed in as demo</span>` : h`<a class="button secondary small" href="/challenges/demo-signin">Sign in as demo</a>`}
        <a class="button small" href="/scoreboard">Scoreboard</a>
      </div>
      ${byArea.map(([area, title, list]) => h`<section class="catalog-area" data-area="${area}">
        <h2>${title} <span class="muted">(${list.length})</span></h2>
        <table class="catalog">
          <thead><tr><th>Challenge</th><th>Task</th><th>Needs</th><th>Check</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${list.map((c) => {
            const st = resultFor(c.id).status;
            return h`<tr data-supported="${supportedToday(c) ? '1' : '0'}" data-id="${c.id}">
              <td><a href="/challenges/start/${c.id}">${c.title}</a><div class="muted small">${c.id} · level ${c.level}</div></td>
              <td class="task">${c.task}${c.note ? h`<div class="muted small">${c.note}</div>` : ''}</td>
              <td>${needsChips(c)}</td>
              <td>${c.check}</td>
              <td><span class="pill status-${st}">${STATUS_TEXT[st]}</span></td>
              <td class="actions"><a class="button small" href="/challenges/start/${c.id}">Start</a>
                <button type="button" class="small secondary" data-copy="${c.task}">Copy task</button></td>
            </tr>`;
          })}</tbody>
        </table>
      </section>`)}`,
  });
});

get('/challenges/start/*', (req) => {
  const c = challenge(req.params.rest);
  if (!c) return redirect(req, '/challenges');
  setCookie(req, 'gch', `${c.id}|${Date.now()}`);
  const passed: string[] | undefined = req.session.data.passed;
  if (passed) req.session.data.passed = passed.filter((x) => x !== c.id);
  c.onStart?.(req);
  redirect(req, c.path);
});

get('/challenges/end', (req) => {
  setCookie(req, 'gch', '', 'Path=/; Max-Age=0');
  const back = req.raw.headers.referer;
  redirect(req, back && new URL(back).origin === req.site.main ? new URL(back).pathname : '/challenges');
});

get('/challenges/demo-signin', (req) => {
  req.session.user = 'demo';
  redirect(req, '/challenges');
});

get('/scoreboard', (req) => {
  const rows = challenges().map((c) => ({ c, r: resultFor(c.id) }));
  const count = (f: (x: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const supported = rows.filter(({ c }) => supportedToday(c));
  const passTimes = rows.map(({ r }) => r.passMs).filter((n): n is number => typeof n === 'number');
  const avg = passTimes.length ? Math.round(passTimes.reduce((a, b) => a + b, 0) / passTimes.length / 100) / 10 : null;
  const byArea = AREAS.map(([area, title]) => [area, title, rows.filter(({ c }) => c.area === area)] as const).filter(([, , l]) => l.length);
  return page({
    req, title: 'Scoreboard', shell: 'lab', crumbs: [['Home', '/'], ['Scoreboard']], scripts: ['/static/js/pages/scoreboard.js'],
    body: h`<h1>Scoreboard</h1>
      <div class="stats">
        <div class="stat"><span class="n" data-stat="passed">${count(({ r }) => r.status === 'pass')}</span><span>passed of ${rows.length}</span></div>
        <div class="stat"><span class="n">${supported.filter(({ r }) => r.status === 'pass').length}</span><span>passed of ${supported.length} supported today</span></div>
        <div class="stat"><span class="n">${count(({ c, r }) => !supportedToday(c) && r.status === 'pass')}</span><span>passed of ${rows.length - supported.length} gap probes</span></div>
        <div class="stat bad"><span class="n">${count(({ r }) => r.status === 'violation')}</span><span>violations</span></div>
        <div class="stat"><span class="n">${avg ?? '–'}${avg !== null ? 's' : ''}</span><span>average time to pass</span></div>
      </div>
      <div class="toolbar">
        <select id="sb-filter" aria-label="Show">
          <option value="">All challenges</option><option value="attempted">Attempted</option><option value="pass">Passed</option>
          <option value="fail">Failed</option><option value="violation">Violations</option><option value="pending">Pending</option>
          <option value="supported">Supported today</option><option value="gap">Gap probes</option>
        </select>
        <label class="inline"><input type="checkbox" id="sb-live" checked> Live refresh</label>
        <span class="spacer"></span>
        <a class="button secondary small" href="/api/results?download=1">Export JSON</a>
        <button type="button" class="small secondary" id="sb-reset-site">Reset carts, orders and sessions</button>
        <button type="button" class="small danger" id="sb-reset-all">Reset all results</button>
      </div>
      ${byArea.map(([area, title, list]) => h`<section class="sb-area" data-area="${area}">
        <h2>${title} <span class="muted">${list.filter(({ r }) => r.status === 'pass').length}/${list.length}</span></h2>
        <table class="scoreboard">
          <thead><tr><th>Challenge</th><th>Status</th><th>Attempts</th><th>Time</th><th>Trusted</th><th>Last detail</th><th>Code</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${list.map(({ c, r }) => h`<tr data-id="${c.id}" data-status="${r.status}" data-supported="${supportedToday(c) ? '1' : '0'}" data-attempts="${r.attempts.length}">
            <td><a href="/challenges/start/${c.id}">${c.title}</a><div class="muted small">${c.id} · ${c.check}${supportedToday(c) ? '' : ' · gap probe'}</div></td>
            <td><span class="pill status-${r.status}">${STATUS_TEXT[r.status]}</span></td>
            <td>${r.attempts.length}</td>
            <td>${r.passMs !== undefined ? `${(r.passMs / 1000).toFixed(1)}s` : ''}</td>
            <td>${r.trusted === undefined ? '' : r.trusted ? 'yes' : 'no'}</td>
            <td class="small">${r.attempts.at(-1)?.detail ?? ''}</td>
            <td><code>${r.code ?? ''}</code></td>
            <td class="actions">
              ${c.check === 'handoff' ? h`<button type="button" class="small" data-mark="pass">Mark pass</button><button type="button" class="small secondary" data-mark="fail">Mark fail</button>` : ''}
              ${r.attempts.length ? h`<button type="button" class="small secondary" data-reset>Reset</button>` : ''}
            </td>
          </tr>`)}</tbody>
        </table>
      </section>`)}`,
  });
});
