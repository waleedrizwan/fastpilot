// Lab · Windows & tabs: target=_blank, window.open popups, an OAuth-style popup on
// the second origin that messages its opener, round trips between tabs, and print.

import { h } from '../lib/html.ts';
import { get } from '../lib/http.ts';
import { page } from '../lib/layout.ts';
import { lab } from './kit.ts';

lab('windows', [
  {
    slug: 'new-tab', title: 'Opens in a new tab', task: 'Open "Trail permit form" (it opens in a new tab) and press Confirm there.', check: 'auto', needs: ['click', 'newtab'], level: 2,
    body: h`<p><a href="/lab/windows/page/permit" target="_blank">Trail permit form</a> ↗</p>`,
  },
  {
    slug: 'popup', title: 'A popup window', task: 'Press "Review terms", then press Approve in the popup window.', check: 'auto', needs: ['click', 'newtab'], level: 2,
    body: h`<button type="button" id="popup-open">Review terms</button><p class="muted" id="popup-state"></p>`,
  },
  {
    slug: 'oauth-popup', title: 'Connect another service', task: 'Connect your Pinecone calendar by pressing "Connect Pinecone" and allowing access in the popup.', check: 'auto', needs: ['click', 'newtab', 'crossorigin'], level: 3,
    note: 'The popup is served from the second origin and reports back with postMessage.',
    body: (req) => h`<p>Calendar: <strong id="oauth-state">not connected</strong></p><button type="button" id="oauth-open" data-other="${req.site.other}">Connect Pinecone</button>`,
  },
  {
    slug: 'round-trip', title: 'Look it up in another tab', task: 'Open the price list (it opens in a new tab), find the yearly price of the Gold plan, come back to this tab, enter it in the form and press Save.', check: 'auto', needs: ['click', 'newtab', 'read', 'type'], level: 3,
    body: h`<p><a href="/lab/windows/page/prices" target="_blank">Price list</a> ↗</p><form id="rt"><label for="rt-price">Gold plan, yearly price (USD)</label><input id="rt-price" inputmode="decimal"><button type="submit">Save</button></form>`,
  },
  {
    slug: 'print', title: 'Print a receipt', task: 'Print the receipt.', check: 'auto', needs: ['click', 'dialog'], level: 2,
    note: 'window.print() opens the browser print dialog.',
    body: h`<div class="card receipt"><h2>Receipt #A-2207</h2><p>2 × Day pass · $24.00</p><p><strong>Total $24.00</strong></p></div><button type="button" id="print">Print receipt</button>`,
  },
]);

const PAGES: Record<string, { title: string; body: string }> = {
  permit: { title: 'Trail permit', body: `<h1>Trail permit</h1><p>Larch Ridge, 2 people, 18 November 2026.</p><button type="button" id="permit-confirm">Confirm</button><p class="muted" id="permit-state"></p>` },
  prices: { title: 'Price list', body: `<h1>Price list</h1><table><thead><tr><th>Plan</th><th>Monthly</th><th>Yearly</th></tr></thead><tbody>
    <tr><td>Silver</td><td>$9</td><td>$90</td></tr><tr><td>Gold</td><td>$19</td><td>$189</td></tr><tr><td>Platinum</td><td>$39</td><td>$389</td></tr></tbody></table>` },
  terms: { title: 'Terms', body: `<h1>Terms of service</h1><p>Short and sweet: be kind to the trail.</p><button type="button" class="secondary" id="t-decline">Decline</button> <button type="button" id="t-approve">Approve</button>` },
};

get('/lab/windows/page/:name', (req) => {
  const p = PAGES[req.params.name];
  if (!p) { req.res.statusCode = 404; return 'No such page'; }
  return page({ req, title: p.title, shell: 'bare', lab: `windows/page-${req.params.name}`, body: h`<div class="frame-body">${{ __html: p.body }}</div>` });
});

get('/x/oauth', (req) => page({
  req, title: 'Pinecone · Authorize', shell: 'bare', scripts: ['/static/js/lab/oauth.js'],
  body: h`<div class="oauth card"><h1>Pinecone</h1><p><strong>Gauntlet Workspace</strong> wants to:</p><ul><li>See your calendars</li><li>Create events</li></ul>
    <div class="form-actions"><button type="button" class="secondary" id="deny">Deny</button><button type="button" id="allow">Allow</button></div></div>`,
}));
