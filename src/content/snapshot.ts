// Functions injected into the page with chrome.scripting.executeScript.
// Each one is serialized on its own, so it must be self-contained: no imports
// and no references to anything outside its own body.
//
// Element refs live on `window.__fp` in the extension's isolated world, so they
// survive between calls and stay stable while an element stays in the DOM.
// `meta` holds each ref's tag/role/label so a saved run can find it again later.

export interface Located { x: number; y: number; w: number; h: number; covered: string | null }

/** Finds the same element again on a later page load (see describeTarget / resolveTarget). */
export interface Target {
  tag: string;
  role: string | null;
  label: string;
  /** A selector that matched only this element when it was recorded. */
  css: string | null;
  /** Index among elements with the same tag, role and label. */
  nth: number;
  /**
   * Recorded only when other elements shared the label ("Delete" on every row): the text of the
   * element's row or card (its largest ancestor holding none of the others) minus the label, and
   * how many levels up that ancestor is.
   */
  row?: { text: string; depth: number };
}

export function snapshotPage(maxItems: number): { text: string; count: number } {
  const w = window as any;
  const st: { ids: WeakMap<Element, number>; els: Map<number, Element>; meta: Map<number, object>; next: number } =
    (w.__fp ??= { ids: new WeakMap(), els: new Map(), next: 1 });
  st.els.clear();
  (st.meta ??= new Map()).clear();

  const SEL = [
    'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    '[contenteditable=""]', '[contenteditable=true]', '[onclick]', '[tabindex]:not([tabindex="-1"])',
    ...['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option', 'switch', 'combobox',
      'textbox', 'searchbox', 'slider', 'treeitem'].map((r) => `[role=${r}]`),
  ].join(',');
  const vw = innerWidth, vh = innerHeight;
  const clean = (s: string | null | undefined, n = 80) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

  const labelOf = (el: Element): string => {
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = clean(by.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' '));
      if (t) return t;
    }
    const labels = (el as HTMLInputElement).labels;
    if (labels?.length) {
      const t = clean(labels[0].innerText);
      if (t) return t;
    }
    // A <select>'s innerText is every option, which is noise.
    const txt = el.tagName === 'SELECT' ? '' : clean((el as HTMLElement).innerText);
    if (txt) return txt;
    return clean(
      el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') ||
      el.querySelector('img[alt]')?.getAttribute('alt') || el.getAttribute('name'),
    );
  };

  const describe = (el: Element, label: string): string => {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    let kind = role ?? (tag === 'a' ? 'link' : tag);
    let extra = '';
    if (tag === 'input') {
      const i = el as HTMLInputElement;
      kind = i.type === 'text' ? 'input' : `input[${i.type}]`;
      if (i.type === 'checkbox' || i.type === 'radio') extra += i.checked ? ' checked' : ' unchecked';
      else if (i.type === 'password') extra += i.value ? ' value="••••"' : '';
      else if (i.value) extra += ` value="${clean(i.value, 40)}"`;
    } else if (tag === 'textarea') {
      const v = (el as HTMLTextAreaElement).value;
      if (v) extra += ` value="${clean(v, 40)}"`;
    } else if (tag === 'select') {
      const s = el as HTMLSelectElement;
      const opts = Array.from(s.options);
      extra += ` selected="${clean(s.selectedOptions[0]?.text, 40)}" options=[${opts.slice(0, 10).map((o) => clean(o.text, 25)).join('|')}${opts.length > 10 ? `|…${opts.length - 10} more` : ''}]`;
    } else if (!role && el.getAttribute('contenteditable') !== null) {
      kind = 'editable';
    }
    const exp = el.getAttribute('aria-expanded');
    if (exp) extra += exp === 'true' ? ' expanded' : ' collapsed';
    if (el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true') extra += ' selected';
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') extra += ' disabled';
    return `${kind}${label ? ` "${label}"` : ''}${extra}`;
  };

  const isVisible = (el: Element, r: DOMRect) => {
    if (r.width < 2 || r.height < 2) return false;
    const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };

  const refFor = (el: Element) => {
    let id = st.ids.get(el);
    if (id === undefined) { id = st.next++; st.ids.set(el, id); }
    st.els.set(id, el);
    return id;
  };

  const items: { line: string; dist: number; pos: string }[] = [];
  const place = (r: DOMRect, ox: number, oy: number) => {
    const top = oy + r.top, bottom = top + r.height, left = ox + r.left;
    if (left + r.width < 0 || left > vw) return null; // off-canvas menus, carousels
    if (bottom < 0) return { dist: -bottom, pos: ' (above)' };
    if (top > vh) return { dist: top - vh, pos: ' (below)' };
    return { dist: 0, pos: '' };
  };

  const walk = (root: Document | ShadowRoot, ox: number, oy: number) => {
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (el.shadowRoot) walk(el.shadowRoot, ox, oy);
      const tag = el.tagName;
      if (tag === 'IFRAME') {
        try {
          const doc = (el as HTMLIFrameElement).contentDocument;
          if (doc) {
            const r = el.getBoundingClientRect();
            walk(doc, ox + r.left + (el as HTMLElement).clientLeft, oy + r.top + (el as HTMLElement).clientTop);
          }
        } catch { /* cross-origin */ }
        continue;
      }
      if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
        const r = el.getBoundingClientRect();
        const p = isVisible(el, r) && place(r, ox, oy);
        const t = clean((el as HTMLElement).innerText, 100);
        if (p && t) items.push({ line: `# ${t}`, ...p });
        continue;
      }
      if (!el.matches(SEL) || el.closest('[aria-hidden=true],[inert]')) continue;

      // Styled checkboxes often hide the real input; target its label instead.
      let target: Element = el;
      let r = el.getBoundingClientRect();
      if (!isVisible(el, r)) {
        const lab = tag === 'INPUT' && /checkbox|radio/.test((el as HTMLInputElement).type) ? (el as HTMLInputElement).labels?.[0] : null;
        if (!lab) continue;
        target = lab;
        r = lab.getBoundingClientRect();
        if (!isVisible(lab, r)) continue;
      }
      const p = place(r, ox, oy);
      if (!p) continue;
      const id = refFor(target);
      const label = labelOf(el);
      st.meta.set(id, { tag: target.tagName.toLowerCase(), role: el.getAttribute('role'), label });
      items.push({ line: `[${id}] ${describe(el, label)}`, ...p });
    }
  };
  walk(document, 0, 0);

  // Keep everything on screen, then fill the budget with the nearest off-screen items.
  const keep = new Set(
    items.map((it, i) => [it.dist, i] as const).sort((a, b) => a[0] - b[0]).slice(0, maxItems).map(([, i]) => i),
  );
  const lines = items.filter((_, i) => keep.has(i)).map((it) => it.line + it.pos);
  const omitted = items.length - keep.size;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
  const header = [
    `URL: ${location.href}`,
    `Title: ${clean(document.title, 120)}`,
    `Viewport: ${vw}x${vh}, scrolled ${Math.round(scrollY)}/${Math.round(maxScroll)}px`,
  ];
  if (omitted > 0) lines.push(`(${omitted} more off-screen elements omitted; scroll to reveal them)`);
  return { text: [...header, '', ...lines].join('\n'), count: keep.size };
}

/** Scrolls the ref into view if needed and returns its center in top-level viewport coordinates. */
export function locateRef(ref: number): Located | { error: string } {
  const el: Element | undefined = (window as any).__fp?.els.get(ref);
  if (!el || !el.isConnected) return { error: `ref ${ref} no longer exists (the page changed)` };
  const win = el.ownerDocument.defaultView!;
  let r = el.getBoundingClientRect();
  if (r.top < 0 || r.bottom > win.innerHeight || r.left < 0 || r.right > win.innerWidth) {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
    r = el.getBoundingClientRect();
  }
  let ox = 0, oy = 0;
  let w: Window = win;
  while (w !== window && w.frameElement) {
    const f = w.frameElement as HTMLElement;
    const fr = f.getBoundingClientRect();
    ox += fr.left + f.clientLeft;
    oy += fr.top + f.clientTop;
    w = w.parent;
  }
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = el.ownerDocument.elementFromPoint(cx, cy);
  const covered = hit && hit !== el && !el.contains(hit) && !hit.contains(el)
    ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''} "${(hit as HTMLElement).innerText?.replace(/\s+/g, ' ').trim().slice(0, 40) ?? ''}"`
    : null;
  return { x: ox + cx, y: oy + cy, w: r.width, h: r.height, covered };
}

export function refTag(ref: number): string | null {
  const el: Element | undefined = (window as any).__fp?.els.get(ref);
  return el?.isConnected ? el.tagName.toLowerCase() : null;
}

export function readText(ref: number | null, max: number): string {
  const el: Element | undefined = ref == null ? document.body : (window as any).__fp?.els.get(ref);
  if (!el || !el.isConnected) return `ref ${ref} no longer exists (the page changed)`;
  const t = ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return t.length > max ? `${t.slice(0, max)}\n…(truncated, ${t.length - max} more chars)` : t;
}

/** Native <select> menus are rendered by the OS, so set them directly. */
export function setSelect(ref: number, value: string): string {
  const el = (window as any).__fp?.els.get(ref) as HTMLSelectElement | undefined;
  if (!el || !el.isConnected) return `error: ref ${ref} no longer exists`;
  if (el.tagName !== 'SELECT') return `error: ref ${ref} is a <${el.tagName.toLowerCase()}>, not a <select>; click it instead`;
  const v = value.trim().toLowerCase();
  const opts = Array.from(el.options);
  const opt = opts.find((o) => o.value === value || o.text.trim().toLowerCase() === v)
    ?? opts.find((o) => o.text.toLowerCase().includes(v));
  if (!opt) return `error: no option "${value}". Options: ${opts.map((o) => o.text.trim()).join(' | ').slice(0, 500)}`;
  el.value = opt.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return `selected "${opt.text.trim()}"`;
}

export function waitForText(text: string, timeoutMs: number): Promise<boolean> {
  const needle = text.toLowerCase();
  const has = () => (document.body?.innerText ?? '').toLowerCase().includes(needle);
  if (has()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      if (has()) { obs.disconnect(); clearTimeout(timer); resolve(true); }
    });
    const timer = setTimeout(() => { obs.disconnect(); resolve(false); }, timeoutMs);
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  });
}

/** Fingerprint of a ref from the latest snapshot, for recording. */
export function describeTarget(ref: number): Target | null {
  const st = (window as any).__fp;
  const el: Element | undefined = st?.els.get(ref);
  const meta = st?.meta?.get(ref);
  if (!el || !meta) return null;
  const root = el.getRootNode() as Document | ShadowRoot;
  const unique = (sel: string) => {
    try { return root.querySelectorAll(sel).length === 1 && root.querySelector(sel) === el; } catch { return false; }
  };
  // Generated ids (react-123, :r4:, ember456) change between page loads.
  const stableId = (id: string) => !!id && !/\d{3,}|:|^(ember|react|mui|radix|headlessui)/i.test(id);
  const tag = el.tagName.toLowerCase();

  let css: string | null = null;
  if (stableId(el.id) && unique(`#${CSS.escape(el.id)}`)) css = `#${CSS.escape(el.id)}`;
  for (const a of ['data-testid', 'data-test', 'data-qa', 'name', 'aria-label', 'placeholder', 'for', 'href']) {
    if (css) break;
    const v = el.getAttribute(a);
    if (v && v.length < 120 && unique(`${tag}[${a}="${CSS.escape(v)}"]`)) css = `${tag}[${a}="${CSS.escape(v)}"]`;
  }
  if (!css) {
    // Short structural path, anchored at the nearest ancestor with a stable id.
    const parts: string[] = [];
    let cur: Element | null = el;
    for (let depth = 0; cur && depth < 6 && !css; depth++) {
      if (cur !== el && stableId(cur.id)) parts.unshift(`#${CSS.escape(cur.id)}`);
      else {
        const c: Element = cur;
        const sibs = c.parentElement ? Array.from(c.parentElement.children).filter((x) => x.tagName === c.tagName) : [];
        parts.unshift(sibs.length > 1 ? `${c.tagName.toLowerCase()}:nth-of-type(${sibs.indexOf(c) + 1})` : c.tagName.toLowerCase());
      }
      if (unique(parts.join(' > '))) css = parts.join(' > ');
      else if (parts[0].startsWith('#')) break;
      cur = cur.parentElement;
    }
  }

  let nth = 0, past = false;
  const others: Element[] = [];
  for (const [id, m] of st.meta) {
    if (id === ref) { past = true; continue; }
    if (m.tag !== meta.tag || m.role !== meta.role || m.label !== meta.label) continue;
    others.push(st.els.get(id));
    if (!past) nth++;
  }

  // Look-alikes: remember which row or card this one sits in.
  let row: Target['row'];
  if (others.length) {
    let box: Element = el, depth = 0;
    for (let p = el.parentElement; p && p !== el.ownerDocument.body && !others.some((o) => p!.contains(o)); p = p.parentElement) {
      box = p;
      depth++;
    }
    let text = ((box as HTMLElement).innerText ?? '').replace(meta.label, '').replace(/\s+/g, ' ').trim();
    if (text.length > 100) text = text.slice(0, 100).replace(/\s+\S*$/, '');
    if (/[\p{L}\p{N}]/u.test(text)) row = { text, depth };
  }
  return { tag: meta.tag, role: meta.role, label: meta.label, css, nth, ...(row && { row }) };
}

/** Ref in the latest snapshot that matches a recorded target, or null. */
export function resolveTarget(t: Target): number | null {
  const st = (window as any).__fp;
  if (!st?.meta) return null;
  const same: number[] = [];
  for (const [id, m] of st.meta) {
    if (m.tag === t.tag && m.role === t.role && m.label === t.label) same.push(id);
  }
  if (t.row && same.length) {
    // Recorded among look-alikes: pick by row or card text. When no row matches, the recorded one
    // may be gone, so fail instead of guessing by position or by a structural selector.
    const row = t.row;
    const els: Element[] = same.map((id) => st.els.get(id));
    const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    const want = words(row.text);
    const scored = els.map((el, i) => {
      let box = el;
      for (let p = el.parentElement, d = 0; p && d < row.depth && p !== el.ownerDocument.body && !els.some((o) => o !== el && p!.contains(o)); p = p.parentElement, d++) box = p;
      const got = words(((box as HTMLElement).innerText ?? '').replace(t.label, ''));
      let common = 0;
      for (const w of want) if (got.has(w)) common++;
      // Share of the recorded words present, then overlap, so "Trail Mix" beats "Trail Mix Deluxe".
      return { id: same[i], found: common / (want.size || 1), overlap: common / (want.size + got.size - common || 1) };
    }).sort((a, b) => b.found - a.found || b.overlap - a.overlap);
    const [best, next] = scored;
    const tied = next && next.found === best.found && next.overlap === best.overlap;
    return best.found >= 0.75 && !tied ? best.id : null;
  }
  let byCss: number | null = null;
  if (t.css) {
    try {
      const el = document.querySelector(t.css);
      const id = el ? st.ids.get(el) : undefined;
      if (id !== undefined && st.els.get(id) === el && st.meta.get(id)?.tag === t.tag) byCss = id;
    } catch { /* invalid selector */ }
  }
  if (byCss !== null && same.includes(byCss)) return byCss;
  if (same.length === 1) return same[0];
  // Selector still matches but the text changed (e.g. a counter in a button label).
  if (byCss !== null) return byCss;
  if (same.length > 1) return same[Math.min(t.nth, same.length - 1)];
  return null;
}
