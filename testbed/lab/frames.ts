// Lab · Shadow DOM & frames: open and closed shadow roots, same-origin,
// nested, srcdoc and cross-origin iframes.

import { h } from '../lib/html.ts';
import { get } from '../lib/http.ts';
import { page } from '../lib/layout.ts';
import { lab } from './kit.ts';

lab('frames', [
  {
    slug: 'open-shadow', title: 'Form in an open shadow root', task: 'Subscribe to updates with the email jo@example.com using the signup card.', check: 'auto', needs: ['type', 'click'], level: 1,
    body: h`<p>The card below is a web component with an open shadow root.</p><signup-card></signup-card>`,
  },
  {
    slug: 'nested-shadow', title: 'Shadow roots all the way down', task: 'Click "Deep button".', check: 'auto', needs: ['click'], level: 2,
    body: h`<p>Three nested web components, each with its own shadow root.</p><outer-box></outer-box>`,
  },
  {
    slug: 'closed-shadow', title: 'A closed shadow root', task: 'Click "Hidden switch".', check: 'auto', needs: ['click', 'closedshadow'], level: 2,
    note: 'Closed shadow roots are not reachable through element.shadowRoot, so DOM-based snapshots cannot see inside.',
    body: h`<p>This component keeps its internals private.</p><secret-switch></secret-switch>`,
  },
  {
    slug: 'same-origin-iframe', title: 'A same-origin iframe', task: 'Apply the promo code SPRING in the promo widget.', check: 'auto', needs: ['type', 'click'], level: 1,
    body: h`<p>The promo widget is an iframe from this site.</p><iframe src="/lab/frames/frame/promo" title="Promo widget" class="lab-frame" height="200"></iframe>`,
  },
  {
    slug: 'nested-iframes', title: 'Frames in frames', task: 'Click "Innermost" in the innermost frame.', check: 'auto', needs: ['click'], level: 2,
    body: h`<iframe src="/lab/frames/frame/outer" title="Outer frame" class="lab-frame" height="320"></iframe>`,
  },
  {
    slug: 'cross-origin-iframe', title: 'A cross-origin iframe', task: 'Join the partner newsletter in the embedded widget with the email jo@example.com.', check: 'auto', needs: ['type', 'click', 'crossorigin'], level: 2,
    note: 'The widget is served from 127.0.0.1:5176, a different origin, so the page cannot read into it.',
    body: (req) => h`<p>Our partner's widget is embedded below.</p><iframe src="${req.site.other}/x/partner?parent=${encodeURIComponent(req.site.main)}" title="Partner newsletter" class="lab-frame" height="220" data-other="${req.site.other}"></iframe>`,
  },
  {
    slug: 'srcdoc', title: 'A srcdoc iframe', task: 'In the embedded terms, tick "I agree" and press Continue.', check: 'auto', needs: ['click'], level: 1,
    body: h`<iframe title="Terms" class="lab-frame" height="220" srcdoc="${`<!doctype html><html><body style="font:15px system-ui;padding:12px">
      <h2 style="margin-top:0">Terms</h2><p>Be kind to the trail.</p>
      <label><input type="checkbox" id="agree"> I agree</label>
      <p><button type="button" id="go">Continue</button> <span id="msg"></span></p>
      <script>document.getElementById('go').onclick=function(e){var ok=document.getElementById('agree').checked;
        document.getElementById('msg').textContent=ok?'Thanks!':'Please tick the box first.';
        parent.G.report('lab/frames/srcdoc', ok?'pass':'fail', ok?'agreed and continued':'continued without agreeing', e);};</script></body></html>`}"></iframe>`,
  },
  {
    slug: 'navigating-iframe', title: 'An iframe that navigates itself', task: 'Accept the invitation in the embedded panel.', check: 'auto', needs: ['wait', 'click'], level: 2,
    body: h`<iframe src="/lab/frames/frame/loading" title="Invitation" class="lab-frame" height="200"></iframe>`,
  },
  {
    slug: 'shadow-text', title: 'Text inside a shadow root', task: 'Find the vault code shown on this page and submit it in the Answer box.', check: 'answer', needs: ['read', 'type'], level: 2,
    answer: '7721', note: 'The code is inside a shadow root, which document.body.innerText does not include.',
    body: h`<p>The code card renders its text inside a shadow root.</p><code-card></code-card>`,
  },
]);

// Frame documents (not challenges themselves).
const FRAMES: Record<string, string> = {
  promo: `<form id="promo"><label for="code">Promo code</label><input id="code" autocomplete="off"><button type="submit">Apply</button></form><p id="promo-msg"></p>`,
  outer: `<p>Outer frame</p><iframe src="/lab/frames/frame/middle" title="Middle frame" class="lab-frame" height="220"></iframe>`,
  middle: `<p>Middle frame</p><iframe src="/lab/frames/frame/inner" title="Inner frame" class="lab-frame" height="110"></iframe>`,
  inner: `<p>Inner frame</p><button type="button" id="innermost">Innermost</button>`,
  loading: `<p><span class="spinner" aria-hidden="true"></span> Loading partner content…</p>`,
  invite: `<h2>You're invited</h2><p>Join the autumn trail crew.</p><button type="button" class="secondary" id="decline">Decline</button> <button type="button" id="accept">Accept invite</button>`,
};

get('/lab/frames/frame/:kind', (req) => {
  const body = FRAMES[req.params.kind];
  if (!body) { req.res.statusCode = 404; return 'No such frame'; }
  return page({ req, title: 'Frame', shell: 'bare', lab: `frames/frame-${req.params.kind}`, bodyClass: 'in-frame', body: h`<div class="frame-body">${{ __html: body }}</div>` });
});

// The partner widget, meant to be loaded from the second origin.
get('/x/partner', (req) => page({
  req, title: 'Partner widget', shell: 'bare', bodyClass: 'in-frame', scripts: ['/static/js/lab/partner.js'],
  body: h`<div class="frame-body"><strong>Pinecone Partners</strong><p>Monthly deals from our partners.</p>
    <form id="partner"><label for="p-email">Email</label><input id="p-email" type="email"><button type="submit">Join</button></form><p id="p-msg"></p></div>`,
}));
