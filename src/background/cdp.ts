// Thin wrapper over chrome.debugger for one tab. Input sent through CDP produces
// trusted (isTrusted) events, which custom widgets handle like real user input.

import { sleep } from './humanize';

// Long-lived or background requests that should not block "network idle".
const IGNORED_TYPES = new Set(['WebSocket', 'EventSource', 'Ping', 'Media']);
// A request in flight longer than this is treated as a long-poll and ignored.
const STALE_MS = 3000;

export class TabDebugger {
  mouse = { x: 0, y: 0 };
  onDetached?: (reason: string) => void;
  private inflight = new Map<string, number>();
  private attached = false;

  constructor(readonly tabId: number) {}

  async attach(): Promise<void> {
    if (this.attached) return;
    await chrome.debugger.attach({ tabId: this.tabId }, '1.3');
    this.attached = true;
    chrome.debugger.onEvent.addListener(this.handleEvent);
    chrome.debugger.onDetach.addListener(this.handleDetach);
    await this.send('Network.enable');
    const vp = await this.viewport();
    this.mouse = { x: vp.width / 2, y: vp.height / 2 };
  }

  async detach(): Promise<void> {
    chrome.debugger.onEvent.removeListener(this.handleEvent);
    chrome.debugger.onDetach.removeListener(this.handleDetach);
    if (!this.attached) return;
    this.attached = false;
    await chrome.debugger.detach({ tabId: this.tabId }).catch(() => {});
  }

  send<T = any>(method: string, params: object = {}): Promise<T> {
    return chrome.debugger.sendCommand({ tabId: this.tabId }, method, params) as Promise<T>;
  }

  async viewport(): Promise<{ width: number; height: number }> {
    const { result } = await this.send('Runtime.evaluate', {
      expression: '({ width: innerWidth, height: innerHeight })',
      returnByValue: true,
    });
    return result.value;
  }

  /** Resolves once no counted request has been in flight for `quietMs`, or after `maxMs`. */
  async networkIdle(quietMs: number, maxMs: number): Promise<void> {
    const start = performance.now();
    let quietSince = performance.now();
    while (performance.now() - start < maxMs) {
      const now = performance.now();
      let busy = false;
      for (const t of this.inflight.values()) if (now - t < STALE_MS) busy = true;
      if (busy) quietSince = now;
      else if (now - quietSince >= quietMs) return;
      await sleep(20);
    }
  }

  private handleEvent = (src: chrome.debugger.Debuggee, method: string, params?: any) => {
    if (src.tabId !== this.tabId || !params) return;
    if (method === 'Network.requestWillBeSent') {
      if (!IGNORED_TYPES.has(params.type)) this.inflight.set(params.requestId, performance.now());
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      this.inflight.delete(params.requestId);
    }
  };

  private handleDetach = (src: chrome.debugger.Debuggee, reason: string) => {
    if (src.tabId !== this.tabId) return;
    this.attached = false;
    this.onDetached?.(reason);
  };
}
