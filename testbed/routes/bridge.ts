// The bridge between the Gauntlet runner and FastPilot (see src/shared/bridge.ts). Everything is in
// memory: the queue, each job's log, and what FastPilot last reported about itself.

import { BRIDGE_HEADER, type BridgeHello, type BridgeJob } from '../../src/shared/bridge.ts';
import type { LogEvent } from '../../src/shared/types.ts';
import { get, json, post, setCookie, type Req } from '../lib/http.ts';

/** FastPilot polls about twice a second while awake and wakes at least every 30 s. */
const CONNECTED_MS = 40_000;
/** How long after the runner's last call FastPilot keeps polling instead of going back to sleep. */
const RUNNER_ACTIVE_MS = 60_000;

let hello: BridgeHello | null = null;
let seenAt = 0;
let runnerAt = 0;
let seq = 0;
const queue: BridgeJob[] = [];
const jobs = new Map<string, { events: LogEvent[]; done: boolean; stop: boolean }>();

/** Bridge calls must come from the runner or FastPilot, never from a web page. */
function allowed(req: Req): boolean {
  if (req.raw.headers[BRIDGE_HEADER.toLowerCase()] === '1' && req.json && typeof req.json === 'object') return true;
  json(req, { error: 'bridge calls need JSON and the bridge header' }, 403);
  return false;
}

// FastPilot: report in, and collect the next job or a stop request for the running one.
post('/api/bridge/poll', (req) => {
  if (!allowed(req)) return;
  seenAt = Date.now();
  hello = req.json.hello ?? hello;
  const running = req.json.running && jobs.get(req.json.running);
  json(req, { job: queue.shift() ?? null, stop: !!running?.stop, runnerActive: Date.now() - runnerAt < RUNNER_ACTIVE_MS });
});

// FastPilot: log events for a job, and whether it has finished.
post('/api/bridge/event', (req) => {
  if (!allowed(req)) return;
  const j = jobs.get(req.json.job);
  if (!j) return json(req, { error: 'unknown job' }, 404);
  if (Array.isArray(req.json.events)) j.events.push(...req.json.events);
  if (req.json.done) j.done = true;
  json(req, { ok: true });
});

// Runner: queue a job.
post('/api/bridge/enqueue', (req) => {
  if (!allowed(req)) return;
  runnerAt = Date.now();
  const id = `job-${++seq}`;
  queue.push({ ...req.json.job, id });
  jobs.set(id, { events: [], done: false, stop: false });
  json(req, { id });
});

// Runner: a job's events from index `after` on.
post('/api/bridge/events', (req) => {
  if (!allowed(req)) return;
  runnerAt = Date.now();
  const j = jobs.get(req.json.job);
  if (!j) return json(req, { error: 'unknown job' }, 404);
  json(req, { events: j.events.slice(Number(req.json.after) || 0), done: j.done });
});

// Runner: ask FastPilot to stop a job.
post('/api/bridge/stop', (req) => {
  if (!allowed(req)) return;
  runnerAt = Date.now();
  const j = jobs.get(req.json.job);
  if (j) j.stop = true;
  json(req, { ok: true });
});

// Runner: whether FastPilot is polling, and its settings.
post('/api/bridge/status', (req) => {
  if (!allowed(req)) return;
  runnerAt = Date.now();
  json(req, { connected: Date.now() - seenAt < CONNECTED_MS, seenAt, hello });
});

// Ends an agent run in this browser: shows the challenge status, result and expected outcome again.
get('/challenges/agent-off', (req) => {
  setCookie(req, 'gauntlet_agent', '', 'Path=/; Max-Age=0');
  return 'Agent run ended.';
});
