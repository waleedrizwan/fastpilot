// FastPilot's side of the Gauntlet bridge (src/shared/bridge.ts). A development build (loaded unpacked)
// polls the local Gauntlet server for jobs, runs them in your Chrome, and posts the log back, so the
// test runner never needs Chrome's debugging port. Published builds never contact the server.

import { BRIDGE_BASE, BRIDGE_HEADER, type BridgeHello, type BridgeJob } from '../shared/bridge';
import { loadSettings, type LogEvent, type Settings } from '../shared/types';
import { openInAgentWindow } from './window';

/** Stop polling this long after the runner was last active; the next alarm wakes it again. */
const IDLE_MS = 60_000;
const POLL_MS = 400;
export const BRIDGE_ALARM = 'gauntlet-bridge';

export interface BridgeHost {
  run(task: string, emit: (e: LogEvent) => void, opts: { tabId: number; settings: Partial<Settings>; signal: AbortSignal }): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** When this copy of the service worker started. */
const STARTED = Date.now();
let polling = false;
/** Set once a reload is under way, so this copy takes no more jobs. */
let reloading = false;
/** Run jobs in progress (the runner may run several at once), each with its Stop. */
const running = new Map<string, AbortController>();
type Opened = { before: number[]; tabId: number | null; confine: string[] };
/** For each run job, the tabs that existed before it and its own tab, until its close job. */
const opened = new Map<string, Opened>();

async function post<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BRIDGE_BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', [BRIDGE_HEADER]: '1' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

export async function isDevBuild(): Promise<boolean> {
  return (await chrome.management.getSelf()).installType === 'development';
}

async function hello(): Promise<BridgeHello> {
  const s = await loadSettings();
  return {
    version: chrome.runtime.getManifest().version,
    build: __BUILD_ID__,
    started: STARTED,
    settings: { baseUrl: s.baseUrl, model: s.model, speed: s.speed, maxSteps: s.maxSteps, replay: s.replay, jev: s.jev, jevModel: s.jevModel },
    hasKey: !!s.apiKey,
  };
}

/** Polls for jobs until the runner has been quiet for a while. Safe to call often: one loop at a time. */
export async function pollBridge(host: BridgeHost): Promise<void> {
  if (polling || reloading || !(await isDevBuild())) return;
  polling = true;
  let activeAt = Date.now();
  try {
    while (!reloading && Date.now() - activeAt < IDLE_MS) {
      // An extension API call each round keeps the service worker awake while it polls.
      await chrome.runtime.getPlatformInfo();
      const r = await post<{ job: BridgeJob | null; stop: string[]; runnerActive: boolean }>('/api/bridge/poll', { hello: await hello(), running: [...running.keys()] });
      if (r.runnerActive || r.job || running.size) activeAt = Date.now();
      for (const id of r.stop) running.get(id)?.abort();
      if (r.job) void handle(host, r.job);
      await sleep(POLL_MS);
    }
  } catch {
    // Gauntlet isn't running. The alarm tries again.
  } finally {
    polling = false;
  }
}

async function handle(host: BridgeHost, job: BridgeJob): Promise<void> {
  if (job.kind === 'reload') {
    reloading = true;
    // The reload forgets which tabs runs opened, so close them now: a run that timed out would
    // otherwise leave its page running in the background for the rest of the test run.
    for (const o of opened.values()) await closeTabs(o);
    opened.clear();
    // Runs in progress end with the reload; say so, so the runner isn't left waiting for them.
    await Promise.all([...running.keys()].map((id) =>
      post('/api/bridge/event', { job: id, events: [{ kind: 'error', text: 'bridge: FastPilot was reloaded' }], done: true }).catch(() => {})));
    await post('/api/bridge/event', { job: job.id, done: true }).catch(() => {});
    chrome.runtime.reload();
    return;
  }
  if (job.kind === 'close') {
    const o = opened.get(job.run);
    opened.delete(job.run);
    if (o) await closeTabs(o);
    await post('/api/bridge/event', { job: job.id, done: true }).catch(() => {});
    return;
  }
  if (job.kind === 'visit') {
    const tabId = await openInAgentWindow(job.url, null, job.hidden);
    await chrome.tabs.remove(tabId).catch(() => {});
    await post('/api/bridge/event', { job: job.id, done: true }).catch(() => {});
    return;
  }

  const stop = new AbortController();
  running.set(job.id, stop);
  // Events go out in order, batched while a post is in flight.
  let pending: LogEvent[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  const flush = (done = false) => {
    const events = pending;
    pending = [];
    chain = chain.then(() => post('/api/bridge/event', { job: job.id, events, done })).catch(() => {});
    return chain;
  };
  const emit = (e: LogEvent) => {
    // Live step updates are for watching, not the report.
    if (e.kind === 'live') return;
    pending.push(e);
    void flush();
  };
  // Recorded before the run starts, so a reload during the run can still close its tabs.
  const o: Opened = { before: (await chrome.tabs.query({})).map((t) => t.id!), tabId: null, confine: job.confine };
  opened.set(job.id, o);
  try {
    for (const url of job.urls) o.tabId = await openInAgentWindow(url, o.tabId, job.hidden);
    await host.run(job.task, emit, { tabId: o.tabId!, settings: { ...job.settings, confine: job.confine }, signal: stop.signal });
  } catch (e: any) {
    emit({ kind: 'error', text: `bridge: ${e?.message ?? e}` });
  } finally {
    running.delete(job.id);
    await flush(true);
  }
}

/**
 * Closes the tabs a run opened on the test site, plus its own tab. Tabs of other runs still in
 * progress, and the tabs they opened, are left alone.
 */
async function closeTabs(o: Opened): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const others = new Set([...opened.values()].filter((x) => x !== o && x.tabId !== null).map((x) => x.tabId!));
  for (let grew = true; grew;) {
    grew = false;
    for (const t of tabs) if (t.openerTabId !== undefined && others.has(t.openerTabId) && !others.has(t.id!)) { others.add(t.id!); grew = true; }
  }
  const extra = tabs.filter((t) => !o.before.includes(t.id!) && !others.has(t.id!) && (t.id === o.tabId
    || !t.url || t.url === 'about:blank' || o.confine.some((origin) => t.url!.startsWith(origin))));
  if (extra.length) await chrome.tabs.remove(extra.map((t) => t.id!)).catch(() => {});
}
