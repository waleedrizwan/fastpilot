import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Jev, describeShadow, modelChoice } from '../src/background/jev.ts';

const PAGE = [
  'URL: http://localhost:5175/lab/clicks/enabled-when-valid',
  'Title: Disabled until valid',
  '',
  '# Disabled until valid',
  '[9] input "Name" value="Jo"',
  '[10] input[email] "Email"',
  '[11] button "Create"',
  '[12] link "Help"',
].join('\n');

/** Replaces fetch for one call, keeping what was sent. */
function fakeFetch(status: number, body: unknown) {
  const sent: { url: string; init: RequestInit }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { sent, restore: () => { globalThis.fetch = real; } };
}

test('asks every question in one request and reads the target for the chosen operation', async () => {
  const f = fakeFetch(200, {
    model: 'typesafe/jev-1.14-20261014',
    answers: {
      done: { type: 'noul', noul: 0.08 },
      next: { type: 'choice', choice: 'type', probabilities: { type: 0.81, click: 0.15, done: 0.04 }, confidence: 0.7 },
      click_target: { type: 'choice', choice: '11', probabilities: { 11: 0.9, 12: 0.1 } },
      type_target: { type: 'choice', choice: '10', probabilities: { 9: 0.05, 10: 0.95 } },
    },
  });
  try {
    const jev = new Jev('sk-or-test', '~typesafe/jev-latest');
    jev.record({ id: 'a', name: 'type', arguments: '{"ref":9,"text":"Jo"}' }, 'typed into [9] (settled 105ms)');
    const a = await jev.ask('Create an account for Jo, jo@example.com', PAGE, new AbortController().signal);

    assert.equal(f.sent[0].url, 'https://openrouter.ai/api/v1/systemone');
    assert.equal((f.sent[0].init.headers as Record<string, string>).Authorization, 'Bearer sk-or-test');
    const body = JSON.parse(String(f.sent[0].init.body));
    assert.equal(body.model, '~typesafe/jev-latest');
    assert.deepEqual(body.state.recent_actions, ['type({"ref":9,"text":"Jo"}) → typed into [9] (settled 105ms)']);
    assert.deepEqual(Object.keys(body.questions).sort(), ['click_target', 'done', 'next', 'type_target']);
    assert.deepEqual(Object.keys(body.questions.type_target.criteria), ['9', '10']);
    assert.deepEqual(Object.keys(body.questions.click_target.criteria), ['11', '12']);

    assert.equal(a.next, 'type');
    assert.equal(a.nextP, 0.81);
    assert.equal(a.target, 10);
    assert.equal(a.targetP, 0.95);
    assert.equal(a.done, 0.08);
    assert.equal(a.error, undefined);
  } finally {
    f.restore();
  }
});

test('a failed request comes back as an error instead of throwing', async () => {
  const f = fakeFetch(429, { error: { message: 'rate limited' } });
  try {
    const a = await new Jev('k', 'm').ask('task', PAGE, new AbortController().signal);
    assert.match(a.error ?? '', /^Jev HTTP 429/);
    assert.equal(a.next, undefined);
  } finally {
    f.restore();
  }
});

test("the model's first action maps onto Jev's operations", () => {
  assert.deepEqual(modelChoice([{ id: 'a', name: 'click', arguments: '{"ref": 11}' }, { id: 'b', name: 'done', arguments: '{}' }]), { llm: 'click', llmTarget: 11 });
  assert.deepEqual(modelChoice([{ id: 'a', name: 'read_text', arguments: '{}' }]), { llm: 'read' });
  assert.deepEqual(modelChoice([]), { llm: 'none' });
});

test('the log line says when Jev and the model agree', () => {
  const line = describeShadow({ step: 1, at: 0, ms: 180, done: 0.97, next: 'done', nextP: 0.98, llm: 'done' });
  assert.equal(line, 'jev 180ms · would done (0.98) · done 0.97 · model did done · agrees');
});
