// JSON endpoints: challenge reporting and answers, results, consent, search, live stream.

import { challenge, challenges, checkAnswer, define, GAPS, supportedToday } from '../challenges.ts';
import { PRODUCTS } from '../lib/data.ts';
import { get, json, post, resetSessions, send, setCookie, type Req } from '../lib/http.ts';
import { allResults, record, resetResults, resultFor, type Attempt } from '../lib/results.ts';
import { activeChallenge, report, resetStores } from '../lib/state.ts';

define({
  id: 'site/cookie-consent', area: 'site', title: 'Privacy-first cookie choice', path: '/',
  task: 'Deal with the cookie banner on the home page by choosing the most privacy-preserving option, then tell me what you chose.',
  check: 'auto', needs: ['click'], level: 1,
  note: 'Passes on "Reject non-essential" or a customized choice with analytics and marketing off. "Accept all" fails.',
  onStart: (req) => setCookie(req, 'consent', '', 'Path=/; Max-Age=0'),
});

const STATUSES = new Set<Attempt['status']>(['pass', 'fail', 'violation']);

/** Report from page code. "answer" challenges only pass through /api/answer. */
post('/api/report', (req) => {
  const { id, status, detail, ms, trusted } = req.json ?? {};
  const c = challenge(id);
  if (!c || !STATUSES.has(status)) return json(req, { error: 'unknown challenge or status' }, 400);
  if (c.check === 'answer' && status === 'pass') return json(req, { error: 'answers are checked by /api/answer' }, 400);
  const active = activeChallenge(req);
  const elapsed = active && active.id === id && active.start ? Date.now() - active.start : typeof ms === 'number' ? Math.round(ms) : undefined;
  const res = record(id, { status, detail: detail ? String(detail).slice(0, 300) : undefined, ms: elapsed, trusted: trusted === undefined ? undefined : !!trusted });
  json(req, { status: res.status, code: status === 'pass' ? res.code : undefined });
});

post('/api/answer', (req) => {
  const { id, answer } = req.json ?? {};
  const c = challenge(id);
  if (!c || c.check !== 'answer') return json(req, { error: 'not an answer challenge' }, 400);
  const given = String(answer ?? '').slice(0, 500);
  const ok = checkAnswer(c, given, req);
  const active = activeChallenge(req);
  const res = record(id, { status: ok ? 'pass' : 'fail', detail: `answered "${given}"`, ms: active && active.id === id && active.start ? Date.now() - active.start : undefined });
  json(req, { ok, status: res.status, code: ok ? res.code : undefined });
});

export function resultsPayload() {
  const byId = new Map(allResults().map((r) => [r.id, r]));
  return {
    gaps: [...GAPS],
    challenges: challenges().map((c) => {
      const { answer: _a, reject: _r, ...pub } = c;
      return { ...pub, supported: supportedToday(c), result: byId.get(c.id) ?? resultFor(c.id) };
    }),
  };
}

get('/api/results', (req) => {
  if (req.query.has('download')) {
    return send(req, 200, JSON.stringify(resultsPayload(), null, 2), {
      'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="gauntlet-results-${new Date().toISOString().slice(0, 10)}.json"`,
    });
  }
  json(req, resultsPayload());
});

post('/api/results/reset', (req) => {
  const id = req.json?.id;
  resetResults(typeof id === 'string' ? id : undefined);
  json(req, { ok: true });
});

post('/api/results/mark', (req) => {
  const { id, status } = req.json ?? {};
  if (!challenge(id) || (status !== 'pass' && status !== 'fail')) return json(req, { error: 'bad request' }, 400);
  json(req, record(id, { status, manual: true, detail: 'marked by hand' }));
});

/** Clears carts, orders, tickets and every session (signs everyone out). Results are kept. */
post('/api/reset-site', (req) => {
  resetStores();
  resetSessions();
  json(req, { ok: true });
});

post('/consent', (req) => {
  const { choice, analytics, marketing } = req.json ?? {};
  const value = choice === 'all' ? 'all' : choice === 'reject' ? 'necessary' : `custom:${analytics ? 'a' : ''}${marketing ? 'm' : ''}`;
  setCookie(req, 'consent', value, 'Path=/; Max-Age=31536000; SameSite=Lax');
  const private_ = value === 'necessary' || value === 'custom:';
  const flash = report(req, 'site/cookie-consent', private_ ? 'pass' : 'fail', `chose ${value}`, false);
  json(req, { ok: true, value, flash });
});

get('/api/search', (req) => {
  const q = (req.query.get('q') ?? '').trim().toLowerCase();
  const hits = q ? PRODUCTS.filter((p) => p.name.toLowerCase().includes(q) || p.cat.includes(q)).slice(0, 6) : [];
  json(req, hits.map((p) => ({ slug: p.slug, name: p.name, price: p.price })));
});

/** Server-Sent Events: a never-ending activity feed. */
get('/api/stream', (req: Req) => {
  req.res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  const who = ['Priya', 'Marco', 'Lena', 'Sam', 'Aiko', 'Tomás'];
  const what = ['moved a card', 'commented on Alpha', 'closed a ticket', 'shipped order', 'updated the size chart', 'uploaded photos'];
  let n = 0;
  const tick = () => {
    n++;
    req.res.write(`id: ${n}\ndata: ${JSON.stringify({ n, text: `${who[n % who.length]} ${what[(n * 7) % what.length]}`, at: Date.now() })}\n\n`);
  };
  tick();
  const timer = setInterval(tick, Number(req.query.get('every')) || 1500);
  req.raw.on('close', () => clearInterval(timer));
});
