import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatProvider, parseStream } from '../src/background/llm/openaiCompat.ts';

const sse = (chunks: object[]) => {
  const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  // Split mid-line to exercise buffering.
  const parts = [text.slice(0, 37), text.slice(37, 150), text.slice(150)];
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(new TextEncoder().encode(p));
      c.close();
    },
  });
};
const tc = (index: number, f: object, id?: string) => ({ choices: [{ delta: { tool_calls: [{ index, ...(id ? { id } : {}), function: f }] } }] });

test('emits each tool call as soon as the next one starts', async () => {
  const order: string[] = [];
  const body = sse([
    { choices: [{ delta: { content: 'Filling form.' } }] },
    tc(0, { name: 'type', arguments: '' }, 'a'),
    tc(0, { arguments: '{"ref":1,' }),
    tc(0, { arguments: '"text":"Jo"}' }),
    tc(1, { name: 'click', arguments: '{"ref":2}' }, 'b'),
  ]);
  const res = await parseStream(body, {
    onToolCall: (c) => order.push(`${c.name}:${c.arguments}`),
  });
  assert.equal(res.content, 'Filling form.');
  assert.deepEqual(order, ['type:{"ref":1,"text":"Jo"}', 'click:{"ref":2}']);
  assert.equal(res.toolCalls[1].id, 'b');
});

test('surfaces provider errors sent in the stream', async () => {
  await assert.rejects(parseStream(sse([{ error: { message: 'rate limited' } }]), {}), /rate limited/);
});

test('only errors before any output can be retried', async () => {
  await assert.rejects(parseStream(sse([{ error: { message: 'overloaded', code: 502 } }]), {}), (e: any) => e.retryable === true);
  await assert.rejects(parseStream(sse([{ error: { message: 'bad request', code: 400 } }]), {}), (e: any) => e.retryable === false);
  const late = sse([{ choices: [{ delta: { content: 'Clicking.' } }] }, { error: { message: 'overloaded', code: 502 } }]);
  await assert.rejects(parseStream(late, {}), (e: any) => e.retryable === false);
});

test('reads token usage from the final chunk', async () => {
  const res = await parseStream(sse([
    tc(0, { name: 'click', arguments: '{"ref":2}' }, 'a'),
    { choices: [], usage: { prompt_tokens: 1200, completion_tokens: 18, prompt_tokens_details: { cached_tokens: 1024 } } },
  ]), {});
  assert.deepEqual(res.usage, { input: 1200, output: 18, cached: 1024 });
});

test('stop ends the stream early and keeps only the calls that finished', async () => {
  const stop = new AbortController();
  const text = [tc(0, { name: 'click', arguments: '{"ref":1}' }, 'a'), tc(1, { name: 'type', arguments: '{"ref":' }, 'b')]
    .map((c) => `data: ${JSON.stringify(c)}\n\n`).join('');
  // Like a fetch body: aborting the request errors the stream.
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      stop.signal.addEventListener('abort', () => c.error(new DOMException('stopped', 'AbortError')));
    },
  });
  const res = await parseStream(body, { stop: stop.signal, onToolCall: () => stop.abort() });
  assert.equal(res.stopped, true);
  assert.deepEqual(res.toolCalls.map((c) => c.name), ['click']);
});

test('retries rate limits and drops optional fields the server rejects', async () => {
  const bodies: any[] = [];
  const replies = [
    new Response('slow down', { status: 429 }),
    new Response('{"error":"unsupported value for tool_choice"}', { status: 400 }),
    Response.json({
      choices: [{ message: { content: '', tool_calls: [{ id: 'a', function: { name: 'done', arguments: '{"result":"ok"}' } }] } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    }),
  ];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return replies.shift()!;
  }) as typeof fetch;
  try {
    const waits: number[] = [];
    const provider = new OpenAICompatProvider({ baseUrl: 'http://localhost:9/retry-test/v1', apiKey: '', model: 'm' });
    const res = await provider.chat({ messages: [], tools: [], signal: new AbortController().signal, onRetry: (_why, ms) => waits.push(ms) });
    assert.deepEqual(waits, [500]);
    assert.equal(res.toolCalls[0].name, 'done');
    assert.deepEqual(res.usage, { input: 10, output: 2, cached: 0 });
    assert.equal(bodies[0].tool_choice, 'required');
    assert.ok(!('tool_choice' in bodies[2]));
    assert.deepEqual(bodies[2].stream_options, { include_usage: true });
  } finally {
    globalThis.fetch = real;
  }
});

test('stop before the response starts returns an empty, stopped reply instead of throwing', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = ((_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  })) as typeof fetch;
  try {
    const stop = new AbortController();
    const provider = new OpenAICompatProvider({ baseUrl: 'http://localhost:9/stop-test/v1', apiKey: '', model: 'm' });
    const pending = provider.chat({ messages: [], tools: [], signal: new AbortController().signal, stop: stop.signal });
    stop.abort();
    const res = await pending;
    assert.equal(res.stopped, true);
    assert.deepEqual(res.toolCalls, []);
  } finally {
    globalThis.fetch = real;
  }
});

test('streams text and each tool call as it is written, for the live view', async () => {
  const seen: string[] = [];
  await parseStream(sse([
    { choices: [{ delta: { content: 'Filling.' } }] },
    tc(0, { name: 'type', arguments: '{"why":"enter name",' }, 'a'),
    tc(0, { arguments: '"ref":1,"text":"Jo"}' }),
  ]), {
    onDelta: (d) => seen.push('text' in d ? `text:${d.text}` : 'call' in d ? `call:${d.call.name}:${d.call.arguments}` : 'reasoning'),
  });
  assert.deepEqual(seen, ['text:Filling.', 'call:type:{"why":"enter name",', 'call:type:{"why":"enter name","ref":1,"text":"Jo"}']);
});
