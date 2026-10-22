// The challenge registry. Each page module defines the challenges it hosts next
// to its markup; the catalog, scoreboard, status strip and tests read them here.

import type { Req } from './lib/http.ts';

export type Capability =
  | 'click' | 'type' | 'select' | 'key' | 'hover' | 'scroll' | 'navigate' | 'wait' | 'read' | 'screenshot' | 'handoff'
  | 'drag' | 'upload' | 'dblclick' | 'rightclick' | 'longpress' | 'modclick' | 'dialog' | 'newtab' | 'crossorigin'
  | 'closedshadow' | 'canvas' | 'basicauth' | 'download' | 'multiselect' | 'hidden';

/** Capabilities FastPilot has no tool (or no snapshot support) for yet. */
export const GAPS: ReadonlySet<Capability> = new Set<Capability>([
  'drag', 'upload', 'dblclick', 'rightclick', 'longpress', 'modclick', 'dialog', 'newtab', 'crossorigin',
  'closedshadow', 'canvas', 'basicauth', 'download', 'multiselect', 'hidden',
]);

export type Expected = string | number | (string | number)[];

export interface Challenge {
  /** "shop/add-to-cart", "lab/clicks/dblclick" */
  id: string;
  /** "shop", "account", "support", "app", "site" or "lab:<category>" */
  area: string;
  title: string;
  /** Where the task starts. */
  path: string;
  /** What you paste into FastPilot. */
  task: string;
  /**
   * auto: the page or server detects the goal state.
   * answer: the agent submits a value in the page's Answer box.
   * handoff: the agent should stop and hand control back; doing the action is a violation.
   */
  check: 'auto' | 'answer' | 'handoff';
  needs: Capability[];
  level: 1 | 2 | 3;
  /** Accepted answers for check "answer". A function is evaluated on each check, so it can read the session. */
  answer?: Expected | ((req: Req) => Expected);
  /** Answers that contain any of these are wrong even if they also contain the right one (decoys). */
  reject?: string[];
  /** What the challenge probes, shown on the scoreboard. */
  note?: string;
  /** Clears leftover state (cookies, flags) when the challenge is started from the catalog. */
  onStart?: (req: Req) => void;
}

export const LAB_CATEGORIES: [slug: string, title: string, blurb: string][] = [
  ['clicks', 'Clicks', 'Buttons, links and every odd way a page listens for a click'],
  ['frames', 'Shadow DOM & frames', 'Open and closed shadow roots, same- and cross-origin iframes'],
  ['text', 'Text input', 'Every input type, masks, controlled inputs, chips and unicode'],
  ['choices', 'Choices', 'Selects, listboxes, comboboxes, radios, checkboxes and switches'],
  ['ranges', 'Ranges & dates', 'Sliders, date and time inputs, calendars and color'],
  ['files', 'Files', 'Uploads, dropzones and downloads'],
  ['drag', 'Drag & drop', 'Reordering, dropzones, handles, splitters and canvases'],
  ['keyboard', 'Keyboard', 'Shortcuts, sequences, focus order and grids'],
  ['hover', 'Hover', 'Tooltips, flyouts and hover-only controls'],
  ['scroll', 'Scrolling', 'Long pages, inner scrollers, infinite and virtual lists'],
  ['timing', 'Timing', 'Delays, spinners, re-renders, live feeds and flaky requests'],
  ['dialogs', 'Dialogs', 'Native dialogs, modals, popovers, toasts and drawers'],
  ['windows', 'Windows & tabs', 'New tabs, popups, opener messaging and print'],
  ['nav', 'Navigation', 'Redirects, errors, slow and endless pages, history'],
  ['forms', 'Forms', 'Validation, wizards, conditional and repeating fields, traps'],
  ['reading', 'Reading', 'Finding facts in tables, canvases, SVG, tooltips and hidden places'],
  ['visual', 'Visual', 'Tasks that need eyes: canvas, colors, charts, image maps'],
  ['adversarial', 'Adversarial', 'Prompt injection, deceptive UI and things that need a human'],
  ['stress', 'Stress', 'Huge pages, deep DOMs, many frames and pages that never settle'],
  ['locale', 'Locale & state', 'Right-to-left, CJK, local formats, storage-gated flows'],
];

export const AREAS: [area: string, title: string][] = [
  ['site', 'Whole site'],
  ['shop', 'Shop'],
  ['account', 'Account'],
  ['support', 'Support & content'],
  ['app', 'App'],
  ...LAB_CATEGORIES.map(([slug, title]) => [`lab:${slug}`, `Lab · ${title}`] as [string, string]),
];

const registry = new Map<string, Challenge>();

export function define(...list: Challenge[]): void {
  for (const c of list) {
    if (registry.has(c.id)) throw new Error(`duplicate challenge ${c.id}`);
    registry.set(c.id, c);
  }
}

export const challenge = (id: string) => registry.get(id);

export function challenges(): Challenge[] {
  const order = new Map(AREAS.map(([a], i) => [a, i]));
  return [...registry.values()].sort((a, b) => (order.get(a.area) ?? 99) - (order.get(b.area) ?? 99));
}

export const supportedToday = (c: Challenge) => !c.needs.some((n) => GAPS.has(n));

const tokens = (s: string) => s.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const contains = (hay: string[], needle: string[]) => needle.length > 0 && hay.some((_, i) => needle.every((t, j) => hay[i + j] === t));

/** Numbers match any number in the answer; text matches as a whole-word sequence, ignoring case and punctuation. */
export function checkAnswer(c: Challenge, given: string, req: Req): boolean {
  const exp = typeof c.answer === 'function' ? c.answer(req) : c.answer;
  if (exp === undefined || !given.trim()) return false;
  const words = tokens(given);
  if (c.reject?.some((r) => contains(words, tokens(r)))) return false;
  const nums = (given.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return (Array.isArray(exp) ? exp : [exp]).some((e) =>
    typeof e === 'number' ? nums.some((n) => Math.abs(n - e) < 0.005) : contains(words, tokens(e)));
}
