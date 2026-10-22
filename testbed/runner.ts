// Gauntlet runner: drives the FastPilot extension through the challenges and
// collects the scores. It attaches to your own running Chrome, where FastPilot
// is loaded from dist/, opens each challenge as a tab you can watch, hands the task to the extension's test hook (fastpilotTest in
// src/background/index.ts), and reads the result back from /api/results.
//
//   FASTPILOT_API_KEY=... npm run gauntlet -- --only supported --area lab:clicks
//   npm run gauntlet -- --help
//
// The API key is passed to the extension in memory over the DevTools pipe. It is
// never stored in the Chrome profile, the report or the console output.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, styleText } from 'node:util';
import { DEFAULT_SETTINGS, needsApiKey, type LogEvent, type Settings } from '../src/shared/types.ts';
import type { Attempt, Result, Status } from './lib/results.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const LOAD_MS = 10_000;
/** How long to wait after the agent stops for the page or server to report. */
const REPORT_GRACE_MS = 1500;
const REPORT_MAX_MS = 5000;
/** Marks the browser as an agent run for the site. */
const AGENT_COOKIE = 'gauntlet_agent';

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
  By default the runner uses your own Chrome, the one you browse with. Load dist/ there once with
  "Load unpacked" on chrome://extensions, and turn on "Allow remote debugging for this browser
  instance" on chrome://inspect/#remote-debugging. Chrome asks you to Allow each run. FastPilot is
  reloaded from dist/ first, challenges open as tabs in your window, and only those tabs are closed.
  --base <url>      Gauntlet URL (default http://localhost:5175). Started in-process if it isn't running.
  --cdp <url>       Attach to another running Chrome (http://127.0.0.1:9222 or a ws:// URL) that
                    already has dist/ loaded.
  --build, --no-build
                    Always or never run "npm run build" first. By default it builds when dist/ is
                    missing or older than src/.
  --out <file>      Where to write the JSON report (default testbed/.data/runs/<time>.json).

Model (environment variables):
  FASTPILOT_API_KEY   API key. Falls back to OPENROUTER_API_KEY, OPENAI_API_KEY, GROQ_API_KEY or
                      CEREBRAS_API_KEY to match the base URL.
  FASTPILOT_MODEL     Model id (default ${DEFAULT_SETTINGS.model} on the default base URL).
  FASTPILOT_BASE_URL  OpenAI-compatible base URL (default ${DEFAULT_SETTINGS.baseUrl}).
  In your own Chrome (or with --cdp), anything not set here comes from the extension's saved
  settings. The provider's key variable is used only when no key is saved there.
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
    cdp: { type: 'string' },
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
// A minimal DevTools protocol client, over Chrome's pipe or a WebSocket

type Listener = (method: string, params: any, sessionId?: string) => void;

class Cdp {
  private seq = 0;
  private calls = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; method: string; sessionId?: string }>();
  private listeners = new Set<Listener>();
  private closed: string | null = null;
  private write: (msg: string) => void;

  constructor(write: (msg: string) => void) {
    this.write = write;
  }

  receive(raw: string) {
    const m = JSON.parse(raw);
    if (m.id !== undefined) {
      const call = this.calls.get(m.id);
      this.calls.delete(m.id);
      if (m.error) call?.reject(new Error(`${call.method}: ${m.error.message}`));
      else call?.resolve(m.result);
    } else {
      // Calls into a session that went away would otherwise never settle.
      if (m.method === 'Target.detachedFromTarget') {
        for (const [id, c] of this.calls) {
          if (c.sessionId === m.params.sessionId) {
            this.calls.delete(id);
            c.reject(new Error(`${c.method}: the target went away`));
          }
        }
      }
      for (const l of this.listeners) l(m.method, m.params, m.sessionId);
    }
  }

  send<T = any>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    if (this.closed) return Promise.reject(new Error(this.closed));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.calls.set(id, { resolve, reject, method, sessionId });
      this.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(l: Listener) {
    this.listeners.add(l);
  }

  close(reason: string) {
    this.closed = reason;
    for (const c of this.calls.values()) c.reject(new Error(reason));
    this.calls.clear();
  }
}

interface Browser { cdp: Cdp; version: string; extensionId: string; close(): Promise<void> }

/** The profile folder of the Chrome you browse with. */
function chromeUserDataDir(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library/Application Support/Google/Chrome');
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData/Local'), 'Google/Chrome/User Data');
  return join(homedir(), '.config/google-chrome');
}

/**
 * The DevTools address of the Chrome you browse with. Chrome writes it to DevToolsActivePort once
 * "Allow remote debugging for this browser instance" is on, and recent versions don't serve
 * /json/version for the default profile, so the file is the only way to find it.
 */
function ownChrome(): string {
  const file = join(chromeUserDataDir(), 'DevToolsActivePort');
  if (!existsSync(file)) {
    fail('Your Chrome isn\'t accepting connections. Open chrome://inspect/#remote-debugging in Chrome, turn on '
      + '"Allow remote debugging for this browser instance", then run this again.');
  }
  const [port, path] = readFileSync(file, 'utf8').split('\n').map((l) => l.trim());
  return `ws://127.0.0.1:${port}${path}`;
}

/** Attaches to a running Chrome: your own, or one started with --remote-debugging-port. */
async function attach(url: string): Promise<Browser> {
  let ws = url;
  if (/^https?:/.test(url)) {
    const info = await fetch(new URL('/json/version', url)).then((r) => r.json()).catch(() => fail(`No Chrome DevTools endpoint at ${url}.`));
    ws = info.webSocketDebuggerUrl;
  }
  const sock = new WebSocket(ws);
  // Your own Chrome holds the connection until you answer its prompt.
  const hint = setTimeout(() => console.log('Chrome is asking "Allow remote debugging?". Click Allow to continue.'), 1500);
  await new Promise((resolve, reject) => {
    sock.onopen = resolve;
    sock.onerror = () => reject(new Error(`Couldn't connect to Chrome at ${ws}. Check that it's open and that you clicked Allow.`));
  }).finally(() => clearTimeout(hint));
  const cdp = new Cdp((m) => sock.send(m));
  sock.onmessage = (e) => cdp.receive(String(e.data));
  sock.onclose = () => cdp.close('Chrome closed the DevTools connection');
  const { product } = await cdp.send('Browser.getVersion');
  return { cdp, version: product, extensionId: unpackedId(DIST), close: async () => sock.close() };
}

/** Chrome derives an unpacked extension's id from its absolute path. */
function unpackedId(path: string): string {
  const hex = createHash('sha256').update(realpathSync(path)).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

// ---------------------------------------------------------------------------
// The extension's service worker

const BINDING = '__gauntletEmit';

class Extension {
  /** Receives the agent's log events for the task in progress. */
  onEvent: (e: LogEvent) => void = () => {};
  alive = true;

  private cdp: Cdp;
  private targetId: string;
  private sessionId: string;

  private constructor(cdp: Cdp, targetId: string, sessionId: string) {
    this.cdp = cdp;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  static async attach(b: Browser): Promise<Extension> {
    const { cdp } = b;
    const workers = async () => (await cdp.send('Target.getTargets')).targetInfos
      .filter((t: any) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
    const ours = async () => (await workers()).find((t: any) => t.url.startsWith(`chrome-extension://${b.extensionId}/`));
    let target = await poll(ours, 3000);
    if (!target) {
      // Loaded from another folder: look for any running worker that is FastPilot's.
      for (const t of await workers()) {
        const w = await Extension.connect(cdp, t.targetId);
        if (await w.call(function () { return chrome.runtime.getManifest().name; }) === 'FastPilot') return w.ready();
        await cdp.send('Target.detachFromTarget', { sessionId: w.sessionId }).catch(() => {});
      }
    }
    if (!target) {
      // Not running in this Chrome: load dist/ the way "Load unpacked" would (a no-op reload if it's only asleep).
      const loaded = await cdp.send('Extensions.loadUnpacked', { path: DIST }).then(() => true, () => false);
      if (loaded) target = await poll(ours, 5000);
    }
    if (!target) {
      // Asleep (idle, or just reloaded): opening one of its pages wakes it.
      const { targetId } = await cdp.send('Target.createTarget', { url: `chrome-extension://${b.extensionId}/src/sidepanel/index.html`, background: true });
      target = await poll(ours, 5000);
      await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    }
    if (!target) {
      throw new Error(`FastPilot isn't loaded in that Chrome. Load ${DIST} with "Load unpacked" on chrome://extensions, then try again.`);
    }
    return (await Extension.connect(cdp, target.targetId)).ready();
  }

  private static async connect(cdp: Cdp, targetId: string): Promise<Extension> {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const w = new Extension(cdp, targetId, sessionId);
    cdp.on((method, params, sid) => {
      if (method === 'Runtime.bindingCalled' && sid === sessionId && params.name === BINDING) w.onEvent(JSON.parse(params.payload));
      if (method === 'Target.detachedFromTarget' && params.sessionId === sessionId) w.alive = false;
    });
    return w;
  }

  private async ready(): Promise<Extension> {
    await this.cdp.send('Runtime.enable', {}, this.sessionId);
    await this.cdp.send('Runtime.addBinding', { name: BINDING }, this.sessionId);
    // The worker's target shows up before its modules have finished loading.
    const hooked = await poll(() => this.call(function (this: any) { return typeof this.fastpilotTest?.run === 'function'; }), 5000);
    if (!hooked) throw new Error('This FastPilot build has no test hook. Run `npm run build` and reload the extension.');
    return this;
  }

  /** Stops the worker, which ends any task stuck in it, and attaches to a fresh one. */
  async restart(b: Browser): Promise<Extension> {
    // The worker comes back under the same target, so detach first or this session would get its events too.
    this.onEvent = () => {};
    await this.cdp.send('Target.detachFromTarget', { sessionId: this.sessionId }).catch(() => {});
    this.alive = false;
    await this.cdp.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
    await poll(async () => {
      const { targetInfos } = await this.cdp.send('Target.getTargets');
      return !targetInfos.some((t: any) => t.targetId === this.targetId) || undefined;
    }, 5000);
    return Extension.attach(b);
  }

  /** Reloads the extension from its folder, so a Chrome that loaded dist/ before the last build runs the current code. */
  async reload(b: Browser): Promise<Extension> {
    this.onEvent = () => {};
    // Deferred so the call returns before the worker goes away.
    await this.call(function () { setTimeout(() => chrome.runtime.reload(), 50); });
    await poll(async () => !this.alive || undefined, 5000);
    return Extension.attach(b);
  }

  /** Calls a self-contained function in the worker, with `this` bound to its global object. */
  async call<T = any>(fn: (this: any, ...args: any[]) => any, ...args: unknown[]): Promise<T> {
    const { result: global } = await this.cdp.send('Runtime.evaluate', { expression: 'globalThis' }, this.sessionId);
    const r = await this.cdp.send('Runtime.callFunctionOn', {
      objectId: global.objectId, functionDeclaration: fn.toString(), arguments: args.map((value) => ({ value })),
      awaitPromise: true, returnByValue: true,
    }, this.sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text);
    return r.result.value as T;
  }
}

// These run inside the service worker, so each must be self-contained.

/** Opens a tab (or navigates one) and waits for it to load. */
async function swOpen(tabId: number | null, url: string, maxMs: number) {
  const tab = tabId === null ? await chrome.tabs.create({ url, active: true }) : await chrome.tabs.update(tabId, { url, active: true });
  const id = tab!.id!;
  const end = Date.now() + maxMs;
  for (;;) {
    await new Promise((r) => setTimeout(r, 50));
    const t = await chrome.tabs.get(id);
    if ((t.status === 'complete' && !t.pendingUrl && t.url && t.url !== 'about:blank') || Date.now() > end) return { tabId: id, url: t.url ?? '' };
  }
}

async function swTabIds() {
  return (await chrome.tabs.query({})).map((t) => t.id!);
}

/** Closes tabs opened since `before`: all of them, or only those on the given origins. */
async function swCloseTabs(before: number[], tabId: number, origins: string[] | null) {
  const extra = (await chrome.tabs.query({})).filter((t) => !before.includes(t.id!) && (t.id === tabId || !origins
    || !t.url || t.url === 'about:blank' || origins.some((o) => t.url!.startsWith(o))));
  if (extra.length) await chrome.tabs.remove(extra.map((t) => t.id!));
}

/** The settings a run will use, without the key. */
async function swSettings(defaults: Settings, override: Partial<Settings>) {
  const stored = (await chrome.storage.local.get('settings')).settings as Partial<Settings> | undefined;
  const s = { ...defaults, ...stored, ...override };
  return { baseUrl: s.baseUrl, model: s.model, speed: s.speed, maxSteps: s.maxSteps, replay: s.replay, jev: s.jev, jevModel: s.jevModel, hasKey: !!s.apiKey };
}

function swRun(this: any, task: string, tabId: number, settings: Partial<Settings>) {
  return this.fastpilotTest.run(task, (e: unknown) => this.__gauntletEmit(JSON.stringify(e)), { tabId, settings });
}

function swStop(this: any) {
  this.fastpilotTest.stop();
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

interface Ctx { b: Browser; w: Extension; base: string; settings: Partial<Settings>; redact: (s: string) => string }

async function runOne(ctx: Ctx, c: ApiChallenge, onLog: (e: LogEvent) => void): Promise<RunResult> {
  const { b, base } = ctx;
  if (!opt['keep-state']) {
    await api(base, '/api/reset-site', {});
    // A person running the catalog would have answered the cookie banner once; without this it covers
    // every store page and each answer counts as an attempt at site/cookie-consent.
    await b.cdp.send('Storage.setCookies', {
      cookies: [{ name: 'consent', value: 'necessary', url: `${base}/`, sameSite: 'Lax', expires: Date.now() / 1000 + 86400 * 365 }],
    });
  }
  // Hides the challenge strip's pass/fail status, result line and expected outcome (see page() in
  // lib/layout.ts). Otherwise the agent can read "✓ Challenge passed" off the page and stop there.
  await b.cdp.send('Storage.setCookies', { cookies: [{ name: AGENT_COOKIE, value: '1', url: `${base}/`, sameSite: 'Lax' }] });
  if (opt.reset) await api(base, '/api/results/reset', { id: c.id });
  const seen = (await challengesFrom(base)).find((x) => x.id === c.id)!.result.attempts.length;

  const before = await ctx.w.call<number[]>(swTabIds);
  const start = `${base}/challenges/start/${c.id}`;
  // Tasks that say "Sign in as demo first" expect the person running them to have done it.
  const signedIn = /sign in as demo/i.test(c.task);
  let { tabId } = await ctx.w.call(swOpen, null, signedIn ? `${base}/challenges/demo-signin` : start, LOAD_MS);
  if (signedIn) await ctx.w.call(swOpen, tabId, start, LOAD_MS);

  const log: LogEvent[] = [];
  ctx.w.onEvent = (e) => {
    if (e.kind === 'idle') return;
    const ev = { ...e, text: ctx.redact(e.text).slice(0, 2000) };
    log.push(ev);
    onLog(ev);
  };
  const t0 = performance.now();
  let restarted = false;
  const run = ctx.w.call(swRun, c.task, tabId, ctx.settings).then(() => {}, (e: Error) => {
    if (!restarted) log.push({ kind: 'error', text: ctx.redact(`runner: ${e.message}`) });
  });
  const timedOut = await Promise.race([run.then(() => false), sleep(Number(opt.timeout) * 1000).then(() => true)]);
  const ms = Math.round(performance.now() - t0);
  if (timedOut) {
    await ctx.w.call(swStop).catch(() => {});
    const stopped = await Promise.race([run.then(() => true), sleep(10_000).then(() => false)]);
    // A tool that ignores Stop keeps the task, and so every later one, busy. Restarting the worker ends it.
    if (!stopped) {
      restarted = true;
      ctx.w = await ctx.w.restart(b);
    }
  }
  ctx.w.onEvent = () => {};

  // Page scripts report a moment after the last action; give them time.
  let attempts: Attempt[] = [];
  const until = Date.now() + REPORT_MAX_MS;
  await sleep(REPORT_GRACE_MS);
  for (;;) {
    attempts = (await challengesFrom(base)).find((x) => x.id === c.id)!.result.attempts.slice(seen);
    if (attempts.length || Date.now() > until) break;
    await sleep(300);
  }
  await ctx.w.call(swCloseTabs, before, tabId, [base, 'http://127.0.0.1:']).catch(() => {});

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

  const b = await attach(opt.cdp ?? ownChrome());
  let ctx: Ctx | undefined;
  let stopping = false;
  const onSigint = () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log(styleText('yellow', '\nStopping after this challenge (Ctrl-C again to quit now)…'));
    ctx?.w.call(swStop).catch(() => {});
  };
  process.on('SIGINT', onSigint);

  const results: RunResult[] = [];
  const startedAt = new Date();
  let effective: Awaited<ReturnType<typeof swSettings>> | undefined;
  try {
    ctx = { b, w: await Extension.attach(b), base, settings, redact };
    ctx.w = await ctx.w.reload(b);
    effective = await ctx.w.call<Awaited<ReturnType<typeof swSettings>>>(swSettings, DEFAULT_SETTINGS, settings);
    // No key saved in the extension: fall back to the provider's own variable.
    const keyVar = !effective.hasKey && KEY_ENV.find(([re]) => re.test(effective!.baseUrl))?.[1];
    if (keyVar && process.env[keyVar]) {
      settings.apiKey = process.env[keyVar];
      effective = await ctx.w.call<Awaited<ReturnType<typeof swSettings>>>(swSettings, DEFAULT_SETTINGS, settings);
    }
    if (!effective.model) throw new Error('No model set. Set FASTPILOT_MODEL.');
    if (!effective.hasKey && needsApiKey(effective.baseUrl)) {
      throw new Error('No API key. Set FASTPILOT_API_KEY (or the provider\'s own key variable, see --help).');
    }
    console.log(`${b.version} · FastPilot ${b.extensionId}${opt.cdp ? ' · attached' : ' · your Chrome'}`);
    console.log(`Model ${effective.model} via ${effective.baseUrl} · speed ${effective.speed} · up to ${effective.maxSteps} steps · ${opt.timeout}s timeout${effective.jev !== 'off' ? ` · Jev ${effective.jev} (${effective.jevModel})` : ''}`);
    console.log(`Running ${picked.length} challenge${picked.length === 1 ? '' : 's'} against ${base}\n`);

    const pad = String(picked.length).length;
    for (const [i, c] of picked.entries()) {
      if (stopping) break;
      if (!ctx.w.alive) ctx.w = await Extension.attach(b);
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
    // This is someone's own browser: show them the challenge status again.
    await b.cdp.send('Storage.setCookies', { cookies: [{ name: AGENT_COOKIE, value: '', url: `${base}/`, expires: 1 }] }).catch(() => {});
    await b.close();
  }

  if (!results.length) return;
  const summary = summarize(results);
  printSummary(summary, results);
  const out = opt.out ?? join(ROOT, 'testbed/.data/runs', `${startedAt.toISOString().replace(/[:.]/g, '-')}.json`);
  mkdirSync(dirname(out), { recursive: true });
  const { hasKey: _k, ...model } = effective!;
  writeFileSync(out, `${JSON.stringify({
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), base, chrome: b.version, extensionId: b.extensionId,
    settings: model, timeoutSec: Number(opt.timeout), filters: { area: list(opt.area), only: opt.only, check: list(opt.check), id: list(opt.id), level: list(opt.level), limit: opt.limit },
    summary, results,
  }, null, 1)}\n`);
  const shown = relative(process.cwd(), out);
  console.log(`\nReport: ${shown.startsWith('..') ? out : shown}`);
}

main().catch((e) => fail(String(e?.message ?? e)));
