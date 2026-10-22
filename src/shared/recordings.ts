// Saved runs: the actions of a task that finished successfully, keyed by
// site + task text, so the same task can be replayed later without the model.

import type { Target } from '../content/snapshot';

export interface RecordedStep {
  tool: string;
  /** Tool arguments without `ref`; the element is found again through `target`. */
  args: Record<string, unknown>;
  target?: Target;
}

export interface Recording {
  key: string;
  origin: string;
  task: string;
  steps: RecordedStep[];
  createdAt: number;
  lastUsedAt: number;
  uses: number;
}

/** Tools worth replaying. Reads (screenshot, read_text) only fed the model. */
export const RECORDABLE = new Set(['click', 'type', 'select', 'key', 'hover', 'scroll', 'navigate', 'wait_for']);

export function normalizeTask(task: string): string {
  return task.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
}

export function recordingKey(origin: string, task: string): string {
  return `${origin}|${normalizeTask(task)}`;
}

async function all(): Promise<Record<string, Recording>> {
  const { recordings } = await chrome.storage.local.get('recordings');
  return (recordings ?? {}) as Record<string, Recording>;
}

export async function listRecordings(): Promise<Recording[]> {
  return Object.values(await all()).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export async function getRecording(origin: string, task: string): Promise<Recording | undefined> {
  return (await all())[recordingKey(origin, task)];
}

export async function saveRecording(r: Recording): Promise<void> {
  const recs = await all();
  recs[r.key] = r;
  await chrome.storage.local.set({ recordings: recs });
}

export async function deleteRecording(key: string | null): Promise<void> {
  const recs = key === null ? {} : await all();
  if (key !== null) delete recs[key];
  await chrome.storage.local.set({ recordings: recs });
}

/** One-line summary of a step, e.g. `type "Email" ← "jo@example.com"`. */
export function stepSummary(s: RecordedStep): string {
  const { args, target } = s;
  const what = target ? ` "${target.label || target.css || target.tag}"${target.row ? ` (row "${target.row.text}")` : ''}` : '';
  const val = args.text ?? args.value ?? args.url ?? args.combo ?? args.direction;
  return `${s.tool}${what}${val !== undefined ? ` ← ${JSON.stringify(val)}` : ''}`;
}
