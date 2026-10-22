// Gauntlet runner: drives the FastPilot extension through the challenges and
// collects the scores. It runs in your own Chrome without Chrome's debugging port:
// each challenge is queued on the Gauntlet server, FastPilot (loaded unpacked from
// dist/) picks it up, runs it in a tab you can watch, and posts its log back
// (src/shared/bridge.ts). Results are read back from /api/results.
//
//   FASTPILOT_API_KEY=... npm run gauntlet -- --only supported --area lab:clicks
//   npm run gauntlet -- --help
//
// The API key, when given here, reaches FastPilot through the local Gauntlet server
// in memory only. It is never stored, written to the report or printed.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, styleText } from 'node:util';
import { BRIDGE_BASE, BRIDGE_HEADER, type BridgeHello, type BridgeJob } from '../src/shared/bridge.ts';
import { DEFAULT_SETTINGS, needsApiKey, type LogEvent, type Settings } from '../src/shared/types.ts';
import type { Attempt, Result, Status } from './lib/results.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
/** How long to wait after the agent stops for the page or server to report. */
const REPORT_GRACE_MS = 1500;
const REPORT_MAX_MS = 5000;
const HELP = `Runs FastPilot through Gauntlet challenges and prints a summary.

Usage: npm run gauntlet -- [options]

Choosing challenges (filters combine; lists can be comma-separated or repeated):
  --area <a>        Area, e.g. shop or lab:clicks. "lab" matches every lab category.
  --only <set>      "supported" (FastPilot has the tools) or "gaps" (gap probes).
  --check <c>       auto, answer or handoff.
  --id <id>         A challenge id, an id prefix (lab/clicks) or a glob (lab/*/hover-*).
  --level <n>       1, 2 or 3.
  --limit <n>       Run at most n challenges.
  --list            Print the selected challenges and exit.

Running:
  --timeout <s>     Per-challenge limit in seconds (default 180).
  --speed <s>       instant, fast or natural (default: the extension's setting).
  --max-steps <n>   Agent step limit (default: the extension's setting).
  --replay          Allow saved-run replay. Off by default so every run asks the model.
  --jev <mode>      off, shadow (ask TypeSafe's Jev each turn and log its answer beside the model's)
                    or finish (also end the run when Jev is at least 90% sure it's done). Default:
                    the extension's setting. Needs OpenRouter as the provider.
  --keep-state      Don't reset the site's carts, orders and sign-ins before each challenge.
  --reset           Clear each challenge's old results first, so the scoreboard shows only this run.
  --verbose, -v     Print the agent's log as it runs.

Browser and site:
  Runs in your own Chrome, the one you browse with, with no prompts and no debugging port. Load
  dist/ there once with "Load unpacked" on chrome://extensions; that development build checks the
  Gauntlet server for work every 30 s, runs each challenge in a tab you can watch, and closes only the
  tabs it opened. Each run first reloads FastPilot so it runs the current build.
  --base <url>      Gauntlet URL (default http://localhost:5175, the only address FastPilot polls).
                    Started in-process if it isn't running.
  --build, --no-build
                    Always or never run "npm run build" first. By default it builds when dist/ is
                    missing or older than src/.
  --out <file>      Where to write the JSON report (default testbed/.data/runs/<time>.json).

Model (environment variables):
  FASTPILOT_API_KEY   API key. Falls back to OPENROUTER_API_KEY, OPENAI_API_KEY, GROQ_API_KEY or
                      CEREBRAS_API_KEY to match the base URL.
  FASTPILOT_MODEL     Model id (default ${DEFAULT_SETTINGS.model} on the default base URL).
  FASTPILOT_BASE_URL  OpenAI-compatible base URL (default ${DEFAULT_SETTINGS.baseUrl}).
  Anything not set here comes from FastPilot's saved settings in your Chrome. The provider's key variable is used only when no key is saved there.
`;

// ---------------------------------------------------------------------------
// Options

const { values: opt } = parseArgs({
  allowNegative: true,
  options: {
    area: { type: 'string', multiple: true },
    only: { type: 'string' },
    check: { type: 'string', multiple: true },
    id: { type: 'string', multiple: true },
    level: { type: 'string', multiple: true },
    limit: { type: 'string' },
    list: { type: 'boolean' },
    timeout: { type: 'string', default: '180' },
    speed: { type: 'string' },
    'max-steps': { type: 'string' },
    replay: { type: 'boolean' },
    jev: { type: 'string' },
    'keep-state': { type: 'boolean' },
    reset: { type: 'boolean' },
    verbose: { type: 'boolean', short: 'v' },
    base: { type: 'string' },
    build: { type: 'boolean' },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

const list = (v: string[] | undefined) => (v ?? []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);

function fail(message: string): never {
  console.error(styleText('red', message));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Challenges from /api/results

interface ApiChallenge {
  id: string; area: string; title: string; path: string; task: string;
  check: 'auto' | 'answer' | 'handoff'; needs: string[]; level: number; supported: boolean; result: Result;
}

async function api<T = any>(base: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

const challengesFrom = async (base: string) => (await api<{ challenges: ApiChallenge[] }>(base, '/api/results')).challenges;

function select(all: ApiChallenge[]): ApiChallenge[] {
  const areas = list(opt.area), checks = list(opt.check), ids = list(opt.id), levels = list(opt.level).map(Number);
  const only = opt.only?.replace(/s$/, '');
  if (only && only !== 'supported' && only !== 'gap') fail(`--only takes "supported" or "gaps", not "${opt.only}"`);
  const idMatch = (id: string, pat: string) => pat.includes('*')
    ? new RegExp(`^${pat.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(id)
    : id === pat || id.startsWith(pat.replace(/\/$/, '') + '/');
  const picked = all.filter((c) =>
    (!areas.length || areas.some((a) => c.area === a || c.area.startsWith(`${a}:`))) &&
    (!only || (only === 'supported') === c.supported) &&
    (!checks.length || checks.includes(c.check)) &&
    (!levels.length || levels.includes(c.level)) &&
    (!ids.length || ids.some((p) => idMatch(c.id, p))));
  return opt.limit ? picked.slice(0, Number(opt.limit)) : picked;
}

// ---------------------------------------------------------------------------
// The bridge to FastPilot (src/shared/bridge.ts): jobs go through the Gauntlet server, never through
// Chrome's debugging port, so Chrome never asks to allow a connection.

/** FastPilot looks for work at least every 30 s while it's asleep. */
const WAKE_MS = 45_000;
const OTHER_ORIGIN = `http://127.0.0.1:${process.env.OTHER_PORT || 5176}`;

type NewJob = { [K in BridgeJob['kind']]: Omit<Extract<BridgeJob, { kind: K }>, 'id'> }[BridgeJob['kind']];

async function bridge<T = any>(base: string, path: string, body: object): Promise<T> {
  const res = await fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', [BRIDGE_HEADER]: '1' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

/** Waits for a copy of FastPilot that started after `since` (ms since epoch) to check in, and returns what it reported. */
async function waitForFastPilot(base: string, message: string, since = -1): Promise<BridgeHello> {
  const status = async () => {
    const s = await bridge<{ connected: boolean; seenAt: number; hello: BridgeHello | null }>(base, '/api/bridge/status', {});
    return s.connected && s.hello && (s.hello.started ?? 0) > since ? s.hello : undefined;
  };
  let hello = await status();
  if (hello) return hello;
  if (message) console.log(message);
  hello = await poll(status, WAKE_MS);
  return hello ?? fail(`FastPilot didn't check in. In your Chrome, load ${DIST} with "Load unpacked" on chrome://extensions (once), then run this again.`);
}

async function enqueue(base: string, job: NewJob): Promise<string> {
  return (await bridge<{ id: string }>(base, '/api/bridge/enqueue', { job })).id;
}

/**
 * Follows a job's log until it finishes, passing each new event on. Resolves false if `ms` runs out
 * first. `seen` carries how many events were already passed on, so following again doesn't repeat them.
 */
async function follow(base: string, id: string, ms: number, onEvent: (e: LogEvent) => void = () => {}, seen = { n: 0 }): Promise<boolean> {
  const end = Date.now() + ms;
  for (;;) {
    const r = await bridge<{ events: LogEvent[]; done: boolean }>(base, '/api/bridge/events', { job: id, after: seen.n });
    seen.n += r.events.length;
    r.events.forEach(onEvent);
    if (r.done) return true;
    if (Date.now() > end) return false;
    await sleep(150);
  }
}

// ---------------------------------------------------------------------------
// Running one challenge

type Finish = 'done' | 'handoff' | 'reply' | 'max-steps' | 'stalled' | 'timeout' | 'error';
type Outcome = 'pass' | 'fail' | 'violation' | 'timeout' | 'error';

interface RunResult {
  id: string; area: string; title: string; check: ApiChallenge['check']; level: number; supported: boolean; needs: string[];
  outcome: Outcome;
  /** How the agent stopped: done(), handoff(), a plain reply, the step limit, the runner's timeout, or an error. */
  finish: Finish;
  /** The agent's done()/handoff() text, or the error. */
  text: string;
  /** Scoreboard status from this run's attempts. */
  server: Status;
  attempts: Attempt[];
  /** Handoff challenges are marked on the scoreboard from how the agent finished. */
  marked?: 'pass' | 'fail';
  ms: number;
  /** Server-side time from the challenge start to its pass. */
  passMs?: number;
  steps: number;
  actions: number;
  /** Summed over the agent's model turns. Tokens are null when the provider doesn't report them. */
  modelMs: number;
  tokens: { input: number; output: number; cached: number } | null;
  signedIn: boolean;
  log: LogEvent[];
}

/** Same rules as resultFor() in lib/results.ts, applied to one run's attempts. */
function statusOf(list: Attempt[]): Status {
  if (list.some((a) => a.status === 'violation' && !a.manual)) return 'violation';
  const manual = list.filter((a) => a.manual).at(-1);
  if (manual) return manual.status;
  if (list.some((a) => a.status === 'pass')) return 'pass';
  return list.length ? 'fail' : 'pending';
}

function finishOf(log: LogEvent[], timedOut: boolean): { finish: Finish; text: string } {
  if (timedOut) return { finish: 'timeout', text: '' };
  const last = findLast(log, (e) => e.kind === 'done' || e.kind === 'error');
  if (last?.kind === 'error') {
    const finish = last.end === 'max-steps' || /^Stopped after \d+ steps/.test(last.text) ? 'max-steps' : last.end === 'stalled' ? 'stalled' : 'error';
    return { finish, text: last.text };
  }
  if (!last) return { finish: 'error', text: 'the agent stopped without a result' };
  // Builds from before the agent reported `end` only say it through the last action.
  const tool = last.end ?? findLast(log, (e) => e.kind === 'action' && /^(done|handoff)\(/.test(e.text))?.text.split('(')[0] as Finish | undefined;
  return { finish: tool ?? 'reply', text: last.text.replace(/^Your turn: /, '') };
}

function outcomeOf(c: ApiChallenge, server: Status, finish: Finish): Outcome {
  if (server === 'violation') return 'violation';
  if (c.check === 'handoff') return finish === 'handoff' ? 'pass' : finish === 'timeout' || finish === 'error' ? finish : 'fail';
  if (server === 'pass') return 'pass';
  return finish === 'timeout' || finish === 'error' ? finish : 'fail';
}

interface Ctx { base: string; settings: Partial<Settings>; redact: (s: string) => string; job?: string }

async function runOne(ctx: Ctx, c: ApiChallenge, onLog: (e: LogEvent) => void): Promise<RunResult> {
  const { base } = ctx;
  if (!opt['keep-state']) await api(base, '/api/reset-site', {});
  if (opt.reset) await api(base, '/api/results/reset', { id: c.id });
  const seen = (await challengesFrom(base)).find((x) => x.id === c.id)!.result.attempts.length;

  // The start page sets two cookies for agent runs. agent=1 hides the challenge strip's pass/fail status,
  // result line and expected outcome (see page() in lib/layout.ts); otherwise the agent can read
  // "✓ Challenge passed" off the page and stop there. consent answers the cookie banner the way a person
  // would have once; without it the banner covers every store page and each answer counts as an attempt.
  const start = `${base}/challenges/start/${c.id}?agent=1${opt['keep-state'] ? '' : '&consent=necessary'}`;
  // Tasks that say "Sign in as demo first" expect the person running them to have done it.
  const signedIn = /sign in as demo/i.test(c.task);

  const log: LogEvent[] = [];
  const onEvent = (e: LogEvent) => {
    if (e.kind === 'idle') return;
    const ev = { ...e, text: ctx.redact(e.text).slice(0, 2000) };
    log.push(ev);
    onLog(ev);
  };
  const t0 = performance.now();
  const id = await enqueue(base, {
    kind: 'run', task: c.task, settings: ctx.settings, confine: [base, OTHER_ORIGIN],
    urls: signedIn ? [`${base}/challenges/demo-signin`, start] : [start],
  });
  ctx.job = id;
  const logSeen = { n: 0 };
  const timedOut = !(await follow(base, id, Number(opt.timeout) * 1000, onEvent, logSeen));
  const ms = Math.round(performance.now() - t0);
  if (timedOut) {
    await bridge(base, '/api/bridge/stop', { job: id });
    // A tool that ignores Stop keeps FastPilot, and so every later challenge, busy. Reloading it ends the task.
    if (!(await follow(base, id, 10_000, onEvent, logSeen))) {
      const at = Date.now();
      await enqueue(base, { kind: 'reload' });
      await waitForFastPilot(base, 'Reloading FastPilot to end a task that ignored Stop…', at);
    }
  }
  ctx.job = undefined;

  // Page scripts report a moment after the last action; give them time before closing the tab.
  let attempts: Attempt[] = [];
  const until = Date.now() + REPORT_MAX_MS;
  await sleep(REPORT_GRACE_MS);
  for (;;) {
    attempts = (await challengesFrom(base)).find((x) => x.id === c.id)!.result.attempts.slice(seen);
    if (attempts.length || Date.now() > until) break;
    await sleep(300);
  }
  await follow(base, await enqueue(base, { kind: 'close', run: id }), 10_000);

  const { finish, text } = finishOf(log, timedOut);
  let server = statusOf(attempts);
  let marked: RunResult['marked'];
  if (c.check === 'handoff' && server !== 'violation' && finish !== 'error') {
    marked = finish === 'handoff' ? 'pass' : 'fail';
    const r = await api<Result>(base, '/api/results/mark', { id: c.id, status: marked });
    attempts = r.attempts.slice(seen);
    server = statusOf(attempts);
  }
  return {
    id: c.id, area: c.area, title: c.title, check: c.check, level: c.level, supported: c.supported, needs: c.needs,
    outcome: outcomeOf(c, server, finish), finish, text, server, attempts, marked, ms,
    passMs: attempts.find((a) => a.status === 'pass' && !a.manual)?.ms,
    steps: log.filter((e) => e.kind === 'info' && /^step \d+ ·/.test(e.text)).length,
    actions: log.filter((e) => e.kind === 'action').length,
    ...turnTotals(log),
    signedIn, log,
  };
}

function turnTotals(log: LogEvent[]): Pick<RunResult, 'modelMs' | 'tokens'> {
  const turns = log.flatMap((e) => (e.turn ? [e.turn] : []));
  const sum = (f: (t: (typeof turns)[number]) => number | undefined) => turns.reduce((a, t) => a + (f(t) ?? 0), 0);
  return {
    modelMs: sum((t) => t.modelMs),
    tokens: turns.some((t) => t.input !== undefined)
      ? { input: sum((t) => t.input), output: sum((t) => t.output), cached: sum((t) => t.cached) }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Output

const OUTCOME_LABEL: Record<Outcome, string> = { pass: 'PASS', fail: 'FAIL', violation: 'VIOL', timeout: 'T/O ', error: 'ERR ' };
const OUTCOME_COLOR = { pass: 'green', fail: 'red', violation: 'magenta', timeout: 'yellow', error: 'yellow' } as const;
const label = (o: Outcome) => styleText(OUTCOME_COLOR[o], OUTCOME_LABEL[o]);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/\s+/g, ' ');

interface Tally { label: string; run: number; pass: number; fail: number; violation: number; timeout: number; error: number; avgMs: number | null; avgPassMs: number | null }

function tally(name: string, rs: RunResult[]): Tally {
  const n = (o: Outcome) => rs.filter((r) => r.outcome === o).length;
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    label: name, run: rs.length, pass: n('pass'), fail: n('fail'), violation: n('violation'), timeout: n('timeout'), error: n('error'),
    avgMs: avg(rs.map((r) => r.ms)), avgPassMs: avg(rs.filter((r) => r.outcome === 'pass').map((r) => r.ms)),
  };
}

function summarize(results: RunResult[]) {
  const areas = [...new Set(results.map((r) => r.area))];
  return {
    byArea: areas.map((a) => tally(a, results.filter((r) => r.area === a))),
    supported: tally('Supported today', results.filter((r) => r.supported)),
    gaps: tally('Gap probes', results.filter((r) => !r.supported)),
    total: tally('All', results),
  };
}

function printSummary(s: ReturnType<typeof summarize>, results: RunResult[]) {
  const head = ['', 'Run', 'Pass', 'Fail', 'Viol', 'T/O', 'Err', 'Pass%', 'Avg s', 'Pass avg s'];
  const row = (t: Tally) => [
    t.label, t.run, t.pass, t.fail, t.violation, t.timeout, t.error,
    t.run ? `${Math.round((100 * t.pass) / t.run)}%` : '-',
    t.avgMs === null ? '-' : (t.avgMs / 1000).toFixed(1), t.avgPassMs === null ? '-' : (t.avgPassMs / 1000).toFixed(1),
  ].map(String);
  const rows = [...s.byArea.map(row), null, ...[s.supported, s.gaps].filter((t) => t.run).map(row), row(s.total)];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r ? r[i].length : 0))));
  const line = (cells: string[]) => cells.map((c, i) => (i ? c.padStart(width[i]) : c.padEnd(width[i]))).join('  ');
  console.log(`\n${styleText('bold', line(head))}`);
  for (const r of rows) console.log(r ? line(r) : '-'.repeat(line(head).length));

  const misses = results.filter((r) => r.outcome !== 'pass');
  if (misses.length) {
    console.log(styleText('bold', '\nNot passed'));
    for (const r of misses) {
      const why = findLast(r.attempts, (a) => !a.manual)?.detail;
      console.log(`  ${label(r.outcome)}  ${r.id}  [${r.finish}] ${clip(r.text || '-', 90)}${why ? styleText('dim', ` · site: ${clip(why, 70)}`) : ''}`);
    }
  }
}

function printEvent(e: LogEvent) {
  const text = clip(e.kind === 'action' ? `→ ${e.text}` : e.text, 160);
  const ms = e.ms === undefined ? '' : styleText('dim', ` ${e.ms >= 1000 ? secs(e.ms) : `${e.ms}ms`}`);
  console.log(`        ${e.kind === 'error' ? styleText('red', text) : e.kind === 'info' ? styleText('dim', text) : text}${ms}`);
}

// ---------------------------------------------------------------------------
// Setup and the main loop

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const findLast = <T>(xs: T[], f: (x: T) => boolean): T | undefined => xs.filter(f).at(-1);

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([p, sleep(ms).then(() => { throw new Error(message); })]);
}

async function poll<T>(fn: () => Promise<T | undefined>, ms: number): Promise<T | undefined> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await sleep(100);
  }
}

function newest(path: string): number {
  const st = statSync(path);
  return st.isDirectory() ? Math.max(st.mtimeMs, ...readdirSync(path).map((f) => newest(join(path, f)))) : st.mtimeMs;
}

function buildIfNeeded() {
  if (opt.build === false) return;
  const built = join(DIST, 'manifest.json');
  const stale = !existsSync(built) || Math.max(...['src', 'manifest.json', 'vite.config.ts'].map((p) => newest(join(ROOT, p)))) > statSync(built).mtimeMs;
  if (!opt.build && !stale) return;
  console.log('Building the extension (npm run build)…');
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) fail('npm run build failed.');
}

const KEY_ENV: [RegExp, string][] = [
  [/openrouter\.ai/, 'OPENROUTER_API_KEY'], [/api\.openai\.com/, 'OPENAI_API_KEY'], [/groq\.com/, 'GROQ_API_KEY'], [/cerebras\.ai/, 'CEREBRAS_API_KEY'],
];

/** Settings for this run from the environment and flags. They override the extension's saved settings in memory only. */
function settingsFromEnv(): Partial<Settings> {
  const env = process.env;
  const s: Partial<Settings> = { replay: !!opt.replay };
  if (env.FASTPILOT_BASE_URL) s.baseUrl = env.FASTPILOT_BASE_URL;
  if (env.FASTPILOT_MODEL) s.model = env.FASTPILOT_MODEL;
  // Unset values come from the extension's saved settings in that Chrome.
  const baseUrl = s.baseUrl;
  const keyVar = baseUrl && KEY_ENV.find(([re]) => re.test(baseUrl))?.[1];
  const key = env.FASTPILOT_API_KEY || (keyVar ? env[keyVar] : undefined);
  if (key) s.apiKey = key;
  if (opt.speed) {
    if (!['instant', 'fast', 'natural'].includes(opt.speed)) fail('--speed takes instant, fast or natural.');
    s.speed = opt.speed as Settings['speed'];
  }
  if (opt['max-steps']) s.maxSteps = Math.max(1, Number(opt['max-steps']) || DEFAULT_SETTINGS.maxSteps);
  if (opt.jev) {
    if (!['off', 'shadow', 'finish'].includes(opt.jev)) fail('--jev takes off, shadow or finish.');
    s.jev = opt.jev as Settings['jev'];
  }
  return s;
}

async function ensureSite(base: string): Promise<(() => Promise<void>) | undefined> {
  if (await api(base, '/api/results').then(() => true, () => false)) return undefined;
  const url = new URL(base);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) fail(`Gauntlet isn't answering at ${base}.`);
  const { start } = await import('./server.ts');
  const run = await start({ port: Number(url.port) || 80, otherPort: Number(process.env.OTHER_PORT) || undefined, persist: true });
  console.log(`Started Gauntlet at ${run.main} (second origin ${run.other})`);
  return run.close;
}

async function main() {
  if (opt.help) return void console.log(HELP);
  const base = (opt.base ?? `http://localhost:${process.env.PORT || 5175}`).replace(/\/+$/, '');
  const stopSite = await ensureSite(base);
  try {
    await mainWithSite(base);
  } finally {
    await stopSite?.();
  }
}

async function mainWithSite(base: string) {
  const picked = select(await challengesFrom(base));
  if (!picked.length) fail('No challenges match those filters.');
  if (opt.list) {
    for (const c of picked) console.log(`${c.id.padEnd(44)} ${c.check.padEnd(8)} ${c.supported ? '         ' : 'gap probe'}  ${clip(c.task, 80)}`);
    return void console.log(`\n${picked.length} challenges`);
  }

  if (!(Number(opt.timeout) > 0)) fail('--timeout takes a number of seconds.');
  const settings = settingsFromEnv();
  const redact = (s: string) => (settings.apiKey ? s.split(settings.apiKey).join('[key]') : s);
  buildIfNeeded();

  if (new URL(base).origin !== BRIDGE_BASE) fail(`FastPilot looks for work only at ${BRIDGE_BASE}, so --base must be that address.`);
  let hello = await waitForFastPilot(base, 'Waiting for FastPilot in your Chrome to check in (it looks for work every 30 s)…');
  // Your Chrome may have loaded dist/ before the last build; reload it so it runs the current code.
  const reloadAt = Date.now();
  await enqueue(base, { kind: 'reload' });
  hello = await waitForFastPilot(base, '', reloadAt);
  // The reload should have picked up dist/. If Chrome still reports an older build, say so.
  const built = statSync(join(DIST, 'manifest.json')).mtimeMs;
  if (!hello.build || Date.parse(hello.build) < built - 60_000) {
    console.log(styleText('yellow', `FastPilot in Chrome is build ${hello.build ?? '(unknown, older)'}, older than dist/. Reload it once on chrome://extensions.`));
  }
  let ctx: Ctx | undefined;
  let stopping = false;
  const onSigint = () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log(styleText('yellow', '\nStopping after this challenge (Ctrl-C again to quit now)…'));
    if (ctx?.job) bridge(base, '/api/bridge/stop', { job: ctx.job }).catch(() => {});
  };
  process.on('SIGINT', onSigint);

  const results: RunResult[] = [];
  const startedAt = new Date();
  // What this run uses: FastPilot's saved settings, with anything given here on top.
  const { apiKey: _key, ...overrides } = settings;
  let effective = { ...hello.settings, ...overrides, hasKey: hello.hasKey || !!settings.apiKey };
  try {
    ctx = { base, settings, redact };
    // No key saved in FastPilot: fall back to the provider's own variable.
    const keyVar = !effective.hasKey && KEY_ENV.find(([re]) => re.test(effective.baseUrl))?.[1];
    if (keyVar && process.env[keyVar]) {
      settings.apiKey = process.env[keyVar];
      effective = { ...effective, hasKey: true };
    }
    if (!effective.model) throw new Error('No model set. Set FASTPILOT_MODEL.');
    if (!effective.hasKey && needsApiKey(effective.baseUrl)) {
      throw new Error('No API key. Set FASTPILOT_API_KEY (or the provider\'s own key variable, see --help).');
    }
    console.log(`FastPilot ${hello.version} (build ${hello.build}) · your Chrome, through the Gauntlet bridge`);
    console.log(`Model ${effective.model} via ${effective.baseUrl} · speed ${effective.speed} · up to ${effective.maxSteps} steps · ${opt.timeout}s timeout${effective.jev !== 'off' ? ` · Jev ${effective.jev} (${effective.jevModel})` : ''}`);
    console.log(`Running ${picked.length} challenge${picked.length === 1 ? '' : 's'} against ${base}\n`);

    const pad = String(picked.length).length;
    for (const [i, c] of picked.entries()) {
      if (stopping) break;
      const tag = `[${String(i + 1).padStart(pad)}/${picked.length}]`;
      if (opt.verbose) console.log(`${tag} ${c.id}  ${styleText('dim', clip(c.task, 100))}`);
      const r = await runOne(ctx, c, opt.verbose ? printEvent : () => {});
      if (stopping && r.finish === 'error') {
        console.log(`${opt.verbose ? '       ' : tag} ${styleText('yellow', 'stopped')}  ${r.id}`);
        break;
      }
      results.push(r);
      const detail = [
        r.finish, secs(r.ms), `${r.steps} step${r.steps === 1 ? '' : 's'}`, `model ${secs(r.modelMs)}`,
        r.tokens && `${((r.tokens.input + r.tokens.output) / 1000).toFixed(1)}k tokens`, r.marked && `marked ${r.marked}`,
      ].filter(Boolean).join(' · ');
      console.log(`${opt.verbose ? '       ' : tag} ${label(r.outcome)}  ${r.id}  ${styleText('dim', detail)}`);
      // A bad key or model fails every challenge the same way; stop early.
      if (r.finish === 'error' && /Model API (401|402|403|404)|Set a model|Add your API key/.test(r.text)) {
        console.error(styleText('red', `\n${r.text}`));
        break;
      }
    }
  } finally {
    process.off('SIGINT', onSigint);
    // This is your own browser: show the challenge status again.
    await enqueue(base, { kind: 'visit', url: `${base}/challenges/agent-off` }).then((id) => follow(base, id, 15_000)).catch(() => {});
  }

  if (!results.length) return;
  const summary = summarize(results);
  printSummary(summary, results);
  const out = opt.out ?? join(ROOT, 'testbed/.data/runs', `${startedAt.toISOString().replace(/[:.]/g, '-')}.json`);
  mkdirSync(dirname(out), { recursive: true });
  const { hasKey: _k, ...model } = effective;
  writeFileSync(out, `${JSON.stringify({
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), base, fastpilot: hello.version,
    settings: model, timeoutSec: Number(opt.timeout), filters: { area: list(opt.area), only: opt.only, check: list(opt.check), id: list(opt.id), level: list(opt.level), limit: opt.limit },
    summary, results,
  }, null, 1)}\n`);
  const shown = relative(process.cwd(), out);
  console.log(`\nReport: ${shown.startsWith('..') ? out : shown}`);
}

main().catch((e) => fail(String(e?.message ?? e)));
