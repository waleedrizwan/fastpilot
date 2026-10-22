// The agent loop: snapshot → model → run its batch of actions → repeat.
// Actions start as soon as each tool call finishes streaming, while the
// model is still writing the rest of its reply.

import { isOpenRouter, needsApiKey, type JevShadow, type LogEvent, type Settings, type TurnStats } from '../shared/types';
import { RECORDABLE, getRecording, recordingKey, saveRecording, stepSummary, type RecordedStep, type Recording } from '../shared/recordings';
import { describeTarget } from '../content/snapshot';
import { TabDebugger } from './cdp';
import { Jev, describeShadow, modelChoice } from './jev';
import { OpenAICompatProvider } from './llm/openaiCompat';
import type { ChatMessage, LLMProvider, ToolCall } from './llm/types';
import { activeTab, inPage, snapshot } from './page';
import { replay } from './replay';
import { TOOLS, runTool, type ToolResult } from './tools';

const HISTORY_LIMIT = 24;

const SYSTEM_PROMPT = `You are a fast browser-automation agent controlling the user's real Chrome tab.

Each turn you get a snapshot of the page: interactive elements as \`[ref] kind "label" extras\`, and headings as \`# text\`. Elements marked (above)/(below) are off-screen; act on them directly and they are scrolled into view for you.

Be fast:
- Call several tools in one turn whenever you can predict the outcome, e.g. fill every form field and then submit. They run in order. If the page navigates or an action fails, the rest are skipped and you get a fresh snapshot.
- Use read_text to read content. Only take a screenshot when the snapshot can't tell you what you need (visual layout, images, canvas).
- Keep any text you write to one short line. Older snapshots are not kept, so write down facts you'll need later (prices, names, counts).

Finish with done(result) as soon as the task is complete. Many pages show no confirmation, so once the actions the task asked for have run without an error, call done, in the same turn as the last action when you can (e.g. click, then done). Don't re-read the page looking for proof, and never repeat an action that already worked: a second click can undo a toggle, delete another row or place a second order. Check the page first only when the task asks for information or an action may have failed (a form that validates its fields, a warning that the point was covered).

Call handoff(reason) instead of guessing when you hit a CAPTCHA, a login or password prompt, 2FA, a payment or purchase confirmation, or anything that needs the user's judgment.`;

/** In Jev's finish mode, how sure Jev must be that the task is complete to end the run without the model. */
const JEV_FINISH = 0.9;
/** Tools that only look at the page, so they don't count as the agent having done anything. */
const LOOKS = new Set(['read_text', 'screenshot', 'wait_for', 'done', 'handoff']);

/** Turns that repeat an earlier turn on an unchanged page before the model is told it's going in circles. */
const STALL_NUDGE = 2;
/** ...and before the run stops. */
const STALL_STOP = 6;

interface Outcome { call: ToolCall; result: ToolResult }

export class Agent {
  private abort = new AbortController();
  private provider: LLMProvider;
  private emit: (e: LogEvent) => void;
  private t0 = performance.now();

  constructor(private settings: Settings, emit: (e: LogEvent) => void) {
    this.provider = new OpenAICompatProvider(settings);
    this.emit = (e) => emit({ ...e, at: Math.round(performance.now() - this.t0) });
  }

  stop() {
    this.abort.abort();
  }

  /** Saves the run for replay, or bumps the use count when the saved run worked unchanged. */
  private async remember(origin: string, task: string, rec: Recording | undefined, steps: RecordedStep[], replayed: number) {
    const now = Date.now();
    if (rec && steps.length === replayed && replayed === rec.steps.length) {
      await saveRecording({ ...rec, lastUsedAt: now, uses: rec.uses + 1 });
      return;
    }
    if (!steps.length) return;
    await saveRecording({
      key: recordingKey(origin, task), origin, task, steps,
      createdAt: rec?.createdAt ?? now, lastUsedAt: now, uses: (rec?.uses ?? 0) + 1,
    });
    this.emit({ kind: 'info', text: `${rec ? 'updated' : 'saved'} run (${steps.length} steps) for next time` });
  }

  /** Runs on the active tab unless `tabId` is given. */
  async run(task: string, tabId?: number): Promise<void> {
    if (!this.settings.model) throw new Error('Set a model in Settings first.');
    if (!this.settings.apiKey && needsApiKey(this.settings.baseUrl)) throw new Error('Add your API key in Settings first.');
    this.t0 = performance.now();
    const tab = tabId === undefined ? await activeTab() : await chrome.tabs.get(tabId);
    const dbg = new TabDebugger(tab.id!);
    dbg.onDetached = () => this.abort.abort();
    await dbg.attach();
    const signal = this.abort.signal;
    const started = performance.now();
    const origin = new URL(tab.url ?? 'about:blank').origin;
    const speed = this.settings.speed;

    try {
      // Every successful action of this run, in order; saved if the run finishes.
      const steps: RecordedStep[] = [];
      let note = '';
      const rec = this.settings.replay ? await getRecording(origin, task) : undefined;
      if (rec) {
        this.emit({ kind: 'info', text: `replaying saved run (${rec.steps.length} steps)` });
        const r = await replay(rec, { dbg, speed, signal }, this.emit, signal);
        steps.push(...r.done);
        this.emit({ kind: 'info', text: `replay ${r.failure ? `stopped at step ${r.done.length + 1}` : 'finished'} in ${Math.round(performance.now() - started)}ms` });
        const list = r.done.map((s, i) => `${i + 1}. ${stepSummary(s)}`).join('\n');
        note = r.failure
          ? `A saved run for this task was replayed. These steps succeeded:\n${list || '(none)'}\nThen \`${stepSummary(r.failure.step)}\` failed: ${r.failure.reason}. Continue the task from the current page.`
          : `A saved run for this task was just replayed:\n${list}\nCheck the current page. If the task is complete, call done(result) now; otherwise continue.`;
      }
      const replayed = steps.length;

      const history: ChatMessage[] = [];
      let image: string | undefined;
      // A finished task with no visible confirmation looks like this: the model keeps redoing what it
      // already did (re-reading, re-clicking) on a page that doesn't change. Count those repeats; any
      // page not seen before this run is progress and clears the count.
      const pages = new Set<string>();
      const turns = new Set<string>();
      let stalled = 0;
      // Jev answers beside the model on every turn. In shadow mode its answers are only logged; in finish
      // mode it may also end the run when it's sure the task is complete. It never takes an action.
      let jev: Jev | undefined;
      if (this.settings.jev !== 'off') {
        if (isOpenRouter(this.settings.baseUrl) && this.settings.apiKey) jev = new Jev(this.settings.apiKey, this.settings.jevModel);
        else this.emit({ kind: 'info', text: 'Jev needs OpenRouter as the provider, since it uses that key. Skipping it.' });
      }
      // Whether the agent has done anything to the page yet (a replayed run counts), so Jev can't end a run before it starts.
      let acted = replayed > 0;

      for (let step = 1; step <= this.settings.maxSteps; step++) {
        if (signal.aborted) throw new Error('Stopped');

        const t0 = performance.now();
        const snap = await snapshot(dbg.tabId);
        const snapMs = Math.round(performance.now() - t0);
        if (!pages.has(snap.text)) { pages.add(snap.text); stalled = 0; }
        if (stalled >= STALL_STOP) {
          this.emit({ kind: 'error', text: `Stopped: repeated earlier steps ${stalled} times without the page changing. The task may already be done; check the page.`, end: 'stalled' });
          return;
        }
        const nudge = stalled >= STALL_NUDGE
          ? `\n\nYou have repeated earlier steps on this unchanged page ${stalled} times. If the task is complete, call done now. If not, try something you haven't tried yet, or call handoff.`
          : '';
        const pageMsg = `Current page:\n${snap.text}${nudge}`;
        const turnAt = Math.round(performance.now() - this.t0);
        const shadow = jev?.ask(task, snap.text, signal);
        const messages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Task: ${task}${note ? `\n\n${note}` : ''}` },
          ...trimHistory(history),
          { role: 'user', content: image ? [{ type: 'text', text: pageMsg }, { type: 'image_url', image_url: { url: image } }] : pageMsg },
        ];
        image = undefined;

        // Run each tool call in order as soon as it has streamed in. Once the batch is
        // stale or finished, `turn` stops the stream so the model stops writing calls
        // that would only be skipped.
        const outcomes: Promise<Outcome>[] = [];
        let chain: Promise<unknown> = Promise.resolve();
        let skipRest = false;
        const turn = new AbortController();
        const skipFromHere = () => { skipRest = true; turn.abort(); };
        const exec = async (call: ToolCall): Promise<Outcome> => {
          if (skipRest || signal.aborted) return { call, result: { text: 'skipped: the page changed before this action; re-plan from the new snapshot' } };
          let args: any;
          try { args = JSON.parse(call.arguments || '{}'); } catch {
            skipFromHere();
            return { call, result: { text: `error: arguments were not valid JSON: ${call.arguments.slice(0, 200)}` } };
          }
          this.emit({ kind: 'action', text: `${call.name}(${call.arguments || ''})` });
          const ta = performance.now();
          // Fingerprint the element before acting, while it's certainly still there.
          const recordable = RECORDABLE.has(call.name);
          const target = recordable && typeof args.ref === 'number'
            ? await inPage(dbg.tabId, describeTarget, [args.ref]).catch(() => null)
            : null;
          let result: ToolResult;
          try {
            result = await runTool({ dbg, speed, signal }, call.name, args);
          } catch (e: any) {
            result = { text: `error: ${e?.message ?? e}`, stale: true };
          }
          const failed = result.text.startsWith('error');
          this.emit({ kind: failed ? 'error' : 'result', text: result.text, ms: Math.round(performance.now() - ta) });
          jev?.record(call, result.text);
          if (!failed && !LOOKS.has(call.name)) acted = true;
          if (recordable && !failed) {
            const { ref: _ref, ...rest } = args;
            steps.push(target ? { tool: call.name, args: rest, target } : { tool: call.name, args: rest });
          }
          if (result.stale || result.final) skipFromHere();
          return { call, result };
        };
        // Finish mode: a sure "done" from Jev that lands before the model has started any action stops the
        // turn there. Jev usually answers in ~200 ms, well before the model's first token.
        let finishedBy: number | undefined;
        if (shadow && this.settings.jev === 'finish' && acted) {
          shadow.then((j) => {
            if (j.error || (j.done ?? 0) < JEV_FINISH || outcomes.length || skipRest) return;
            finishedBy = j.done;
            skipFromHere();
          });
        }

        const tm = performance.now();
        const reply = await this.provider.chat({
          messages,
          tools: TOOLS,
          signal,
          stop: turn.signal,
          onToolCall: (call) => {
            const p = chain.then(() => exec(call));
            chain = p;
            outcomes.push(p);
          },
          onRetry: (reason, waitMs) => this.emit({ kind: 'info', text: `model request failed, retrying in ${waitMs}ms: ${reason.slice(0, 200)}` }),
        });
        const modelMs = Math.round(performance.now() - tm);
        const u = reply.usage;
        const stats: TurnStats = {
          step, elements: snap.count, snapshotMs: snapMs, modelMs, firstTokenMs: reply.firstTokenMs,
          ...(u && { input: u.input, output: u.output, cached: u.cached }),
          ...(reply.stopped && { stopped: true }),
        };
        const tokens = u ? ` · ${u.input}→${u.output} tokens${u.cached ? ` (${u.cached} cached)` : ''}` : '';
        this.emit({
          kind: 'info',
          text: `step ${step} · ${snap.count} elements in ${snapMs}ms · model ${modelMs}ms (first token ${reply.firstTokenMs}ms)${tokens}${reply.stopped ? ' · stream stopped early' : ''}`,
          turn: stats,
        });
        if (reply.content.trim()) this.emit({ kind: 'thought', text: reply.content.trim() });

        const results = await Promise.all(outcomes);
        const turnKey = [snap.text, ...reply.toolCalls.map((c) => `${c.name}${(c.arguments || '').replace(/\s+/g, '')}`)].join('\n');
        if (turns.has(turnKey)) stalled++;
        else turns.add(turnKey);
        if (shadow) {
          const j = await shadow;
          const entry: JevShadow = { ...j, step, at: turnAt, ...modelChoice(reply.toolCalls), beforeFirstToken: !j.error && j.ms < reply.firstTokenMs };
          this.emit({ kind: 'info', text: describeShadow(entry), jev: entry });
        }
        if (finishedBy !== undefined) {
          this.emit({ kind: 'done', text: `Done. Jev judged the task complete (${finishedBy.toFixed(2)}).`, ms: Math.round(performance.now() - started), end: 'done' });
          await this.remember(origin, task, rec, steps, replayed);
          return;
        }
        if (!reply.toolCalls.length) {
          this.emit({ kind: 'done', text: reply.content.trim() || 'Finished.', ms: Math.round(performance.now() - started), end: 'reply' });
          return;
        }

        history.push({
          role: 'assistant',
          content: reply.content || null,
          tool_calls: reply.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })),
        });
        for (const { call, result } of results) {
          history.push({ role: 'tool', tool_call_id: call.id, content: result.text });
          if (result.image) image = result.image;
          if (result.final) {
            const prefix = result.final.status === 'handoff' ? 'Your turn: ' : '';
            this.emit({ kind: 'done', text: prefix + result.final.message, ms: Math.round(performance.now() - started), end: result.final.status });
            if (result.final.status === 'done') await this.remember(origin, task, rec, steps, replayed);
            return;
          }
        }
      }
      this.emit({ kind: 'error', text: `Stopped after ${this.settings.maxSteps} steps without finishing.`, end: 'max-steps' });
    } finally {
      await dbg.detach();
    }
  }
}

/** Keeps the most recent messages, starting on an assistant turn so tool results are never orphaned. */
function trimHistory(h: ChatMessage[]): ChatMessage[] {
  if (h.length <= HISTORY_LIMIT) return h;
  let i = h.length - HISTORY_LIMIT;
  while (i < h.length && h[i].role !== 'assistant') i++;
  return h.slice(i);
}
