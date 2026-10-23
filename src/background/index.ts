import { loadSettings, type LogEvent, type PanelMsg, type Settings } from '../shared/types';
import { Agent } from './agent';
import { activeTab, snapshot } from './page';
import { BRIDGE_ALARM, isDevBuild, pollBridge, type BridgeHost } from './bridge';
import { isAgentWindow, openInAgentWindow } from './window';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

/** The task started from the side panel. Only one at a time. */
let current: Agent | null = null;
/** Every running task, including Gauntlet runs, which may run several at once in their own tabs. */
const active = new Set<Agent>();

/**
 * Runs one task. `opts` is only used by the Gauntlet bridge below: a fixed tab, settings for this run
 * only, and a signal that stops this run alone.
 */
async function runTask(task: string, emit: (e: LogEvent) => void, opts: { tabId?: number; settings?: Partial<Settings>; signal?: AbortSignal } = {}) {
  const bridged = opts.tabId !== undefined;
  if (current || (!bridged && active.size)) return emit({ kind: 'error', text: 'A task is already running.' });
  const settings = { ...(await loadSettings()), ...opts.settings };
  const agent = new Agent(settings, emit);
  if (!bridged) current = agent;
  active.add(agent);
  opts.signal?.addEventListener('abort', () => agent.stop());
  try {
    let tabId = opts.tabId;
    if (tabId === undefined && settings.ownWindow) {
      // Run in FastPilot's own window, starting from the page you're on, so your window stays yours.
      // A task started from inside that window carries on there.
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = tab?.id !== undefined && (await isAgentWindow(tab.windowId)) ? tab.id : await openInAgentWindow(tab?.url ?? 'about:blank');
    }
    await agent.run(task, tabId);
  } catch (e: any) {
    emit({ kind: 'error', text: e?.name === 'AbortError' ? 'Stopped' : String(e?.message ?? e) });
  } finally {
    if (current === agent) current = null;
    active.delete(agent);
    emit({ kind: 'idle', text: '' });
  }
}

// Gauntlet bridge for the test runner (testbed/runner.ts): development builds poll the local Gauntlet
// server for tasks, so tests run in this Chrome without its debugging port. Settings passed in are never saved.
const bridge: BridgeHost = { run: runTask };
isDevBuild().then((dev) => {
  if (!dev) return;
  chrome.alarms.create(BRIDGE_ALARM, { periodInMinutes: 0.5 });
  void pollBridge(bridge);
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === BRIDGE_ALARM) void pollBridge(bridge);
});

// The side panel holds a port open; its traffic also keeps this worker alive during a task.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'panel') return;
  const emit = (e: LogEvent) => {
    try { port.postMessage(e); } catch { /* panel closed */ }
  };

  port.onMessage.addListener(async (msg: PanelMsg) => {
    if (msg.type === 'stop') {
      for (const a of active) a.stop();
    } else if (msg.type === 'run') {
      await runTask(msg.task, emit);
    } else if (msg.type === 'snapshot') {
      try {
        const tab = await activeTab();
        const t0 = performance.now();
        const snap = await snapshot(tab.id!);
        emit({ kind: 'snapshot', text: snap.text, ms: Math.round(performance.now() - t0) });
      } catch (e: any) {
        emit({ kind: 'error', text: String(e?.message ?? e) });
      }
    }
  });

  port.onDisconnect.addListener(() => current?.stop());
});
