// Lab · Timing: delays, spinners, progress, vanishing toasts, re-renders, a live
// feed that never goes idle, slow, flaky and long-polled requests, countdowns.

import { h } from '../lib/html.ts';
import { get, json } from '../lib/http.ts';
import { lab } from './kit.ts';

lab('timing', [
  {
    slug: 'appears-later', title: 'Ready in three seconds', task: 'Generate the report and download it when it is ready.', check: 'auto', needs: ['click', 'wait'], level: 1,
    body: h`<button type="button" id="gen">Generate report</button><div id="gen-out"></div>`,
  },
  {
    slug: 'spinner', title: 'Behind a spinner', task: 'Submit the permit number shown on this page in the Answer box.', check: 'answer', needs: ['wait', 'read', 'type'], level: 1,
    answer: 'PRM-58213',
    body: h`<div id="spin-box"><span class="spinner" aria-hidden="true"></span> Loading your permit…</div>`,
  },
  {
    slug: 'progress', title: 'Wait for 100%', task: 'Start the upload and press Continue once it finishes.', check: 'auto', needs: ['click', 'wait'], level: 1,
    body: h`<button type="button" id="up-start">Start upload</button><div class="progress-bar wide" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Upload progress"><span id="up-bar"></span></div>
      <p class="muted" id="up-text">0%</p><button type="button" id="up-continue" disabled data-pass="continued after 100%">Continue</button>`,
  },
  {
    slug: 'vanishing-toast', title: 'A code that vanishes', task: 'Press "Get code" and submit the code from the notification in the Answer box. The notification disappears after 3 seconds.', check: 'answer', needs: ['click', 'read', 'type'], level: 2,
    answer: 'ZX-4471',
    body: h`<button type="button" id="get-code">Get code</button> <button type="button" class="secondary" id="get-code-again" hidden>Send again</button>`,
  },
  {
    slug: 'rerender', title: 'A list that keeps re-rendering', task: 'Approve the request from Kai.', check: 'auto', needs: ['click'], level: 2,
    note: 'The list is rebuilt with new elements every 2 seconds, so element references go stale.',
    body: h`<ul class="requests" id="reqs"></ul><p class="muted" id="reqs-tick"></p>`,
  },
  {
    slug: 'live-feed', title: 'A live counter', task: 'Wait until the live counter reaches 10, then press Stop.', check: 'auto', needs: ['wait', 'click'], level: 2,
    note: 'Server-Sent Events keep a connection open the whole time.',
    body: h`<p class="big-counter" id="counter" aria-live="polite">0</p><button type="button" id="stop">Stop</button><p class="muted" id="feed-state"></p>`,
  },
  {
    slug: 'slow-response', title: 'A four-second request', task: 'Press "Load balance" and submit the balance in the Answer box.', check: 'answer', needs: ['click', 'wait', 'read', 'type'], level: 2,
    answer: 1284.5,
    body: h`<button type="button" id="bal">Load balance</button><p id="bal-out"></p>`,
  },
  {
    slug: 'flaky', title: 'Fails the first time', task: 'Load the dataset and submit its name in the Answer box.', check: 'answer', needs: ['click', 'read', 'type'], level: 2,
    answer: 'Glacier retreat 1990–2025',
    body: h`<button type="button" id="load">Load data</button><div id="load-out"></div>`,
  },
  {
    slug: 'debounced', title: 'Results after you stop typing', task: 'Search for "lantern" and open the first result.', check: 'auto', needs: ['type', 'wait', 'click'], level: 1,
    body: h`<label for="db-q">Search</label><input id="db-q" type="search" autocomplete="off"><ul class="results" id="db-results"></ul>`,
  },
  {
    slug: 'long-poll', title: 'Waiting for approval', task: 'Request approval and submit the name of the person who approves it in the Answer box.', check: 'answer', needs: ['click', 'wait', 'read', 'type'], level: 2,
    answer: 'Marguerite Osei', note: 'The server holds the request open for 10 seconds before answering.',
    body: h`<button type="button" id="ask">Request approval</button><p id="ask-out"></p>`,
  },
  {
    slug: 'countdown', title: 'Skip ad in 10', task: 'Skip the ad as soon as you are allowed to.', check: 'auto', needs: ['wait', 'click'], level: 1,
    body: h`<div class="ad-box"><p>📺 Advertisement</p><button type="button" id="skip" disabled>Skip ad in 10</button></div>`,
  },
]);

get('/api/lab/slow', (req) => setTimeout(() => json(req, { balance: 1284.5 }), 4000));
get('/api/lab/flaky', (req) => {
  const n = (req.session.data.flaky = (req.session.data.flaky ?? 0) + 1);
  setTimeout(() => (n % 2 ? json(req, { error: 'Service unavailable' }, 503) : json(req, { name: 'Glacier retreat 1990–2025', rows: 4120 })), 600);
});
get('/api/lab/longpoll', (req) => setTimeout(() => json(req, { approver: 'Marguerite Osei' }), 10_000));
get('/api/lab/search', (req) => {
  const q = (req.query.get('q') ?? '').toLowerCase();
  const all = ['Glow Lantern', 'Lantern hooks (4-pack)', 'Lantern diffuser', 'Headlamp band', 'Camp String Lights'];
  setTimeout(() => json(req, all.filter((x) => x.toLowerCase().includes(q))), 300);
});
