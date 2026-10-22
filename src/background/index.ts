import { loadSettings, type LogEvent, type PanelMsg, type Settings } from '../shared/types';
import { Agent } from './agent';
import { activeTab, snapshot } from './page';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

let current: Agent | null = null;

/** Runs one task. `opts` is only used by the test hook below: a fixed tab, and settings for this run only. */
async function runTask(task: string, emit: (e: LogEvent) => void, opts: { tabId?: number; settings?: Partial<Settings> } = {}) {
  if (current) return emit({ kind: 'error', text: 'A task is already running.' });
  const agent = new Agent({ ...(await loadSettings()), ...opts.settings }, emit);
  current = agent;
  try {
    await agent.run(task, opts.tabId);
  } catch (e: any) {
    emit({ kind: 'error', text: e?.name === 'AbortError' ? 'Stopped' : String(e?.message ?? e) });
  } finally {
    current = null;
    emit({ kind: 'idle', text: '' });
  }
}

// Test hook for the Gauntlet runner (testbed/runner.ts), which calls it over the DevTools protocol.
// Only a debugger attached to this worker can reach it. Settings passed in are never saved.
(globalThis as any).fastpilotTest = { run: runTask, stop: () => current?.stop() };

// The side panel holds a port open; its traffic also keeps this worker alive during a task.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'panel') return;
  const emit = (e: LogEvent) => {
    try { port.postMessage(e); } catch { /* panel closed */ }
  };

  port.onMessage.addListener(async (msg: PanelMsg) => {
    if (msg.type === 'stop') {
      current?.stop();
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
