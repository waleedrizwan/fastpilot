// TypeSafe's Jev, reached through OpenRouter with the same key as the main model. In shadow mode
// it's asked on every turn, beside the model, whether the task is done and what it would do next.
// Its answers are only logged, so they can be checked against the model and the Gauntlet's
// verdicts before Jev is trusted to act.

import type { JevShadow } from '../shared/types';
import type { ToolCall } from './llm/types';

const ENDPOINT = 'https://openrouter.ai/api/v1/systemone';
/** A shadow answer slower than this is dropped rather than holding up the next turn. */
const TIMEOUT_MS = 1500;
/** Choice questions take at most 255 options. */
const MAX_TARGETS = 250;
const RECENT_ACTIONS = 8;

const OPERATIONS = {
  click: 'Click an element: a button, link, tab, checkbox, menu item or option.',
  type: 'Type text into an input field.',
  select: 'Choose an option in a dropdown.',
  scroll: 'Scroll to reveal more of the page.',
  navigate: 'Go to another URL, or back or forward in history.',
  wait: 'Wait for something that is still loading or about to appear.',
  read: 'Read text on the page that the element list does not show.',
  done: 'Nothing is left to do: the task is complete.',
  handoff: 'Hand control back to the user: a CAPTCHA, login, 2FA, payment, or anything that needs their judgment.',
};

/** FastPilot's tools as the operations Jev chooses between. */
const OPERATION_OF: Record<string, string> = {
  click: 'click', type: 'type', select: 'select', scroll: 'scroll', navigate: 'navigate', wait_for: 'wait',
  read_text: 'read', screenshot: 'read', done: 'done', handoff: 'handoff',
};

const TYPEABLE = /^(input(\[(email|password|search|tel|url|number)\])?|textarea|editable|textbox|searchbox|combobox)$/;

/** Element lines of a snapshot, `[ref] kind "label" extras`, grouped by what can be done to them. */
function targets(page: string) {
  const click: Record<string, string> = {}, type: Record<string, string> = {}, select: Record<string, string> = {};
  for (const line of page.split('\n')) {
    const m = /^\[(\d+)\] (\S+)/.exec(line);
    if (!m) continue;
    const group = m[2] === 'select' ? select : TYPEABLE.test(m[2]) ? type : click;
    if (Object.keys(group).length < MAX_TARGETS) group[m[1]] = line;
  }
  return { click, type, select };
}

export class Jev {
  /** What the agent did on recent turns and what each action returned, oldest first. */
  private recent: string[] = [];
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  record(call: ToolCall, result: string) {
    this.recent.push(`${call.name}(${call.arguments || ''}) → ${result.replace(/\s+/g, ' ').slice(0, 200)}`);
    if (this.recent.length > RECENT_ACTIONS) this.recent.shift();
  }

  /** Asks every question in one request. Never throws: a failure comes back as `error`. */
  async ask(task: string, page: string, signal: AbortSignal): Promise<Omit<JevShadow, 'step' | 'at' | 'llm' | 'llmTarget' | 'beforeFirstToken'>> {
    const t0 = performance.now();
    const groups = targets(page);
    const questions: Record<string, object> = {
      done: {
        type: 'noul',
        instructions: 'Is `task` fully complete? `recent_actions` lists what the agent has already done and what each action returned, and `page` is the page now.',
      },
      next: {
        type: 'choice',
        instructions: 'What should the agent do next to advance `task` from `page`, given `recent_actions`? An action that already worked should not be repeated.',
        criteria: OPERATIONS,
      },
    };
    for (const [op, options] of Object.entries(groups)) {
      if (!Object.keys(options).length) continue;
      questions[`${op}_target`] = {
        type: 'choice',
        instructions: `If the agent's next operation is to ${op === 'click' ? 'click' : op === 'type' ? 'type into a field' : 'choose a dropdown option'}, which element of \`page\` should it use to advance \`task\`?`,
        criteria: options,
      };
    }
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, state: { task, recent_actions: this.recent, page }, questions }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      });
      const ms = Math.round(performance.now() - t0);
      if (!res.ok) return { ms, error: `Jev HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
      const { model, answers } = await res.json();
      const next: string = answers.next.choice;
      const target = answers[`${next}_target`];
      return {
        ms, model, done: answers.done.noul, next, nextP: answers.next.probabilities[next],
        ...(target && { target: Number(target.choice), targetP: target.probabilities[target.choice] }),
      };
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      return { ms, error: e?.name === 'TimeoutError' ? `Jev took over ${TIMEOUT_MS}ms` : `Jev failed: ${e?.message ?? e}` };
    }
  }
}

/** The model's first action this turn, as one of Jev's operations, and the element it used. */
export function modelChoice(calls: ToolCall[]): { llm: string; llmTarget?: number } {
  const first = calls[0];
  if (!first) return { llm: 'none' };
  let ref: unknown;
  try { ref = JSON.parse(first.arguments || '{}').ref; } catch {}
  return { llm: OPERATION_OF[first.name] ?? first.name, ...(typeof ref === 'number' && { llmTarget: ref }) };
}

/** One log line comparing the two. */
export function describeShadow(j: JevShadow): string {
  if (j.error) return `jev · ${j.error}`;
  const pick = (op?: string, ref?: number) => `${op}${ref === undefined ? '' : ` [${ref}]`}`;
  const agrees = j.next === j.llm && (j.target === undefined || j.target === j.llmTarget);
  return `jev ${j.ms}ms · would ${pick(j.next, j.target)} (${j.nextP?.toFixed(2)}) · done ${j.done?.toFixed(2)} · model did ${pick(j.llm, j.llmTarget)}${agrees ? ' · agrees' : ''}`;
}
