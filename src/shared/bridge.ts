// The Gauntlet bridge: how the test runner hands work to FastPilot without touching Chrome's
// debugging port. The runner queues jobs on the local Gauntlet server; a development build of
// FastPilot polls that server, runs each job in your Chrome, and posts its log back.

import type { Settings } from './types';

/** Where the Gauntlet server listens. Only development builds of FastPilot ever contact it. */
export const BRIDGE_BASE = 'http://localhost:5175';
/** Required on every bridge POST. A custom header makes browsers send a CORS preflight, which the server never approves, so web pages can't queue work. */
export const BRIDGE_HEADER = 'X-Gauntlet-Bridge';

export type BridgeJob =
  /** Opens `urls` in turn in one new tab and runs `task` there. */
  | { id: string; kind: 'run'; task: string; urls: string[]; settings: Partial<Settings>; confine: string[] }
  /** Closes the tabs run job `run` opened on its `confine` origins, once the page has reported its result. */
  | { id: string; kind: 'close'; run: string }
  /** Opens `url` in a background tab and closes it once loaded, for its cookies. */
  | { id: string; kind: 'visit'; url: string }
  /** Reloads FastPilot from its folder, so it runs the latest build. */
  | { id: string; kind: 'reload' };

/** What FastPilot reports on every poll. The API key itself is never sent. */
export interface BridgeHello {
  version: string;
  /** When the running build was made, so the runner can tell a stale one. */
  build: string;
  /** When this copy of FastPilot started (ms since epoch). After a reload, the runner waits for a newer one. */
  started: number;
  settings: Pick<Settings, 'baseUrl' | 'model' | 'speed' | 'maxSteps' | 'replay' | 'jev' | 'jevModel'>;
  hasKey: boolean;
}
