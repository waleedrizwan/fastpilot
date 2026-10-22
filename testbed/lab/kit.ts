// Shared pieces for lab pages: lab() registers a page and its challenge in one
// go, and the /lab and /lab/<category> index pages list them.

import { challenges, define, LAB_CATEGORIES, supportedToday, type Challenge } from '../challenges.ts';
import { h, type Raw } from '../lib/html.ts';
import { get, type Req } from '../lib/http.ts';
import { errorPage, page } from '../lib/layout.ts';
import { resultFor } from '../lib/results.ts';

export interface LabPage extends Omit<Challenge, 'id' | 'area' | 'path'> {
  slug: string;
  /** Page markup under the <h1>. */
  body: Raw | ((req: Req) => Raw);
  shell?: 'lab' | 'bare';
  head?: Raw;
  htmlAttrs?: Raw;
  /** Overrides the page path when the task starts somewhere else (the page still lives at /lab/<cat>/<slug>). */
  start?: string;
}

const catTitle = (cat: string) => LAB_CATEGORIES.find(([s]) => s === cat)?.[1] ?? cat;

export function lab(cat: string, pages: LabPage[]): void {
  for (const p of pages) {
    const { slug, body, shell, head, htmlAttrs, start, ...c } = p;
    const id = `lab/${cat}/${slug}`;
    const path = `/lab/${cat}/${slug}`;
    define({ ...c, id, area: `lab:${cat}`, path: start ?? path });
    get(path, (req) => page({
      req, title: p.title, shell: shell ?? 'lab', lab: `${cat}/${slug}`, challenges: [id], head, htmlAttrs,
      crumbs: [['Lab', '/lab'], [catTitle(cat), `/lab/${cat}`], [p.title]],
      body: h`<h1>${p.title}</h1>${typeof body === 'function' ? body(req) : body}`,
    }));
  }
}

const row = (c: Challenge) => {
  const st = resultFor(c.id).status;
  return h`<tr><td><a href="/challenges/start/${c.id}">${c.title}</a></td><td>${c.task}</td>
    <td>${c.needs.map((n) => h`<span class="chip">${n}</span>`)}${supportedToday(c) ? '' : h` <span class="chip chip-gap">gap</span>`}</td>
    <td><span class="pill status-${st}">${st}</span></td></tr>`;
};

get('/lab', (req) => page({
  req, title: 'Lab', shell: 'lab', crumbs: [['Home', '/'], ['Lab']],
  body: h`<h1>The Lab</h1>
    <p class="lede">One mechanic per page. Each page is a challenge; open it from here or from the <a href="/challenges">catalog</a> to start its timer.</p>
    <div class="area-cards">${LAB_CATEGORIES.map(([slug, title, blurb]) => {
      const list = challenges().filter((c) => c.area === `lab:${slug}`);
      return h`<a class="card area-card" href="/lab/${slug}"><h2>${title} <span class="muted">${list.length}</span></h2><p>${blurb}</p></a>`;
    })}</div>`,
}));

get('/lab/:cat', (req) => {
  const cat = LAB_CATEGORIES.find(([s]) => s === req.params.cat);
  if (!cat) { req.res.statusCode = 404; return errorPage(req, 404, 'No such lab category', 'Pick one from the Lab index.'); }
  const list = challenges().filter((c) => c.area === `lab:${cat[0]}`);
  return page({
    req, title: cat[1], shell: 'lab', crumbs: [['Lab', '/lab'], [cat[1]]],
    body: h`<h1>${cat[1]}</h1><p class="lede">${cat[2]}.</p>
      <div class="table-wrap"><table><thead><tr><th>Page</th><th>Task</th><th>Needs</th><th>Status</th></tr></thead><tbody>${list.map(row)}</tbody></table></div>`,
  });
});

