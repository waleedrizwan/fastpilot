// The Workspace: a single-page app served at /app/* (history routing) and
// /app-hash/ (hash routing). Views live in public/js/app/; state is per session.

import { define } from '../challenges.ts';
import { MONTHS, OWNERS, REVENUE, seedCards, seedEvents, seedProjects, type CalEvent, type Card, type Project } from '../lib/data.ts';
import { h, jsonScript } from '../lib/html.ts';
import { get, json, post, type Req, type Session } from '../lib/http.ts';
import { page } from '../lib/layout.ts';
import { report } from '../lib/state.ts';

const projects0 = seedProjects();
const byBudget = [...projects0].sort((a, b) => b.budget - a.budget);
export const budgetCode = (p: Project) => `${p.name.slice(0, 3).toUpperCase()}-${String((p.budget / 1000) * 37 + p.id).padStart(4, '0')}`;
const INITIAL_DOC = `<h2>Trip plan: Larch Ridge</h2><p>This is urgent: book the campsite permits before Friday.</p>
<p>Group of four, three nights. Meet at the trailhead at 7:00.</p><ul class="checklist"><li data-checked="true">Check the forecast</li><li data-checked="false">Rent a bear canister</li></ul>`;
const SPECIAL_MAIL = 7342;

define(
  {
    id: 'app/top-budget', area: 'app', title: 'Biggest budget', path: '/app/projects',
    task: 'In the workspace Projects table, find the project with the largest budget and submit its name in the Answer box.',
    check: 'answer', needs: ['click', 'read', 'type'], level: 2, answer: byBudget[0].name,
    note: 'The Budget column is hidden until you turn it on from the Columns menu.',
  },
  {
    id: 'app/rename-project', area: 'app', title: 'Inline rename', path: '/app/projects',
    task: 'In the workspace Projects table, rename the project "Beta" to "Gamma".',
    check: 'auto', needs: ['dblclick', 'type', 'key'], level: 2, note: 'Names are edited by double-clicking the cell.',
  },
  {
    id: 'app/archive-owner', area: 'app', title: 'Bulk archive', path: '/app/projects',
    task: 'In the workspace Projects table, archive every project owned by Priya, and no others.',
    check: 'auto', needs: ['click', 'type'], level: 2,
  },
  {
    id: 'app/context-duplicate', area: 'app', title: 'Right-click duplicate', path: '/app/projects',
    task: 'In the workspace Projects table, duplicate the project "Kestrel" using its right-click menu.',
    check: 'auto', needs: ['rightclick', 'click'], level: 2,
  },
  {
    id: 'app/project-code', area: 'app', title: 'Hidden in an expanded row', path: '/app/projects',
    task: 'In the workspace Projects table, expand the row for Juniper and submit its budget code in the Answer box.',
    check: 'answer', needs: ['click', 'read', 'type'], level: 1, answer: budgetCode(projects0.find((p) => p.name === 'Juniper')!),
  },
  {
    id: 'app/hash-owner-count', area: 'app', title: 'Hash-routed count', path: '/app-hash/',
    task: 'In the hash-routed version of the workspace, open Projects and count how many projects Lena owns. Submit the number in the Answer box.',
    check: 'answer', needs: ['click', 'read', 'type'], level: 1, answer: projects0.filter((p) => p.owner === 'Lena').length,
  },
  {
    id: 'app/move-card', area: 'app', title: 'Move a card', path: '/app/board',
    task: 'On the workspace board, move the card "Fix login bug" to the Done column.',
    check: 'auto', needs: ['click'], level: 1, note: 'Cards can be dragged, or moved with their ⋯ menu.',
  },
  {
    id: 'app/board-reorder', area: 'app', title: 'Reorder by dragging', path: '/app/board',
    task: 'On the workspace board, drag "Update size chart" above "Write packing checklist" in the Backlog column.',
    check: 'auto', needs: ['drag'], level: 2,
  },
  {
    id: 'app/create-event', area: 'app', title: 'Create an event', path: '/app/calendar',
    task: 'In the workspace calendar, create an event called "Team hike" on November 18, 2026 at 9:30 AM lasting 3 hours.',
    check: 'auto', needs: ['click', 'type', 'select'], level: 2,
  },
  {
    id: 'app/reschedule', area: 'app', title: 'Drag to reschedule', path: '/app/calendar',
    task: 'In the workspace calendar, move the "Trail cleanup" event to October 31, 2026.',
    check: 'auto', needs: ['drag'], level: 2, note: 'Events are moved by dragging them to another day.',
  },
  {
    id: 'app/bold-word', area: 'app', title: 'Bold one word', path: '/app/docs',
    task: 'In the workspace Docs editor, make the word "urgent" bold, and nothing else.',
    check: 'auto', needs: ['click', 'key'], level: 3, note: 'Needs a text selection: double-click, drag, or Shift+arrow keys.',
  },
  {
    id: 'app/doc-checklist', area: 'app', title: 'Slash-menu checklist', path: '/app/docs',
    task: 'In the workspace Docs editor, add a checklist item "Pack bear spray" to the end of the document.',
    check: 'auto', needs: ['click', 'type', 'key'], level: 2, note: 'Type "/" on an empty line to open the block menu.',
  },
  {
    id: 'app/inbox-archive', area: 'app', title: 'Needle in 10,000 emails', path: '/app/inbox',
    task: 'In the workspace inbox, archive the email from Rosa Diaz about "Permit renewal".',
    check: 'auto', needs: ['scroll', 'click', 'type', 'key'], level: 3, note: 'The list is virtualized: only visible rows exist in the DOM.',
  },
  {
    id: 'app/settings-digest', area: 'app', title: 'Save settings', path: '/app/settings',
    task: 'In workspace Settings, turn on the weekly digest email and save.',
    check: 'auto', needs: ['click'], level: 1, note: 'Leaving with unsaved changes asks for confirmation.',
  },
  {
    id: 'app/palette-theme', area: 'app', title: 'Command palette', path: '/app',
    task: 'Use the workspace command palette (Ctrl+K or ⌘K) to switch to the dark theme.',
    check: 'auto', needs: ['key', 'type'], level: 2,
  },
  {
    id: 'app/chart-july', area: 'app', title: 'Read a canvas chart', path: '/app',
    task: 'On the workspace dashboard, read July\'s revenue from the chart (in thousands of dollars) and submit the number in the Answer box.',
    check: 'answer', needs: ['screenshot', 'type'], level: 2, answer: REVENUE[6], note: 'The chart is a <canvas>; its values are not in the DOM.',
  },
  {
    id: 'app/date-range', area: 'app', title: 'Last 90 days', path: '/app',
    task: 'On the workspace dashboard, change the date range to the last 90 days.',
    check: 'auto', needs: ['click'], level: 1,
  },
);

interface AppState { projects: Project[]; cards: Card[]; events: CalEvent[]; doc: string; settings: Record<string, unknown>; archived: number[] }

function state(s: Session): AppState {
  return (s.data.app ??= {
    projects: seedProjects(), cards: seedCards(), events: seedEvents(), doc: INITIAL_DOC, archived: [],
    settings: { workspaceName: 'Trail Crew', timezone: 'America/Toronto', weekStart: 'Monday', digest: false, mentions: true, assignments: true, theme: 'light', slack: false, calendarSync: true },
  });
}

function shell(req: Req, routing: 'history' | 'hash') {
  const st = state(req.session);
  return page({
    req, title: 'Workspace', shell: 'app', bodyClass: st.settings.theme === 'dark' ? 'app-dark' : '',
    scripts: ['core', 'dashboard', 'projects', 'board', 'calendar', 'docs', 'inbox', 'settings'].map((f) => `/static/js/app/${f}.js`),
    body: h`<div class="app" data-routing="${routing}" data-base="${routing === 'hash' ? '/app-hash/' : '/app'}">
      <aside class="app-nav" aria-label="Workspace">
        <div class="app-brand">Trail Crew</div>
        <nav><ul>
          ${[['', 'Dashboard', '◧'], ['projects', 'Projects', '▤'], ['board', 'Board', '▥'], ['calendar', 'Calendar', '▦'], ['docs', 'Docs', '✎'], ['inbox', 'Inbox', '✉'], ['settings', 'Settings', '⚙']].map(([r, label, icon]) =>
            h`<li><a href="${routing === 'hash' ? `#/${r}` : `/app${r ? `/${r}` : ''}`}" data-route="${r}"><span aria-hidden="true">${icon}</span> ${label}</a></li>`)}
        </ul></nav>
        <button type="button" class="palette-hint" data-palette-open>Search or jump… <kbd>⌘K</kbd></button>
      </aside>
      <section class="app-main">
        <div id="view" tabindex="-1"><p class="muted">Loading…</p></div>
      </section>
    </div>
    <div class="modal-backdrop palette-backdrop" id="palette" hidden>
      <div class="modal palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" placeholder="Type a command" data-palette-input>
        <ul id="palette-list" role="listbox" data-palette-list></ul>
      </div>
    </div>
    <div class="modal-backdrop" id="discard-modal" hidden data-static>
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="discard-title">
        <h2 id="discard-title">Discard unsaved changes?</h2><p>You changed settings without saving them.</p>
        <div class="actions"><button type="button" class="secondary" data-discard="stay">Keep editing</button><button type="button" class="danger" data-discard="leave">Discard changes</button></div>
      </div>
    </div>
    ${jsonScript('app-meta', { owners: OWNERS, months: MONTHS, revenue: REVENUE, special: SPECIAL_MAIL })}`,
  });
}

get('/app', (req) => shell(req, 'history'));
get('/app/*', (req) => shell(req, 'history'));
get('/app-hash/', (req) => shell(req, 'hash'));
get('/app-hash', (req) => shell(req, 'hash'));

const pub = (p: Project) => ({ ...p, code: budgetCode(p) });

get('/api/app/projects', (req) => {
  setTimeout(() => json(req, state(req.session).projects.map(pub)), 300);
});

function checkProjects(req: Req) {
  const list = state(req.session).projects;
  if (list.some((p) => p.name === 'Gamma' && p.id === 2) && !list.some((p) => p.name === 'Beta')) return report(req, 'app/rename-project', 'pass', 'Beta renamed to Gamma', false);
  return undefined;
}

post('/api/app/projects/:id', (req) => {
  const p = state(req.session).projects.find((x) => x.id === Number(req.params.id));
  if (!p) return json(req, { error: 'No such project' }, 404);
  const { name, status, owner, progress } = req.json ?? {};
  if (typeof name === 'string' && name.trim()) p.name = name.trim().slice(0, 40);
  if (['Active', 'Paused', 'Done', 'Archived'].includes(status)) p.status = status;
  if (OWNERS.includes(owner)) p.owner = owner;
  if (Number.isFinite(progress)) p.progress = Math.max(0, Math.min(100, progress));
  json(req, { project: pub(p), flash: checkProjects(req) });
});

post('/api/app/projects-bulk', (req) => {
  const st = state(req.session);
  const ids: number[] = (req.json?.ids ?? []).map(Number);
  const action = req.json?.action;
  let flash;
  for (const p of st.projects.filter((x) => ids.includes(x.id))) {
    if (action === 'archive') p.status = 'Archived';
    if (action === 'activate') p.status = 'Active';
  }
  if (action === 'delete') st.projects = st.projects.filter((p) => !ids.includes(p.id));
  if (action === 'archive') {
    const archived = st.projects.filter((p) => p.status === 'Archived');
    const priya = st.projects.filter((p) => p.owner === 'Priya');
    const ok = priya.every((p) => p.status === 'Archived') && archived.every((p) => p.owner === 'Priya');
    flash = report(req, 'app/archive-owner', ok ? 'pass' : 'fail', `archived ${archived.map((p) => p.name).join(', ')}`, false);
  }
  json(req, { projects: st.projects.map(pub), flash });
});

post('/api/app/projects/:id/duplicate', (req) => {
  const st = state(req.session);
  const p = st.projects.find((x) => x.id === Number(req.params.id));
  if (!p) return json(req, { error: 'No such project' }, 404);
  const copy = { ...p, id: Math.max(...st.projects.map((x) => x.id)) + 1, name: `${p.name} (copy)` };
  st.projects.splice(st.projects.indexOf(p) + 1, 0, copy);
  const flash = p.name === 'Kestrel' ? report(req, 'app/context-duplicate', 'pass', 'Kestrel duplicated', false) : undefined;
  json(req, { projects: st.projects.map(pub), flash });
});

get('/api/app/cards', (req) => json(req, state(req.session).cards));

post('/api/app/cards', (req) => {
  // Body: the full new order as [{id, column}], so drag reorders and menu moves share one endpoint.
  const st = state(req.session);
  const order: { id: number; column: Card['column'] }[] = req.json?.order ?? [];
  const next: Card[] = [];
  for (const o of order) {
    const c = st.cards.find((x) => x.id === o.id);
    if (c && ['Backlog', 'In progress', 'Review', 'Done'].includes(o.column)) next.push({ ...c, column: o.column });
  }
  if (next.length === st.cards.length) st.cards = next;
  const flashes = [];
  if (st.cards.find((c) => c.id === 1)?.column === 'Done') flashes.push(report(req, 'app/move-card', 'pass', '"Fix login bug" is in Done', false));
  const backlog = st.cards.filter((c) => c.column === 'Backlog').map((c) => c.id);
  if (backlog.includes(3) && backlog.includes(2) && backlog.indexOf(3) < backlog.indexOf(2) && req.json?.via === 'drag') {
    flashes.push(report(req, 'app/board-reorder', 'pass', '"Update size chart" is above "Write packing checklist"', false));
  }
  json(req, { cards: st.cards, flash: flashes[0] });
});

get('/api/app/events', (req) => json(req, state(req.session).events));

post('/api/app/events', (req) => {
  const st = state(req.session);
  const { title, date, time, duration } = req.json ?? {};
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return json(req, { error: 'Title, date and time are required' }, 400);
  const ev: CalEvent = { id: Math.max(0, ...st.events.map((e) => e.id)) + 1, title: String(title).slice(0, 60), date, time, duration: Number(duration) || 60 };
  st.events.push(ev);
  let flash;
  if (/team hike/i.test(ev.title)) {
    const ok = ev.title.trim().toLowerCase() === 'team hike' && ev.date === '2026-11-18' && ev.time === '09:30' && ev.duration === 180;
    flash = report(req, 'app/create-event', ok ? 'pass' : 'fail', `${ev.title} on ${ev.date} at ${ev.time} for ${ev.duration} min`, false);
  }
  json(req, { events: st.events, flash });
});

post('/api/app/events/:id', (req) => {
  const st = state(req.session);
  const ev = st.events.find((e) => e.id === Number(req.params.id));
  if (!ev) return json(req, { error: 'No such event' }, 404);
  if (req.json?.delete) st.events.splice(st.events.indexOf(ev), 1);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(req.json?.date)) ev.date = req.json.date;
  const flash = ev.title === 'Trail cleanup' && ev.date === '2026-10-31' && !req.json?.delete ? report(req, 'app/reschedule', 'pass', 'moved to October 31', false) : undefined;
  json(req, { events: st.events, flash });
});

get('/api/app/doc', (req) => json(req, { html: state(req.session).doc }));

post('/api/app/doc', (req) => {
  const st = state(req.session);
  st.doc = String(req.json?.html ?? '').slice(0, 50_000);
  const text = st.doc.replace(/<[^>]+>/g, ' ');
  const flashes = [];
  const bolds = [...st.doc.matchAll(/<(b|strong)>(.*?)<\/\1>/gi)].map((m) => m[2].replace(/<[^>]+>/g, '').trim());
  if (bolds.length && bolds.every((b) => b.toLowerCase() === 'urgent') && /\burgent\b/i.test(text)) {
    flashes.push(report(req, 'app/bold-word', 'pass', '"urgent" is bold', false));
  } else if (bolds.some((b) => /urgent/i.test(b))) {
    flashes.push(report(req, 'app/bold-word', 'fail', `bolded "${bolds.join('", "')}"`, false));
  }
  const items = [...st.doc.matchAll(/<li[^>]*data-checked="(?:true|false)"[^>]*>(.*?)<\/li>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  if (items.at(-1)?.toLowerCase() === 'pack bear spray') flashes.push(report(req, 'app/doc-checklist', 'pass', 'checklist item added', false));
  json(req, { ok: true, savedAt: Date.now(), flash: flashes.find((f) => f.status === 'pass') ?? flashes[0] });
});

post('/api/app/inbox/archive', (req) => {
  const st = state(req.session);
  const id = Number(req.json?.id);
  if (!st.archived.includes(id)) st.archived.push(id);
  const flash = id === SPECIAL_MAIL ? report(req, 'app/inbox-archive', 'pass', 'archived the Permit renewal email', false) : undefined;
  json(req, { archived: st.archived, flash });
});

get('/api/app/inbox/archived', (req) => json(req, state(req.session).archived));

get('/api/app/settings', (req) => json(req, state(req.session).settings));

post('/api/app/settings', (req) => {
  const st = state(req.session);
  const { via, ...changes } = req.json ?? {};
  for (const [k, v] of Object.entries(changes)) if (k in st.settings) st.settings[k] = v;
  let flash;
  if ('digest' in changes && via === 'settings') flash = report(req, 'app/settings-digest', st.settings.digest === true ? 'pass' : 'fail', `digest ${st.settings.digest ? 'on' : 'off'}`, false);
  if (changes.theme === 'dark' && via === 'palette') flash = report(req, 'app/palette-theme', 'pass', 'dark theme from the palette', false);
  json(req, { settings: st.settings, flash });
});

post('/api/app/range', (req) => {
  const flash = req.json?.range === '90d' ? report(req, 'app/date-range', 'pass', 'range set to 90 days', false) : undefined;
  json(req, { flash });
});
