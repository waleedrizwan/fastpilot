// Lab · Navigation: every redirect status, chains and loops, meta refresh, JS
// redirects, 404 and 500 pages, slow and never-ending pages, anchors,
// pushState, back/forward with form state, HTTP basic auth and javascript: links.

import { h } from '../lib/html.ts';
import { get, post, redirect, send, type Req } from '../lib/http.ts';
import { errorPage, page } from '../lib/layout.ts';
import { report } from '../lib/state.ts';
import { lab } from './kit.ts';

const navPage = (req: Req, title: string, body: ReturnType<typeof h>) =>
  page({ req, title, shell: 'lab', crumbs: [['Lab', '/lab'], ['Navigation', '/lab/nav'], [title]], body: h`<h1>${title}</h1>${body}` });

lab('nav', [
  {
    slug: 'redirect-codes', title: 'Every redirect status', task: 'Follow the "307 Temporary Redirect" link and submit the token shown on the page you land on in the Answer box.', check: 'answer', needs: ['click', 'read', 'type'], level: 1,
    answer: 'LANDED-307-K4',
    body: h`<ul>${[301, 302, 303, 307, 308].map((c) => h`<li><a href="/lab/nav/r/${c}">${c} ${{ 301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 307: 'Temporary Redirect', 308: 'Permanent Redirect' }[c]}</a></li>`)}</ul>`,
  },
  {
    slug: 'post-307', title: 'POST through a 307', task: 'Submit the RSVP form with the name Jo. The server answers with a 307 redirect that must keep the form data.', check: 'auto', needs: ['type', 'click'], level: 1,
    body: h`<form method="post" action="/lab/nav/rsvp"><label for="rsvp-name">Name</label><input id="rsvp-name" name="name"><button type="submit">RSVP</button></form>`,
  },
  {
    slug: 'chain', title: 'A five-hop redirect chain', task: 'Follow the "Partner offer" link to the end of its redirect chain and submit the token on the final page in the Answer box.', check: 'answer', needs: ['click', 'read', 'type'], level: 1,
    answer: 'HOP5-OK', body: h`<p><a href="/lab/nav/hop/1">Partner offer</a></p>`,
  },
  {
    slug: 'meta-refresh', title: 'Meta refresh', task: 'Wait to be sent onward from the "You are being redirected" page, then press "I made it".', check: 'auto', needs: ['click', 'wait'], level: 1,
    body: h`<p><a href="/lab/nav/refreshing">Go to the station</a></p>`,
  },
  {
    slug: 'js-redirect', title: 'A delayed JavaScript redirect', task: 'Open "Departures", wait for the page to move you on, and submit the gate number on the final page in the Answer box.', check: 'answer', needs: ['click', 'wait', 'read', 'type'], level: 1,
    answer: 'B17', body: h`<p><a href="/lab/nav/departures">Departures</a></p>`,
  },
  {
    slug: 'loop', title: 'A redirect loop', task: 'Try the "Partner portal" link. If it fails to load, come back here and press "Report broken link".', check: 'auto', needs: ['click', 'navigate'], level: 2,
    body: h`<p><a href="/lab/nav/loop/a">Partner portal</a></p><form method="post" action="/lab/nav/report-broken"><button type="submit" class="secondary">Report broken link</button></form>`,
  },
  {
    slug: 'not-found', title: 'A dead link', task: 'Open the "Old catalog" link. When it turns out to be missing, come back and use the "Current catalog" link instead.', check: 'auto', needs: ['click', 'navigate'], level: 1,
    body: h`<ul><li><a href="/lab/nav/catalog-2019">Old catalog</a></li><li><a href="/lab/nav/catalog-current">Current catalog</a></li></ul>`,
  },
  {
    slug: 'server-error', title: 'Retry after a 500', task: 'Open the monthly report. If it shows an error, retry until it loads, then submit the report total in the Answer box.', check: 'answer', needs: ['click', 'read', 'type'], level: 2,
    answer: 9431, body: h`<p><a href="/lab/nav/report">Monthly report</a></p>`,
  },
  {
    slug: 'slow-page', title: 'A five-second page', task: 'Open the slow report and submit its total in the Answer box.', check: 'answer', needs: ['click', 'wait', 'read', 'type'], level: 2,
    answer: 3377, body: h`<p><a href="/lab/nav/slow">Slow report</a> (the server takes about five seconds)</p>`,
  },
  {
    slug: 'never-loads', title: 'A page that never finishes', task: 'Open "Live dashboard" and press Continue on it.', check: 'auto', needs: ['click'], level: 2,
    note: 'The server sends the page but keeps the connection open, so the tab never reaches "complete".',
    body: h`<p><a href="/lab/nav/endless">Live dashboard</a></p>`,
  },
  {
    slug: 'anchors', title: 'Jump with anchors', task: 'Use the contents to jump to "Appendix B" and submit the reference number there in the Answer box.', check: 'answer', needs: ['click', 'read', 'type'], level: 1,
    answer: 'REF-2210',
    body: h`<nav class="toc card"><strong>Contents</strong><ol>${['Introduction', 'Methods', 'Results', 'Appendix A', 'Appendix B'].map((s) => h`<li><a href="#${s.toLowerCase().replace(' ', '-')}">${s}</a></li>`)}</ol></nav>
      ${['Introduction', 'Methods', 'Results', 'Appendix A', 'Appendix B'].map((s) => h`<section id="${s.toLowerCase().replace(' ', '-')}" class="tall-section"><h2>${s}</h2><p>${s === 'Appendix B' ? 'Reference number: REF-2210.' : s === 'Appendix A' ? 'Reference number: REF-1104.' : 'Body text. '.repeat(60)}</p></section>`)}`,
  },
  {
    slug: 'push-state', title: 'Tabs in the URL', task: 'Open the Billing tab, then use the browser Back button to return to the Overview tab.', check: 'auto', needs: ['click', 'navigate'], level: 2,
    note: 'Tabs change the URL with history.pushState, without loading a new page.',
    body: h`<nav class="seg" aria-label="Account sections"><a href="?tab=overview" data-tab="overview" aria-current="page">Overview</a><a href="?tab=billing" data-tab="billing">Billing</a><a href="?tab=usage" data-tab="usage">Usage</a></nav><div id="tab-body"><p>Overview: 3 active trips.</p></div>`,
  },
  {
    slug: 'back-form', title: 'Back to a filled form', task: 'Order a Medium T-shirt with the name "Jo" printed on it and continue. On the summary page, go back, change the size to Large, and continue again.', check: 'auto', needs: ['select', 'type', 'click', 'navigate'], level: 2,
    body: h`<form method="post" action="/lab/nav/shirt"><label for="shirt-name">Name to print</label><input id="shirt-name" name="name">
      <label for="shirt-size">Size</label><select id="shirt-size" name="size"><option value="">Choose…</option><option>Small</option><option>Medium</option><option>Large</option></select>
      <div class="form-actions"><button type="submit">Continue</button></div></form>`,
  },
  {
    slug: 'basic-auth', title: 'HTTP basic auth', task: 'Open the staff area.', check: 'handoff', needs: ['click', 'basicauth', 'handoff'], level: 2,
    note: 'The browser shows its own username and password prompt. The agent has no credentials and should hand off.',
    body: h`<p><a href="/lab/nav/staff">Staff area</a></p>`,
  },
  {
    slug: 'js-links', title: 'Links that are really scripts', task: 'Go to the next page of results.', check: 'auto', needs: ['click'], level: 1,
    body: h`<p>Results 1–10 of 30.</p><p><a href="javascript:void(0)" id="js-prev">‹ Previous</a> · <a href="#" id="js-next">Next page ›</a></p>`,
  },
]);

const CODES = { 301: 'Q2', 302: 'M8', 303: 'X1', 307: 'K4', 308: 'Z6' } as Record<string, string>;
get('/lab/nav/r/:code', (req) => redirect(req, `/lab/nav/landed/${req.params.code}`, Number(req.params.code)));
get('/lab/nav/landed/:code', (req) => navPage(req, 'You landed', h`<p>Redirect status ${req.params.code} brought you here.</p><p>Token: <strong>LANDED-${req.params.code}-${CODES[req.params.code] ?? '00'}</strong></p><p><a href="/lab/nav/redirect-codes">Back</a></p>`));

post('/lab/nav/rsvp', (req) => redirect(req, '/lab/nav/rsvp-final', 307));
post('/lab/nav/rsvp-final', (req) => {
  const name = (req.form.get('name') ?? '').trim();
  report(req, 'lab/nav/post-307', name === 'Jo' ? 'pass' : 'fail', name ? `RSVP from ${name} survived the 307` : 'form data was lost');
  return navPage(req, 'RSVP received', h`<p>Thanks${name ? `, ${name}` : ''}! See you there.</p>`);
});

get('/lab/nav/hop/:n', (req) => {
  const n = Number(req.params.n);
  if (n < 5) return redirect(req, `/lab/nav/hop/${n + 1}`, n % 2 ? 302 : 301);
  return navPage(req, 'Partner offer', h`<p>You made it through five redirects.</p><p>Token: <strong>HOP5-OK</strong></p>`);
});

get('/lab/nav/refreshing', (req) => page({
  req, title: 'Redirecting', shell: 'lab', head: h`<meta http-equiv="refresh" content="3;url=/lab/nav/station">`,
  body: h`<h1>You are being redirected</h1><p>Hold on, taking you to the station in 3 seconds…</p>`,
}));
get('/lab/nav/station', (req) => navPage(req, 'Station', h`<p>Welcome to the station.</p><button type="button" data-challenge="lab/nav/meta-refresh" data-pass="arrived after the meta refresh">I made it</button>`));

get('/lab/nav/departures', (req) => page({
  req, title: 'Departures', shell: 'lab', scripts: ['/static/js/lab/nav-redirect.js'],
  body: h`<h1>Departures</h1><p>Finding your gate… you will be moved on in 3 seconds.</p>`,
}));
get('/lab/nav/gate', (req) => navPage(req, 'Your gate', h`<p>Flight GT 214 to Calgary boards from gate <strong>B17</strong>.</p>`));

get('/lab/nav/loop/:x', (req) => {
  req.session.data.loopVisits = (req.session.data.loopVisits ?? 0) + 1;
  redirect(req, `/lab/nav/loop/${req.params.x === 'a' ? 'b' : 'a'}`);
});
post('/lab/nav/report-broken', (req) => {
  const tried = (req.session.data.loopVisits ?? 0) > 0;
  report(req, 'lab/nav/loop', tried ? 'pass' : 'fail', tried ? 'tried the looping link, then reported it' : 'reported without trying the link');
  return navPage(req, 'Thanks', h`<p>Thanks for reporting the broken link.</p>`);
});

get('/lab/nav/catalog-2019', (req) => {
  req.session.data.saw404 = true;
  req.res.statusCode = 404;
  return errorPage(req, 404, 'Catalog not found', 'The 2019 catalog was retired.');
});
get('/lab/nav/catalog-current', (req) => {
  report(req, 'lab/nav/not-found', req.session.data.saw404 ? 'pass' : 'fail', req.session.data.saw404 ? 'found the current catalog after the 404' : 'skipped the old link');
  return navPage(req, 'Current catalog', h`<p>The autumn 2026 catalog has 36 products.</p>`);
});

get('/lab/nav/report', (req) => {
  const n = (req.session.data.reportTries = (req.session.data.reportTries ?? 0) + 1);
  if (n % 2) {
    req.res.statusCode = 500;
    return page({ req, title: 'Server error', shell: 'lab', body: h`<section class="error-page"><p class="error-code">500</p><h1>Something went wrong</h1><p>The report service hiccuped.</p><p><a class="button" href="/lab/nav/report">Retry</a></p></section>` });
  }
  return navPage(req, 'Monthly report', h`<table><tbody><tr><td>Day passes</td><td class="num">5,210</td></tr><tr><td>Annual passes</td><td class="num">4,221</td></tr><tr><th>Total</th><td class="num"><strong>9,431</strong></td></tr></tbody></table>`);
});

get('/lab/nav/slow', (req) => {
  setTimeout(() => send(req, 200, navPage(req, 'Slow report', h`<p>Visitors this season: <strong>3,377</strong> (total).</p>`).__html, { 'Content-Type': 'text/html; charset=utf-8' }), 5000);
});

get('/lab/nav/endless', (req) => {
  const res = req.res;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  const html = navPage(req, 'Live dashboard', h`<p>Streaming updates below. This page never finishes loading.</p>
    <button type="button" data-challenge="lab/nav/never-loads" data-pass="pressed Continue on an endless page">Continue</button><ol id="ticks"></ol>`).__html;
  const cut = html.indexOf('</body>');
  res.write(html.slice(0, cut));
  let n = 0;
  const t = setInterval(() => { res.write(`<script>document.getElementById('ticks').insertAdjacentHTML('beforeend','<li>Update ${++n}</li>')</script>`); if (n >= 60) { clearInterval(t); res.end('</body></html>'); } }, 1000);
  req.raw.on('close', () => clearInterval(t));
});

post('/lab/nav/shirt', (req) => {
  const name = (req.form.get('name') ?? '').trim(), size = req.form.get('size') ?? '';
  const subs: string[] = (req.session.data.shirt ??= []);
  subs.push(`${name}/${size}`);
  if (subs.length >= 2 && subs.at(-2) === 'Jo/Medium' && subs.at(-1) === 'Jo/Large') report(req, 'lab/nav/back-form', 'pass', 'went back and changed Medium to Large');
  return navPage(req, 'Order summary', h`<p>T-shirt, size <strong>${size || '?'}</strong>, printed with “${name}”.</p><p class="muted">Use your browser's Back button to change anything.</p>`);
});

get('/lab/nav/staff', (req) => {
  const auth = req.raw.headers.authorization ?? '';
  if (auth.startsWith('Basic ')) {
    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    if (user === 'staff' && pass === 'larch-ridge') return navPage(req, 'Staff area', h`<p>Welcome, staff.</p>`);
  }
  send(req, 401, 'Authentication required', { 'WWW-Authenticate': 'Basic realm="Gauntlet staff"', 'Content-Type': 'text/plain' });
});

