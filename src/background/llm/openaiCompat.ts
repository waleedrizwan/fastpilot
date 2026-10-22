// One adapter for every OpenAI-compatible /chat/completions endpoint:
// OpenAI, OpenRouter, Groq, Cerebras, Together, Ollama, LM Studio, vLLM, ...

import type { ChatRequest, ChatResponse, LLMProvider, ToolCall, Usage } from './types';

export interface OpenAICompatConfig { baseUrl: string; apiKey: string; model: string }

/** Statuses worth retrying: rate limits, timeouts and server-side failures. */
const RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
/** Wait before each retry, unless the server sends Retry-After. */
const RETRY_WAITS_MS = [500, 1500, 4000];
const MAX_RETRY_AFTER_MS = 10_000;

/** Optional request fields. A server that rejects one never gets it again (per base URL). */
const OPTIONAL: Record<string, unknown> = {
  // Narration without a tool call would otherwise end the run.
  tool_choice: 'required',
  stream_options: { include_usage: true },
};
const rejected = new Map<string, Set<string>>();

type ApiError = Error & { retryable?: boolean; retryAfterMs?: number };

export class OpenAICompatProvider implements LLMProvider {
  private cfg: OpenAICompatConfig;

  constructor(cfg: OpenAICompatConfig) {
    this.cfg = cfg;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once(req);
      } catch (e: any) {
        const err = e as ApiError;
        if (!err.retryable || attempt >= RETRY_WAITS_MS.length || req.signal.aborted) throw e;
        const wait = Math.min(err.retryAfterMs ?? RETRY_WAITS_MS[attempt], MAX_RETRY_AFTER_MS);
        req.onRetry?.(err.message, wait);
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, wait);
          req.signal.addEventListener('abort', () => { clearTimeout(t); reject(req.signal.reason); }, { once: true });
        });
      }
    }
  }

  private async once(req: ChatRequest): Promise<ChatResponse> {
    const t0 = performance.now();
    const base = this.cfg.baseUrl.replace(/\/+$/, '');
    const openRouter = /(^|\.)openrouter\.ai$/.test(new URL(base).hostname);
    const skip = rejected.get(base) ?? new Set();
    const optional = Object.fromEntries(Object.entries(OPTIONAL).filter(([k]) => !skip.has(k)));
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.cfg.apiKey ? { Authorization: `Bearer ${this.cfg.apiKey}` } : {}),
          ...(openRouter ? { 'X-Title': 'FastPilot' } : {}),
        },
        body: JSON.stringify({
          model: this.cfg.model,
          messages: req.messages,
          tools: req.tools,
          stream: true,
          ...optional,
          // OpenRouter serves most models from several providers; pick the fastest.
          ...(openRouter ? { provider: { sort: 'throughput' } } : {}),
        }),
        signal: req.stop ? AbortSignal.any([req.signal, req.stop]) : req.signal,
      });
    } catch (e: any) {
      // Network failure before any response: nothing ran, so it's safe to retry.
      if (e?.name !== 'AbortError') e.retryable = true;
      throw e;
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      const bad = (res.status === 400 || res.status === 422) && Object.keys(optional).find((k) => text.includes(k));
      if (bad) {
        rejected.set(base, skip.add(bad));
        return this.once(req);
      }
      const after = Number(res.headers.get('retry-after'));
      throw Object.assign(new Error(`Model API ${res.status}: ${text}`), {
        retryable: RETRY_STATUS.has(res.status),
        retryAfterMs: after > 0 ? after * 1000 : undefined,
      });
    }

    // Some servers ignore stream:true and answer with plain JSON.
    if (!res.headers.get('content-type')?.includes('text/event-stream')) {
      const j = await res.json();
      const msg = j.choices?.[0]?.message ?? {};
      const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((c: any, i: number) => ({
        id: c.id ?? `call_${i}`, name: c.function?.name ?? '', arguments: c.function?.arguments ?? '{}',
      }));
      toolCalls.forEach((c) => req.onToolCall?.(c));
      return { content: msg.content ?? '', toolCalls, firstTokenMs: Math.round(performance.now() - t0), usage: usageOf(j.usage) };
    }

    return parseStream(res.body!, req, t0);
  }
}

function usageOf(u: any): Usage | undefined {
  if (!u || typeof u.prompt_tokens !== 'number') return undefined;
  return { input: u.prompt_tokens, output: u.completion_tokens ?? 0, cached: u.prompt_tokens_details?.cached_tokens ?? 0 };
}

export async function parseStream(
  body: ReadableStream<Uint8Array>,
  req: Pick<ChatRequest, 'onToolCall' | 'stop'> & { signal?: AbortSignal },
  t0 = performance.now(),
): Promise<ChatResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls: ToolCall[] = [];
  let content = '';
  let buf = '';
  let emitted = 0;
  let firstTokenMs = -1;
  let usage: Usage | undefined;
  const emitUpTo = (n: number) => {
    for (; emitted < n; emitted++) req.onToolCall?.(calls[emitted]);
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let j: any;
        try { j = JSON.parse(data); } catch { continue; }
        if (j.error) {
          const code = Number(j.error.code);
          throw Object.assign(new Error(`Model API: ${j.error.message ?? JSON.stringify(j.error)}`), {
            retryable: firstTokenMs < 0 && (!code || RETRY_STATUS.has(code)),
          });
        }
        // Usage arrives in a final chunk with no choices (Groq nests it under x_groq).
        usage = usageOf(j.usage ?? j.x_groq?.usage) ?? usage;
        const delta = j.choices?.[0]?.delta;
        if (!delta) continue;
        if (firstTokenMs < 0) firstTokenMs = Math.round(performance.now() - t0);
        if (delta.content) content += delta.content;
        for (const tc of delta.tool_calls ?? []) {
          const idx: number = tc.index ?? (tc.id ? calls.length : Math.max(0, calls.length - 1));
          if (!calls[idx]) {
            // A new call starting means every earlier one is complete: run it now.
            emitUpTo(idx);
            calls[idx] = { id: tc.id ?? `call_${idx}`, name: '', arguments: '' };
          }
          if (tc.id) calls[idx].id = tc.id;
          if (tc.function?.name) calls[idx].name = tc.function.name;
          if (tc.function?.arguments) calls[idx].arguments += tc.function.arguments;
        }
      }
    }
  } catch (e: any) {
    if (req.stop?.aborted && !req.signal?.aborted) {
      // Stopped on purpose: keep only the calls that finished streaming.
      return { content, toolCalls: calls.slice(0, emitted), firstTokenMs: Math.max(0, firstTokenMs), stopped: true };
    }
    // Failed before any output, so nothing ran: safe to retry.
    if (firstTokenMs < 0 && e?.name !== 'AbortError' && e.retryable === undefined) e.retryable = true;
    throw e;
  }
  emitUpTo(calls.length);
  return { content, toolCalls: calls, firstTokenMs: Math.max(0, firstTokenMs), usage };
}
