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
  run(task: string, emit: (e: LogEvent) => void, opts: { tabId: number; settings: Partial<Settings> }): Promise<void>;
  stop(): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** When this copy of the service worker started. */
const STARTED = Date.now();
let polling = false;
/** Set once a reload is under way, so this copy takes no more jobs. */
let reloading = false;
let running: string | null = null;
/** For each finished run job, the tabs that existed before it and its own tab, until its close job. */
const opened = new Map<string, { before: number[]; tabId: number | null; confine: string[] }>();

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
      const r = await post<{ job: BridgeJob | null; stop: boolean; runnerActive: boolean }>('/api/bridge/poll', { hello: await hello(), running });
      if (r.runnerActive || r.job || running) activeAt = Date.now();
      if (r.stop && running) host.stop();
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
    await post('/api/bridge/event', { job: job.id, done: true }).catch(() => {});
    chrome.runtime.reload();
    return;
  }
  if (job.kind === 'close') {
    const o = opened.get(job.run);
    opened.delete(job.run);
    if (o) {
      // Only the tabs that run opened on the test site, plus its own tab.
      const extra = (await chrome.tabs.query({})).filter((t) => !o.before.includes(t.id!) && (t.id === o.tabId
        || !t.url || t.url === 'about:blank' || o.confine.some((origin) => t.url!.startsWith(origin))));
      if (extra.length) await chrome.tabs.remove(extra.map((t) => t.id!)).catch(() => {});
    }
    await post('/api/bridge/event', { job: job.id, done: true }).catch(() => {});
    return;
  }
  if (job.kind === 'visit') {
    const tabId = await openInAgentWindow(job.url);
    await chrome.tabs.remove(tabId).catch(() => {});
    await post('/api/bridge/event', { job: job.id, done: true }).catch(() => {});
    return;
  }

  running = job.id;
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
  const before = (await chrome.tabs.query({})).map((t) => t.id!);
  let tabId: number | null = null;
  try {
    for (const url of job.urls) tabId = await openInAgentWindow(url, tabId);
    await host.run(job.task, emit, { tabId: tabId!, settings: { ...job.settings, confine: job.confine } });
  } catch (e: any) {
    emit({ kind: 'error', text: `bridge: ${e?.message ?? e}` });
  } finally {
    opened.set(job.id, { before, tabId, confine: job.confine });
    running = null;
    await flush(true);
  }
}
