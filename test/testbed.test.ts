import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { challenges } from '../testbed/challenges.ts';
import { start, type Running } from '../testbed/server.ts';

let run: Running;
before(async () => { run = await start({ port: 0, otherPort: 0 }); });
after(() => run.close());

/** fetch with a cookie jar, so each client keeps its own session. */
function client() {
  const jar = new Map<string, string>();
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(path.startsWith('http') ? path : run.main + path, {
      redirect: 'manual', ...init,
      headers: { ...(init.headers as Record<string, string>), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  };
}
const postJson = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const postForm = (body: Record<string, string>): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });

test('every challenge page loads, and every script it references exists', async () => {
  const get = client();
  const scripts = new Set<string>();
  for (const c of challenges()) {
    const res = await get(c.path);
    const ok = res.status === 200 || (res.status === 302 && res.headers.get('location')?.startsWith('/login'));
    assert.ok(ok, `${c.id}: ${c.path} returned ${res.status}`);
    for (const m of (await res.text()).matchAll(/<script src="([^"]+)"/g)) scripts.add(m[1]);
  }
  for (const s of scripts) assert.equal((await get(s)).status, 200, `missing script ${s}`);
  assert.ok(challenges().length > 250);
});

test('lab pages exist for every lab challenge, and index pages load', async () => {
  const get = client();
  for (const p of ['/', '/challenges', '/scoreboard', '/sitemap', '/lab', '/lab/clicks', '/shop', '/help', '/blog', '/app', '/app-hash/']) {
    assert.equal((await get(p)).status, 200, p);
  }
  for (const c of challenges().filter((x) => x.area.startsWith('lab:'))) {
    assert.equal((await get(`/${c.id}`)).status, 200, c.id);
  }
  assert.equal((await get('/no/such/page')).status, 404);
});

test('redirect chains, redirect statuses and the 307 POST', async () => {
  const res = await fetch(`${run.main}/lab/nav/hop/1`);
  assert.equal(new URL(res.url).pathname, '/lab/nav/hop/5');
  assert.match(await res.text(), /HOP5-OK/);
  const get = client();
  for (const code of [301, 302, 303, 307, 308]) assert.equal((await get(`/lab/nav/r/${code}`)).status, code);
  const rsvp = await get('/lab/nav/rsvp', postForm({ name: 'Jo' }));
  assert.equal(rsvp.status, 307);
});

test('signing in redirects back to where you were going', async () => {
  const get = client();
  assert.equal((await get('/orders')).headers.get('location'), '/login?next=%2Forders');
  const bad = await get('/login', postForm({ username: 'demo', password: 'nope', next: '/orders' }));
  assert.equal(bad.status, 401);
  const ok = await get('/login', postForm({ username: 'demo', password: 'trailhead', next: '/orders' }));
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/orders');
  assert.equal((await get('/orders')).status, 200);
});

test('answers are checked on the server, including decoys', async () => {
  const get = client();
  const answer = async (id: string, value: string) => (await (await get('/api/answer', postJson({ id, answer: value }))).json()).ok;
  assert.equal(await answer('lab/reading/table', '725'), true);
  assert.equal(await answer('lab/reading/table', '535 m'), false);
  assert.equal(await answer('lab/reading/locale-number', '4318.75'), true);
  assert.equal(await answer('lab/reading/decoy', 'Room 4B'), true);
  assert.equal(await answer('lab/reading/decoy', 'Room 4B or Room 9Z'), false);
  assert.equal(await answer('shop/promo-total', '0'), false, 'promo answer needs the code applied');
});

test('the results API never exposes expected answers', async () => {
  const data = await (await client()('/api/results')).json();
  for (const c of data.challenges) assert.ok(!('answer' in c) && !('reject' in c), c.id);
});

test('completion codes only appear after a pass and never in challenge pages', async () => {
  const get = client();
  const out = await (await get('/api/report', postJson({ id: 'lab/clicks/basic', status: 'pass', detail: 'test' }))).json();
  assert.match(out.code, /^[A-Z0-9]{6}$/);
  const fresh = client();
  for (const c of challenges()) {
    const res = await fresh(c.path);
    if (res.status === 200) assert.ok(!(await res.text()).includes(out.code), `${c.path} leaks a completion code`);
  }
});

test('adding three green mugs passes the cart challenge', async () => {
  const get = client();
  const res = await (await get('/api/cart', postJson({ slug: 'trail-mug', color: 'Forest Green', size: 'One size', qty: 3 }))).json();
  assert.equal(res.count, 3);
  assert.equal(res.flash?.id, 'shop/add-mugs');
  assert.equal(res.flash?.status, 'pass');
});

test('the second origin serves cross-origin widgets', async () => {
  assert.notEqual(new URL(run.other).origin, new URL(run.main).origin);
  assert.equal((await fetch(`${run.other}/x/partner`)).status, 200);
  assert.equal((await fetch(`${run.other}/x/oauth`)).status, 200);
});

test('handlers that answer from a timer respond instead of hanging', async () => {
  const res = await fetch(`${run.main}/api/lab/description`, { signal: AbortSignal.timeout(3000) });
  assert.equal(res.status, 200);
  assert.match((await res.json()).rest, /Abbot Pass/);
});

test('agent runs hide the challenge status, result and expected outcome', async () => {
  const page = (cookie?: string) => fetch(`${run.main}/lab/clicks/basic`, cookie ? { headers: { cookie } } : {}).then((r) => r.text());
  assert.doesNotMatch(await page(), /<body class="[^"]*\bagent-run\b/);
  assert.match(await page('gauntlet_agent=1'), /<body class="[^"]*\bagent-run\b/);
  const css = await (await fetch(`${run.main}/static/css/site.css`)).text();
  for (const sel of ['.cs-status', '.cs-result', '.cs-expect', '.toast-result']) assert.ok(css.includes(`.agent-run ${sel}`), sel);
});
