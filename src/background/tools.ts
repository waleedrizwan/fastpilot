// Tool schemas the model sees, and the code that carries them out.

import type { Speed } from '../shared/types';
import type { TabDebugger } from './cdp';
import type { ToolSpec } from './llm/types';
import { clickPoint } from './humanize';
import { clearFocused, click, moveTo, pressKey, scrollBy, typeText } from './input';
import { inPage, settle } from './page';
import { locateRef, readText, refTag, setSelect, waitForText, type Located } from '../content/snapshot';

/** Shown live in the side panel and on the page, so you can follow the agent's reasoning. Listed first so it's written first. */
const why = { type: 'string', description: 'A few words on why this action, e.g. "submit the filled form"' };
const fn = (name: string, description: string, properties: object = {}, required: string[] = []): ToolSpec => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties: name === 'done' || name === 'handoff' ? properties : { why, ...properties }, required } },
});
const ref = { type: 'integer', description: 'Element ref number from the snapshot' };

export const TOOLS: ToolSpec[] = [
  fn('click', 'Click an element.', { ref }, ['ref']),
  fn('type', 'Click into a field and type text. Replaces existing text unless clear=false.', {
    ref, text: { type: 'string' },
    submit: { type: 'boolean', description: 'Press Enter afterwards' },
    clear: { type: 'boolean', description: 'Default true' },
  }, ['ref', 'text']),
  fn('select', 'Choose an option in a native <select> by its value or visible text.', { ref, value: { type: 'string' } }, ['ref', 'value']),
  fn('key', 'Press a key or combo on the focused element, e.g. "Enter", "Escape", "ArrowDown", "Shift+Tab", "Meta+a".', { combo: { type: 'string' } }, ['combo']),
  fn('hover', 'Move the mouse over an element (opens hover menus).', { ref }, ['ref']),
  fn('scroll', 'Scroll the page, or scroll an element into view when ref is given.', {
    direction: { type: 'string', enum: ['up', 'down'] },
    pages: { type: 'number', description: 'Viewport heights to scroll, default 0.8' },
    ref,
  }),
  fn('navigate', 'Go to a URL, or "back" / "forward".', { url: { type: 'string' } }, ['url']),
  fn('wait_for', 'Wait until text appears on the page.', { text: { type: 'string' }, timeout_ms: { type: 'integer' } }, ['text']),
  fn('read_text', 'Read the visible text of the page, or of one element when ref is given. Use this to read content instead of screenshots.', { ref }),
  fn('screenshot', 'Look at the page. Slow: only when layout, images or canvas matter.'),
  fn('done', 'The task is complete. Give the answer or a one-line summary.', { result: { type: 'string' } }, ['result']),
  fn('handoff', 'Stop and hand control back to the user: CAPTCHA, login or password, 2FA, payment or purchase confirmation, or anything needing their judgment.', { reason: { type: 'string' } }, ['reason']),
];

export interface ToolCtx {
  dbg: TabDebugger;
  speed: Speed;
  /** Aborting it (Stop) ends the running tool's wait at once. */
  signal?: AbortSignal;
}

export interface ToolResult {
  text: string;
  /** JPEG data URL to show the model on the next turn. */
  image?: string;
  /** The remaining actions in this batch were planned against a page that no longer exists. */
  stale?: boolean;
  final?: { status: 'done' | 'handoff'; message: string };
}

const SETTLES = new Set(['click', 'type', 'select', 'key', 'hover', 'scroll', 'navigate']);

/**
 * Runs one tool call. Its page calls are time-limited, but CDP input can still block (a JS dialog
 * holds mouse events), so Stop doesn't wait for it: the call is abandoned and fails once the agent
 * detaches the debugger.
 */
export function runTool(ctx: ToolCtx, name: string, args: any): Promise<ToolResult> {
  const { signal } = ctx;
  if (!signal) return runAndSettle(ctx, name, args);
  if (signal.aborted) return Promise.reject(new Error('Stopped'));
  return new Promise((resolve, reject) => {
    const stop = () => reject(new Error('Stopped'));
    signal.addEventListener('abort', stop, { once: true });
    runAndSettle(ctx, name, args).then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

async function runAndSettle(ctx: ToolCtx, name: string, args: any): Promise<ToolResult> {
  const { dbg } = ctx;
  const urlBefore = (await chrome.tabs.get(dbg.tabId)).url;
  const res = await dispatch(ctx, name, args);
  if (!SETTLES.has(name) || res.final) return res;

  const waited = await settle(dbg, ctx.speed);
  const urlAfter = (await chrome.tabs.get(dbg.tabId)).url;
  if (urlAfter !== urlBefore) return { ...res, text: `${res.text}; page navigated to ${urlAfter}`, stale: true };
  return { ...res, text: `${res.text} (settled ${waited}ms)` };
}

async function locate(ctx: ToolCtx, r: number): Promise<Located> {
  if (typeof r !== 'number') throw new Error('missing ref');
  const loc = await inPage(ctx.dbg.tabId, locateRef, [r]);
  if ('error' in loc) throw Object.assign(new Error(loc.error), { stale: true });
  return loc;
}

async function clickRef(ctx: ToolCtx, r: number): Promise<string> {
  const loc = await locate(ctx, r);
  await click(ctx.dbg, clickPoint(loc.x, loc.y, loc.w, loc.h, ctx.speed), ctx.speed);
  return loc.covered ? ` (warning: point was covered by ${loc.covered})` : '';
}

async function dispatch(ctx: ToolCtx, name: string, a: any): Promise<ToolResult> {
  const { dbg, speed } = ctx;
  switch (name) {
    case 'click':
      return { text: `clicked [${a.ref}]${await clickRef(ctx, a.ref)}` };

    case 'type': {
      if ((await inPage(dbg.tabId, refTag, [a.ref])) === 'select') return dispatch(ctx, 'select', { ref: a.ref, value: a.text });
      const note = await clickRef(ctx, a.ref);
      if (a.clear !== false) await clearFocused(dbg);
      await typeText(dbg, String(a.text ?? ''), speed);
      if (a.submit) await pressKey(dbg, 'Enter');
      return { text: `typed into [${a.ref}]${a.submit ? ' and pressed Enter' : ''}${note}` };
    }

    case 'select': {
      await locate(ctx, a.ref);
      const out = await inPage(dbg.tabId, setSelect, [a.ref, String(a.value)]);
      if (out.startsWith('error')) throw new Error(out.slice(7));
      return { text: `[${a.ref}] ${out}` };
    }

    case 'key':
      await pressKey(dbg, String(a.combo));
      return { text: `pressed ${a.combo}` };

    case 'hover': {
      const loc = await locate(ctx, a.ref);
      await moveTo(dbg, { x: loc.x, y: loc.y }, speed);
      return { text: `hovering [${a.ref}]` };
    }

    case 'scroll': {
      if (typeof a.ref === 'number') {
        await locate(ctx, a.ref);
        return { text: `scrolled [${a.ref}] into view` };
      }
      const vp = await dbg.viewport();
      const dy = vp.height * (a.pages ?? 0.8) * (a.direction === 'up' ? -1 : 1);
      await scrollBy(dbg, dy, speed);
      return { text: `scrolled ${a.direction ?? 'down'}` };
    }

    case 'navigate': {
      const url = String(a.url);
      if (url === 'back') await chrome.tabs.goBack(dbg.tabId);
      else if (url === 'forward') await chrome.tabs.goForward(dbg.tabId);
      else await chrome.tabs.update(dbg.tabId, { url: /^[a-z]+:/i.test(url) ? url : `https://${url}` });
      return { text: `navigating to ${url}` };
    }

    case 'wait_for': {
      const ms = Math.min(a.timeout_ms ?? 5000, 15000);
      const ok = await inPage(dbg.tabId, waitForText, [String(a.text), ms], { waitMs: ms });
      return { text: ok ? `"${a.text}" appeared` : `timed out waiting for "${a.text}"` };
    }

    case 'read_text':
      return { text: await inPage(dbg.tabId, readText, [typeof a.ref === 'number' ? a.ref : null, 6000]) };

    case 'screenshot':
      return { text: 'screenshot attached to the next message', image: await screenshot(dbg) };

    case 'done':
      return { text: 'done', final: { status: 'done', message: String(a.result ?? '') } };

    case 'handoff':
      return { text: 'handed off', final: { status: 'handoff', message: String(a.reason ?? '') } };

    default:
      throw new Error(`unknown tool "${name}"`);
  }
}

/** JPEG of the viewport, downscaled so it's cheap to upload and read. */
async function screenshot(dbg: TabDebugger, maxWidth = 1280): Promise<string> {
  const { data } = await dbg.send<{ data: string }>('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${data}`)).blob());
  const scale = Math.min(1, maxWidth / bmp.width);
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}
