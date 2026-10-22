// Trusted mouse and keyboard actions over CDP, paced by humanize.ts.

import type { Speed } from '../shared/types';
import type { TabDebugger } from './cdp';
import { keyDelay, mousePath, pressHold, sleep, wheelTicks, type Point } from './humanize';
import { keyLabel, show } from './overlay';

const MOD = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Cmd: 4, Command: 4, Shift: 8 } as const;

interface KeyDef { key: string; code: string; vk: number; text?: string }
const KEYS: Record<string, KeyDef> = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  Delete: { key: 'Delete', code: 'Delete', vk: 46 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Home: { key: 'Home', code: 'Home', vk: 36 },
  End: { key: 'End', code: 'End', vk: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', vk: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', vk: 34 },
  Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
};
// Editing shortcuts need explicit commands; dispatched keys alone don't trigger them.
const COMMANDS: Record<string, string> = { a: 'selectAll', c: 'copy', v: 'paste', x: 'cut', z: 'undo' };

function charKey(ch: string): KeyDef {
  if (/^[a-z]$/i.test(ch)) return { key: ch, code: `Key${ch.toUpperCase()}`, vk: ch.toUpperCase().charCodeAt(0), text: ch };
  if (/^[0-9]$/.test(ch)) return { key: ch, code: `Digit${ch}`, vk: ch.charCodeAt(0), text: ch };
  if (ch === ' ') return KEYS.Space;
  return { key: ch, code: '', vk: 0, text: ch };
}

export async function moveTo(dbg: TabDebugger, to: Point, speed: Speed): Promise<void> {
  for (const p of mousePath(dbg.mouse, to, speed)) {
    if (p.dt) await sleep(p.dt);
    await dbg.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    show(dbg, { op: 'move', x: p.x, y: p.y });
    dbg.mouse = { x: p.x, y: p.y };
  }
}

export async function click(dbg: TabDebugger, at: Point, speed: Speed): Promise<void> {
  await moveTo(dbg, at, speed);
  const base = { x: at.x, y: at.y, button: 'left', clickCount: 1 };
  show(dbg, { op: 'press', x: at.x, y: at.y });
  await dbg.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
  const hold = pressHold(speed);
  if (hold) await sleep(hold);
  await dbg.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
  show(dbg, { op: 'release' });
}

async function sendKey(dbg: TabDebugger, def: KeyDef, modifiers = 0, commands?: string[]): Promise<void> {
  const common = { key: def.key, code: def.code, windowsVirtualKeyCode: def.vk, modifiers };
  // Ctrl/Meta combos must not carry text, or Chrome inserts the character.
  const text = modifiers & (MOD.Control | MOD.Meta) ? undefined : def.text;
  await dbg.send('Input.dispatchKeyEvent', {
    ...common,
    type: text ? 'keyDown' : 'rawKeyDown',
    text,
    unmodifiedText: text,
    commands,
  });
  await dbg.send('Input.dispatchKeyEvent', { ...common, type: 'keyUp' });
}

/** Presses a combo like "Enter", "Shift+Tab" or "Meta+a". */
export async function pressKey(dbg: TabDebugger, combo: string): Promise<void> {
  const parts = combo.split('+').map((s) => s.trim()).filter(Boolean);
  const name = parts.pop() ?? '';
  let mods = 0;
  for (const m of parts) {
    const bit = MOD[m as keyof typeof MOD];
    if (bit === undefined) throw new Error(`unknown modifier "${m}"`);
    mods |= bit;
  }
  const def = KEYS[name] ?? (name.length === 1 ? charKey(name) : undefined);
  if (!def) throw new Error(`unknown key "${name}"`);
  const cmd = mods & (MOD.Control | MOD.Meta) ? COMMANDS[name.toLowerCase()] : undefined;
  show(dbg, { op: 'key', label: keyLabel(combo) });
  await sendKey(dbg, def, mods, cmd ? [cmd] : undefined);
}

export async function clearFocused(dbg: TabDebugger): Promise<void> {
  show(dbg, { op: 'key', label: keyLabel('Meta+a+Backspace') });
  await sendKey(dbg, charKey('a'), MOD.Meta, ['selectAll']);
  await sendKey(dbg, KEYS.Backspace);
}

export async function typeText(dbg: TabDebugger, text: string, speed: Speed): Promise<void> {
  if (speed === 'instant') {
    show(dbg, { op: 'type', text });
    await dbg.send('Input.insertText', { text });
    return;
  }
  for (const ch of text) {
    show(dbg, { op: 'type', text: ch });
    if (ch === '\n') await sendKey(dbg, KEYS.Enter);
    else await sendKey(dbg, charKey(ch));
    const d = keyDelay(speed, ch);
    if (d) await sleep(d);
  }
}

export async function scrollBy(dbg: TabDebugger, deltaY: number, speed: Speed): Promise<void> {
  const vp = await dbg.viewport();
  const { x, y } = dbg.mouse;
  if (x < 0 || y < 0 || x > vp.width || y > vp.height) await moveTo(dbg, { x: vp.width / 2, y: vp.height / 2 }, speed);
  show(dbg, { op: 'scroll', dy: deltaY });
  for (const t of wheelTicks(deltaY, speed)) {
    await dbg.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: dbg.mouse.x, y: dbg.mouse.y, deltaX: 0, deltaY: t.dy });
    if (t.dt) await sleep(t.dt);
  }
}
