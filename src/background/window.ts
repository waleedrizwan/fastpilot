// FastPilot's own window. Tasks run there, in your same Chrome profile and sign-ins, while you keep
// using your own windows: its mouse and keyboard go to its tab only, never to your pointer or keystrokes.
// It opens on the computer's built-in screen (the MacBook's own display), so it stays visible beside
// whatever you're doing on an external monitor, and it hands focus back to the window you were in.

const KEY = 'agentWindowId';
const LOAD_MS = 10_000;
/** Pages a task can start from. Anything else (chrome://, the Web Store) starts on a blank tab. */
const OPENABLE = /^(https?|file):/;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The window's size. A window filling a Retina screen makes Chrome paint several times the pixels on
 * every frame, which is most of the GPU and memory a long test run uses; this is a common laptop viewport.
 */
const SIZE = { width: 1280, height: 800 };

/** Where FastPilot's window goes: the top left of the built-in screen, or of the main screen if there's no built-in one. */
async function placement(): Promise<{ left: number; top: number; width: number; height: number } | undefined> {
  const displays = await chrome.system.display.getInfo().catch(() => []);
  const d = displays.find((x) => x.isInternal) ?? displays.find((x) => x.isPrimary);
  if (!d) return undefined;
  const { left, top, width, height } = d.workArea;
  return { left, top, width: Math.min(width, SIZE.width), height: Math.min(height, SIZE.height) };
}

/** The window you're in now, so focus can go back to it after FastPilot's window comes up. */
async function yourWindow(agentId?: number): Promise<number | undefined> {
  const w = await chrome.windows.getLastFocused().catch(() => null);
  return w?.id !== undefined && w.id !== agentId ? w.id : undefined;
}

/**
 * FastPilot's window, opened on the built-in screen if it isn't open yet, and brought up there if it
 * is (un-minimized, moved back from another screen). `url` is only used for a new window. A `hidden`
 * window opens minimized and is never brought up or focused, for test runs you don't need to watch.
 */
let opening: Promise<unknown> = Promise.resolve();

/** One at a time, so runs starting together share one window instead of each opening their own. */
function agentWindow(url: string, hidden = false): Promise<{ windowId: number; created?: number }> {
  const next = opening.then(() => findOrOpen(url, hidden));
  opening = next.catch(() => {});
  return next;
}

async function findOrOpen(url: string, hidden: boolean): Promise<{ windowId: number; created?: number }> {
  const { [KEY]: id } = await chrome.storage.session.get(KEY);
  const existing = typeof id === 'number' ? await chrome.windows.get(id).catch(() => null) : null;
  if (hidden) {
    if (existing) return { windowId: existing.id! };
    const w = await chrome.windows.create({ url, focused: false, type: 'normal', state: 'minimized' });
    await chrome.storage.session.set({ [KEY]: w!.id });
    return { windowId: w!.id!, created: w!.tabs?.[0]?.id };
  }
  const back = await yourWindow(existing?.id);
  const place = await placement();
  let result: { windowId: number; created?: number };
  if (existing) {
    await chrome.windows.update(existing.id!, { state: 'normal', focused: true, ...place });
    result = { windowId: existing.id! };
  } else {
    const w = await chrome.windows.create({ url, focused: true, type: 'normal', ...(place ?? SIZE) });
    await chrome.storage.session.set({ [KEY]: w!.id });
    result = { windowId: w!.id!, created: w!.tabs?.[0]?.id };
  }
  // Shown on top, then focus goes back to where you were working.
  if (back !== undefined) await chrome.windows.update(back, { focused: true }).catch(() => {});
  return result;
}

export async function isAgentWindow(windowId: number): Promise<boolean> {
  return (await chrome.storage.session.get(KEY))[KEY] === windowId;
}

/** Opens `url` in a new tab in FastPilot's window (or navigates `tabId`) and waits for it to load. */
export async function openInAgentWindow(url: string, tabId: number | null = null, hidden = false): Promise<number> {
  const start = OPENABLE.test(url) ? url : 'about:blank';
  let id = tabId;
  if (id === null) {
    const w = await agentWindow(start, hidden);
    id = w.created ?? (await chrome.tabs.create({ windowId: w.windowId, url: start, active: true })).id!;
  } else {
    await chrome.tabs.update(id, { url: start, active: true });
  }
  const end = Date.now() + LOAD_MS;
  for (;;) {
    await sleep(50);
    const t = await chrome.tabs.get(id);
    if ((t.status === 'complete' && !t.pendingUrl && t.url) || Date.now() > end) return id;
  }
}
