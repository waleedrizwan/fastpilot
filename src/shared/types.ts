export type Speed = 'instant' | 'fast' | 'natural';

export interface Settings {
  baseUrl: string;
  apiKey: string;
  model: string;
  speed: Speed;
  maxSteps: number;
  /** Replay saved runs of the same task on the same site instead of asking the model. */
  replay: boolean;
  /**
   * TypeSafe's Jev, asked each turn beside the model (needs OpenRouter). shadow: its answers are only logged.
   * finish: it may also end the run when it's at least 90% sure the task is complete.
   */
  jev: 'off' | 'shadow' | 'finish';
  /** OpenRouter's id for Jev. */
  jevModel: string;
  /** Draw the pointer, clicks and keys on the page while a task runs. */
  showInput: boolean;
  /** Run tasks in FastPilot's own window instead of the tab you're looking at. */
  ownWindow: boolean;
  /** Origins the run must stay on; it stops if the tab leaves them. Set only for Gauntlet bridge runs, never saved. */
  confine?: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: 'anthropic/claude-haiku-5.5',
  speed: 'fast',
  maxSteps: 40,
  replay: true,
  jev: 'off',
  jevModel: '~typesafe/jev-latest',
  showInput: true,
  ownWindow: true,
};

/** Jev is reached through OpenRouter, with the same key as the main model. */
export function isOpenRouter(baseUrl: string): boolean {
  return /^https:\/\/openrouter\.ai\//.test(baseUrl);
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
}

/** Local servers (Ollama, LM Studio) don't need a key. */
export function needsApiKey(baseUrl: string): boolean {
  return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(baseUrl);
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ settings: s });
}

/** Side panel → service worker. */
export type PanelMsg = { type: 'run'; task: string } | { type: 'stop' } | { type: 'snapshot' };

/** Service worker → side panel. */
export interface LogEvent {
  kind: 'info' | 'thought' | 'action' | 'result' | 'error' | 'done' | 'snapshot' | 'idle' | 'live';
  text: string;
  ms?: number;
  /** ms since the task started. */
  at?: number;
  /** Timings and token counts of one model turn, on its `info` event. */
  turn?: TurnStats;
  /** What ended the run, on the final `done` or `error` event. */
  end?: 'done' | 'handoff' | 'reply' | 'max-steps' | 'stalled';
  /** Jev's shadow answer for one turn, on its `info` event. */
  jev?: JevShadow;
  /** The current step as it happens, on `live` events. Each one replaces the last. */
  live?: LiveStep;
}

/** What the agent is doing in the current step, updated while the model is still writing. */
export interface LiveStep {
  step: number;
  /** One line: looking at the page, thinking, or the action running. */
  status: string;
  /** The model's reply so far, and its reasoning when the provider streams it. */
  text: string;
  reasoning: string;
  /** Actions written so far this step, each with the element it targets and why. */
  calls: { name: string; target?: string; why?: string; state: 'writing' | 'queued' | 'running' | 'done' | 'failed' | 'skipped' }[];
  /** Jev's pick for this step, once it answers. */
  jev?: { next?: string; nextP?: number; target?: string; targetP?: number; done?: number; ms: number; error?: string };
}

/** What Jev, asked in shadow mode, would have done on one turn, beside what the model did. */
export interface JevShadow {
  step: number;
  /** ms since the task started when the turn's snapshot was taken. */
  at: number;
  /** Jev's round trip. */
  ms: number;
  /** The model version that answered. */
  model?: string;
  /** Probability that the task was already complete. */
  done?: number;
  next?: string;
  nextP?: number;
  /** The element Jev would act on for `next`, when it takes one. */
  target?: number;
  targetP?: number;
  /** The model's first action this turn, as one of Jev's operations, and its element. */
  llm: string;
  llmTarget?: number;
  /** Jev answered before the model's first token arrived. */
  beforeFirstToken?: boolean;
  error?: string;
}

export interface TurnStats {
  step: number;
  elements: number;
  snapshotMs: number;
  modelMs: number;
  firstTokenMs: number;
  /** Token counts, when the provider reports them. */
  input?: number;
  output?: number;
  cached?: number;
  /** The stream was cut short because the batch went stale or finished. */
  stopped?: boolean;
}
