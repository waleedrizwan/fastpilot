// Helpers for running the injected page functions and waiting for the page to settle.

import type { Speed } from '../shared/types';
import type { TabDebugger } from './cdp';
import { sleep } from './humanize';
import { snapshotPage } from '../content/snapshot';
import { domQuiet } from '../content/settle';

const RESTRICTED = /^(chrome|edge|about|devtools|chrome-extension|view-source):|^https:\/\/chromewebstore\.google\.com/;
const SNAPSHOT_MAX_ITEMS = 300;
const QUIET_MS: Record<Speed, number> = { instant: 60, fast: 100, natural: 200 };
const SETTLE_MAX_MS = 2500;
/** How long an injected call may take on top of its own waiting before it counts as lost. */
const INJECT_MAX_MS = 5000;

export async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  if (tab.url && RESTRICTED.test(tab.url)) throw new Error(`Chrome doesn't let extensions control ${tab.url}. Open a normal web page first.`);
  return tab;
}

export async function waitTabComplete(tabId: number, maxMs: number): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < maxMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await sleep(50);
  }
}

/**
 * Runs a self-contained function in the tab, retrying across navigations. `waitMs` is how long the
 * function itself may wait. Each try is cut off after that plus INJECT_MAX_MS: Chrome may never answer
 * a call whose document is replaced mid-call (a page frozen in the back/forward cache doesn't), and
 * the retry then reaches the new page.
 */
export async function inPage<A extends any[], R>(
  tabId: number, func: (...args: A) => R, args: A, { retries = 3, waitMs = 0 } = {},
): Promise<Awaited<R>> {
  for (let i = 0; ; i++) {
    try {
      const run = chrome.scripting.executeScript({ target: { tabId }, func, args } as any);
      const [res] = await withTimeout(run, waitMs + INJECT_MAX_MS);
      return (res as { result: Awaited<R> }).result;
    } catch (e) {
      if (i >= retries) throw e;
      await waitTabComplete(tabId, 5000);
      await sleep(100);
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`the page did not answer within ${ms}ms`)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

export function snapshot(tabId: number) {
  return inPage(tabId, snapshotPage, [SNAPSHOT_MAX_ITEMS]);
}

/** Waits for loading, network and DOM to go quiet. Returns elapsed ms. */
export async function settle(dbg: TabDebugger, speed: Speed): Promise<number> {
  const t0 = performance.now();
  const quiet = QUIET_MS[speed];
  await waitTabComplete(dbg.tabId, 10_000);
  await Promise.all([
    dbg.networkIdle(quiet, SETTLE_MAX_MS),
    inPage(dbg.tabId, domQuiet, [quiet, SETTLE_MAX_MS], { waitMs: SETTLE_MAX_MS }).catch(() => {}),
  ]);
  return Math.round(performance.now() - t0);
}
