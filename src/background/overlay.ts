// Shows FastPilot's input on the page it's working on: a pointer that follows the real mouse path,
// a ripple on each click, an outline around the field being typed into, a panel with the keys
// pressed and the text typed, and a banner with the current step's decision and why. Input sent through CDP has no visible pointer, so without this you
// can't see what the agent is doing.
//
// Everything is drawn inside one closed shadow root on <html>, outside <body>: page scripts can't
// reach into it, snapshots and read_text don't see it, and the page's MutationObservers (including
// the settle check) only notice the host being added once per page. It never takes pointer events,
// so it can't cover the element being clicked. Updates are fire-and-forget, so they add no delay.

import type { TabDebugger } from './cdp';

type Call =
  | { op: 'move'; x: number; y: number }
  | { op: 'press'; x: number; y: number }
  | { op: 'release' }
  | { op: 'key'; label: string }
  | { op: 'type'; text: string }
  | { op: 'scroll'; dy: number }
  | { op: 'decide'; step: number; text: string; why?: string };

/** Runs in the page. Must stay self-contained: it's sent as source text. */
function overlay(call: Call) {
  const w = window as any;
  if (!w.__fpOverlay?.host.isConnected) {
    const host = document.createElement('fastpilot-overlay');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      * { box-sizing: border-box; pointer-events: none; }
      .cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; transform: translate(-100px,-100px); transition: none; filter: drop-shadow(0 1px 2px rgba(0,0,0,.45)); }
      .cursor.down path { fill: #ff5a36; }
      .ripple { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 3px solid #ff5a36; animation: ripple .45s ease-out forwards; }
      @keyframes ripple { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }
      .focus { position: fixed; border: 2px solid #ff5a36; border-radius: 6px; box-shadow: 0 0 0 4px rgba(255,90,54,.18); transition: all .15s ease; opacity: 0; }
      .hud { position: fixed; left: 16px; bottom: 16px; max-width: min(520px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: 6px; font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; background: rgba(20,20,24,.86); color: #fff; padding: 7px 10px; border-radius: 10px; opacity: 0; transition: opacity .25s; }
      .row.on { opacity: 1; }
      .label { color: #ffb4a3; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; margin-right: 4px; }
      kbd { font: 12px ui-monospace, Menlo, monospace; background: #f4f4f5; color: #18181b; border-radius: 5px; padding: 2px 7px; border-bottom: 2px solid #a1a1aa; }
      .typed { font: 13px ui-monospace, Menlo, monospace; white-space: pre-wrap; word-break: break-all; }
      .decide { position: fixed; top: 14px; right: 14px; max-width: min(420px, calc(100vw - 28px)); background: rgba(20,20,24,.9); color: #fff; padding: 9px 12px; border-radius: 12px; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; border-left: 3px solid #ff5a36; opacity: 0; transition: opacity .2s; }
      .decide.on { opacity: 1; }
      .decide .what { font-weight: 600; }
      .decide .why { color: #d4d4d8; margin-top: 2px; }
      .caret { display: inline-block; width: 7px; height: 14px; background: #ff5a36; vertical-align: -2px; margin-left: 1px; }
    </style>
    <svg class="cursor" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.5 L13.4 19.2 L10.4 12.6 L16.5 12.6 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>
    <div class="focus"></div>
    <div class="decide"><div class="label"></div><div class="what"></div><div class="why"></div></div>
    <div class="hud"><div class="row keys"></div><div class="row text"></div></div>`;
    document.documentElement.appendChild(host);
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    w.__fpOverlay = { host, root, cursor: $('.cursor'), focus: $('.focus'), decide: $('.decide'), keys: $('.keys'), text: $('.text'), typed: '', field: null, timers: {} };
  }
  const o = w.__fpOverlay;
  const later = (name: string, ms: number, fn: () => void) => { clearTimeout(o.timers[name]); o.timers[name] = setTimeout(fn, ms); };
  const kbd = (s: string) => { const k = document.createElement('kbd'); k.textContent = s; return k; };
  const label = (s: string) => { const l = document.createElement('span'); l.className = 'label'; l.textContent = s; return l; };
  const showKeys = (title: string, parts: string[]) => {
    o.keys.replaceChildren(label(title), ...parts.map(kbd));
    o.keys.classList.add('on');
    later('keys', 1600, () => o.keys.classList.remove('on'));
  };
  const outlineFocus = () => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return;
    const r = el.getBoundingClientRect();
    Object.assign(o.focus.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px`, opacity: '1' });
    later('focus', 2500, () => { o.focus.style.opacity = '0'; });
  };

  switch (call.op) {
    case 'move':
      o.cursor.style.transform = `translate(${call.x - 3}px, ${call.y - 2}px)`;
      break;
    case 'press': {
      o.cursor.classList.add('down');
      const ripple = document.createElement('div');
      ripple.className = 'ripple';
      ripple.style.left = `${call.x}px`;
      ripple.style.top = `${call.y}px`;
      o.root.appendChild(ripple);
      setTimeout(() => ripple.remove(), 500);
      break;
    }
    case 'release':
      o.cursor.classList.remove('down');
      break;
    case 'key':
      showKeys('Keys', call.label.split('+'));
      outlineFocus();
      break;
    case 'decide': {
      const [l, what, why] = o.decide.children;
      l.textContent = `Step ${call.step}`;
      l.className = 'label';
      what.textContent = call.text;
      why.textContent = call.why ? `because: ${call.why}` : '';
      o.decide.classList.add('on');
      later('decide', 8000, () => o.decide.classList.remove('on'));
      break;
    }
    case 'scroll':
      showKeys('Scroll', [call.dy < 0 ? '↑' : '↓']);
      break;
    case 'type': {
      const el = document.activeElement as HTMLInputElement | null;
      if (o.field !== el) { o.field = el; o.typed = ''; }
      // Never show a password, not even on screen.
      const secret = el?.type === 'password' || el?.autocomplete === 'current-password' || el?.autocomplete === 'new-password';
      o.typed += secret ? '•'.repeat([...call.text].length) : call.text;
      const span = document.createElement('span');
      span.className = 'typed';
      span.textContent = o.typed.length > 120 ? `…${o.typed.slice(-120)}` : o.typed;
      const caret = document.createElement('span');
      caret.className = 'caret';
      o.text.replaceChildren(label('Typing'), span, caret);
      o.text.classList.add('on');
      later('text', 2200, () => { o.text.classList.remove('on'); o.typed = ''; o.field = null; });
      outlineFocus();
      break;
    }
  }
}

const SOURCE = overlay.toString();
const KEY_NAMES: Record<string, string> = { Meta: '⌘', Cmd: '⌘', Command: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Enter: '↵ Enter', Backspace: '⌫', Delete: '⌦', Escape: 'Esc', Tab: '⇥ Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space' };

type Evaluated = { result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string }; text?: string } };

/** Pointer moves waiting to be drawn, per tab: only the latest one matters, so moves never pile up. */
const moves = new WeakMap<TabDebugger, { busy: boolean; next?: Call }>();

/**
 * Updates the overlay without waiting. A page that's navigating just misses the update. The overlay's
 * source goes to each page once; later calls only send the call itself.
 */
export function show(dbg: TabDebugger, call: Call): void {
  if (!dbg.showInput) return;
  if (call.op !== 'move') return void draw(dbg, call);
  let m = moves.get(dbg);
  if (!m) moves.set(dbg, (m = { busy: false }));
  if (m.busy) { m.next = call; return; }
  m.busy = true;
  const pump = (c: Call): Promise<void> => draw(dbg, c).then(() => {
    const next = m.next;
    m.next = undefined;
    if (next) return pump(next);
    m.busy = false;
  });
  void pump(call);
}

async function draw(dbg: TabDebugger, call: Call): Promise<void> {
  const args = JSON.stringify(call);
  const evaluate = (expression: string) => dbg.send<Evaluated>('Runtime.evaluate', { expression, returnByValue: true });
  try {
    let r = await evaluate(`typeof __fpOverlayShow === 'function' ? (__fpOverlayShow(${args}), 1) : 0`);
    if (!r.exceptionDetails && r.result?.value === 0) r = await evaluate(`(window.__fpOverlayShow = ${SOURCE})(${args})`);
    const err = r.exceptionDetails && (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'error');
    if (err) dbg.overlayStatus = String(err).split('\n')[0];
    else dbg.overlayStatus ??= 'ok';
  } catch (e: any) {
    dbg.overlayStatus ??= `not sent: ${e?.message ?? e}`;
  }
}

/** "Meta+a" → "⌘+A", for the keys panel. */
export function keyLabel(combo: string): string {
  return combo.split('+').map((p) => KEY_NAMES[p] ?? (p.length === 1 ? p.toUpperCase() : p)).join('+');
}
