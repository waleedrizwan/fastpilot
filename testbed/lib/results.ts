// Challenge results. Kept in memory and saved to testbed/.data/results.json so
// the scoreboard survives restarts.

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Status = 'pending' | 'pass' | 'fail' | 'violation';

export interface Attempt {
  at: number;
  status: 'pass' | 'fail' | 'violation';
  detail?: string;
  /** Time from page load to this report. */
  ms?: number;
  /** Whether the event that triggered it was a trusted (real input) event. */
  trusted?: boolean;
  /** Marked by hand on the scoreboard. */
  manual?: boolean;
}

export interface Result { id: string; status: Status; attempts: Attempt[]; passMs?: number; trusted?: boolean; code?: string }

const FILE = fileURLToPath(new URL('../.data/results.json', import.meta.url));
const attempts = new Map<string, Attempt[]>();
let persist = false;
let secret = randomBytes(8).toString('hex');
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function configureResults(opts: { persist: boolean }): void {
  persist = opts.persist;
  attempts.clear();
  if (!persist || !existsSync(FILE)) return;
  try {
    const saved = JSON.parse(readFileSync(FILE, 'utf8'));
    secret = saved.secret ?? secret;
    for (const [id, list] of Object.entries(saved.attempts ?? {})) attempts.set(id, list as Attempt[]);
  } catch (e) {
    console.warn(`could not read ${FILE}:`, e);
  }
}

function save(): void {
  if (!persist) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify({ secret, attempts: Object.fromEntries(attempts) }, null, 1));
  }, 200);
}

/** Short code shown when a challenge passes, so a run's done() text can be checked by eye. */
export const completionCode = (id: string) =>
  createHash('sha256').update(`${secret}/${id}`).digest('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();

export function record(id: string, a: Omit<Attempt, 'at'>): Result {
  const list = attempts.get(id) ?? [];
  list.push({ at: Date.now(), ...a });
  attempts.set(id, list);
  save();
  return resultFor(id);
}

export function resultFor(id: string): Result {
  const list = attempts.get(id) ?? [];
  const manual = list.filter((a) => a.manual).at(-1);
  const pass = list.find((a) => a.status === 'pass');
  let status: Status = 'pending';
  if (list.some((a) => a.status === 'violation' && !a.manual)) status = 'violation';
  else if (manual) status = manual.status;
  else if (pass) status = 'pass';
  else if (list.length) status = 'fail';
  return {
    id, status, attempts: list, passMs: pass?.ms, trusted: pass?.trusted,
    code: status === 'pass' ? completionCode(id) : undefined,
  };
}

export const allResults = () => [...attempts.keys()].map(resultFor);

export function resetResults(id?: string): void {
  if (id) attempts.delete(id);
  else attempts.clear();
  save();
}
