// Shared page code: challenge reporting, answer boxes, toasts, modals, tabs,
// and the event inspector. Exposed as window.G.

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const cookie = (name) => {
    const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** ms since the challenge was started from the catalog, or since page load. */
  function elapsed(id) {
    const [active, start] = (cookie('gch') ?? '').split('|');
    return active === id && start ? Date.now() - Number(start) : Math.round(performance.now());
  }

  const STATUS_TEXT = { pass: 'Passed', fail: 'Not passed yet', violation: 'Violation recorded' };

  function showResult(id, status, { code, detail } = {}) {
    const text = status === 'pass' ? `✓ Challenge passed. Completion code ${code}`
      : status === 'violation' ? `⚠ Violation recorded${detail ? `: ${detail}` : ''}`
      : `✗ Not passed${detail ? `: ${detail}` : ''}`;
    const strip = $(`.challenge-strip[data-challenge="${CSS.escape(id)}"]`);
    if (strip) {
      $('.cs-result', strip).textContent = text;
      $('.cs-result', strip).className = `cs-result result-${status}`;
      const chip = $('.cs-status', strip);
      if (status !== 'fail' || !chip.classList.contains('status-pass')) {
        chip.textContent = STATUS_TEXT[status];
        chip.className = `cs-status status-${status}`;
      }
    } else {
      toast(text, { kind: status, ms: 6000 }).classList.add('toast-result');
    }
  }

  const reported = new Set();
  async function report(id, status, detail, event) {
    const key = `${id}/${status}/${detail ?? ''}`;
    if (status === 'pass' && reported.has(`${id}/pass`)) return;
    if (reported.has(key) && status !== 'pass') return;
    reported.add(status === 'pass' ? `${id}/pass` : key);
    const body = { id, status, detail, ms: elapsed(id), trusted: event && 'isTrusted' in event ? event.isTrusted : undefined };
    const res = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json();
    if (!res.ok) { toast(`Could not record the result: ${out.error ?? res.status}`, { kind: 'violation' }); return out; }
    showResult(id, status, { code: out.code, detail });
    return out;
  }

  function wireAnswerBoxes() {
    for (const form of $$('form.answer-box')) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = form.dataset.challenge;
        const answer = form.elements.answer.value;
        const res = await fetch('/api/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, answer }) });
        const out = await res.json();
        showResult(id, out.ok ? 'pass' : 'fail', { code: out.code, detail: out.ok ? '' : `“${answer}” is not right` });
      });
    }
  }

  function toast(text, { ms = 3000, kind = 'info' } = {}) {
    const box = $('.toasts') ?? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toasts' }));
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.setAttribute('role', 'status');
    el.textContent = text;
    box.append(el);
    if (ms) setTimeout(() => el.remove(), ms);
    return el;
  }

  // Modals: [data-open-modal="id"] opens #id (a .modal-backdrop), [data-close-modal] closes the nearest one.
  // Escape and backdrop clicks close the top modal unless it has data-static; data-no-backdrop only blocks clicks.
  const openStack = [];
  function openModal(backdrop, opener) {
    if (typeof backdrop === 'string') backdrop = document.getElementById(backdrop);
    if (!backdrop) return;
    backdrop.hidden = false;
    backdrop._opener = opener ?? document.activeElement;
    openStack.push(backdrop);
    const focusable = $('[autofocus], input:not([type=hidden]), select, textarea, button, [href], [tabindex]:not([tabindex="-1"])', backdrop);
    focusable?.focus();
    backdrop.dispatchEvent(new CustomEvent('modal:open'));
  }
  function closeModal(backdrop) {
    backdrop = backdrop ?? openStack.at(-1);
    if (!backdrop || backdrop.hidden) return;
    backdrop.hidden = true;
    openStack.splice(openStack.indexOf(backdrop), 1);
    backdrop._opener?.focus?.();
    backdrop.dispatchEvent(new CustomEvent('modal:close'));
  }
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open-modal]');
    if (opener) { e.preventDefault(); openModal(opener.dataset.openModal, opener); return; }
    const closer = e.target.closest('[data-close-modal]');
    if (closer) { closeModal(closer.closest('.modal-backdrop')); return; }
    if (e.target.classList?.contains('modal-backdrop') && !e.target.matches('[data-static], [data-no-backdrop]')) closeModal(e.target);
  });
  document.addEventListener('keydown', (e) => {
    const top = openStack.at(-1);
    if (e.key === 'Escape' && top && !top.hasAttribute('data-static')) closeModal(top);
    // Focus trap for modals marked data-trap.
    if (e.key === 'Tab' && top?.hasAttribute('data-trap')) {
      const items = $$('input:not([disabled]), select, textarea, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])', top).filter((x) => x.offsetParent);
      if (!items.length) return;
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Declarative results: clicking an element with data-pass, data-fail or data-violation reports
  // for the page's lab challenge (or data-challenge). Used by simple lab pages.
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-pass], [data-fail], [data-violation]');
    if (!el || el.disabled) return;
    const id = el.dataset.challenge ?? (document.body.dataset.lab ? `lab/${document.body.dataset.lab}` : null);
    if (!id) return;
    const status = 'pass' in el.dataset ? 'pass' : 'fail' in el.dataset ? 'fail' : 'violation';
    report(id, status, el.dataset[status] || `clicked “${el.textContent.trim().slice(0, 40)}”`, e);
  });

  // Type-to-confirm: an input with data-must-equal enables the [data-confirm-btn] in its modal or form.
  document.addEventListener('input', (e) => {
    const input = e.target.closest?.('[data-must-equal]');
    if (!input) return;
    const btn = (input.closest('.modal, form') ?? document).querySelector('[data-confirm-btn]');
    if (btn) btn.disabled = input.value.trim() !== input.dataset.mustEqual;
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-toast]');
    if (t && !t.disabled) toast(t.dataset.toast);
  });

  // Tabs: role=tablist with role=tab buttons controlling role=tabpanel via aria-controls. Arrow keys move.
  function wireTabs(root = document) {
    for (const list of $$('[role=tablist]', root)) {
      if (list.dataset.wired) continue;
      list.dataset.wired = '1';
      const tabs = $$('[role=tab]', list);
      const select = (tab, focus) => {
        for (const t of tabs) {
          const on = t === tab;
          t.setAttribute('aria-selected', String(on));
          t.tabIndex = on ? 0 : -1;
          const panel = document.getElementById(t.getAttribute('aria-controls'));
          if (panel) panel.hidden = !on;
        }
        if (focus) tab.focus();
        list.dispatchEvent(new CustomEvent('tabs:change', { detail: tab }));
      };
      tabs.forEach((t) => t.addEventListener('click', () => select(t)));
      list.addEventListener('keydown', (e) => {
        const i = tabs.indexOf(document.activeElement);
        if (i < 0) return;
        const vertical = list.getAttribute('aria-orientation') === 'vertical';
        const next = { [vertical ? 'ArrowDown' : 'ArrowRight']: i + 1, [vertical ? 'ArrowUp' : 'ArrowLeft']: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        select(tabs[(next + tabs.length) % tabs.length], true);
      });
    }
  }

  // Event inspector: logs input events with their isTrusted flag. Toggle with the footer button or Alt+Shift+E.
  const INSPECT = ['click', 'dblclick', 'contextmenu', 'auxclick', 'pointerdown', 'pointerup', 'mousedown', 'keydown', 'input', 'change',
    'submit', 'focusin', 'wheel', 'dragstart', 'drop', 'paste', 'copy'];
  let inspector = null;
  let lastWheel = 0;
  function describe(el) {
    if (!(el instanceof Element)) return String(el?.nodeName ?? el);
    const label = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24) || el.getAttribute('name') || '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${label ? ` “${label}”` : ''}`;
  }
  function logEvent(e) {
    if (!inspector || inspector.contains(e.target)) return;
    if (e.type === 'wheel') { if (performance.now() - lastWheel < 250) return; lastWheel = performance.now(); }
    const extra = e.type === 'keydown' ? ` key=${e.key}${e.metaKey ? '+meta' : ''}${e.ctrlKey ? '+ctrl' : ''}${e.shiftKey ? '+shift' : ''}`
      : 'clientX' in e && e.type !== 'input' ? ` @${Math.round(e.clientX)},${Math.round(e.clientY)}${e.button ? ` button=${e.button}` : ''}${e.detail > 1 ? ` count=${e.detail}` : ''}` : '';
    const li = document.createElement('li');
    li.className = e.isTrusted ? 'trusted' : 'synthetic';
    li.textContent = `${e.isTrusted ? '●' : '○'} ${e.type} ${describe(e.target)}${extra}`;
    const list = $('ol', inspector);
    list.prepend(li);
    while (list.children.length > 40) list.lastChild.remove();
  }
  function toggleInspector(force) {
    const on = force ?? !inspector;
    try { localStorage.setItem('g-inspector', on ? '1' : ''); } catch {}
    if (!on) { inspector?.remove(); inspector = null; return; }
    if (inspector) return;
    inspector = document.createElement('aside');
    inspector.className = 'inspector';
    inspector.setAttribute('aria-label', 'Event inspector');
    inspector.innerHTML = '<header><strong>Events</strong> <span>● trusted ○ synthetic</span> <button type="button" class="link-btn">Close</button></header><ol></ol>';
    $('button', inspector).addEventListener('click', () => toggleInspector(false));
    document.body.append(inspector);
  }
  for (const type of INSPECT) document.addEventListener(type, logEvent, { capture: true, passive: true });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-inspector-toggle]')) toggleInspector(); });
  document.addEventListener('keydown', (e) => { if (e.altKey && e.shiftKey && e.code === 'KeyE') toggleInspector(); });

  // Lab pages: G.lab('clicks/basic', (id) => {...}) runs only on the page whose body has data-lab="clicks/basic".
  const labs = new Map();
  function lab(key, setup) { labs.set(key, setup); }

  function init() {
    wireAnswerBoxes();
    wireTabs();
    try { if (localStorage.getItem('g-inspector')) toggleInspector(true); } catch {}
    const key = document.body.dataset.lab;
    if (key && labs.has(key)) labs.get(key)(`lab/${key}`);
  }

  window.G = {
    $, $$, sleep, cookie, toast, report, showResult, openModal, closeModal, wireTabs, lab, elapsed,
    pass: (id, detail, event) => report(id, 'pass', detail, event),
    fail: (id, detail, event) => report(id, 'fail', detail, event),
    violation: (id, detail, event) => report(id, 'violation', detail, event),
    async api(url, body, method = body === undefined ? 'GET' : 'POST') {
      const res = await fetch(url, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const out = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
      if (out && out.flash) showResult(out.flash.id, out.flash.status, out.flash);
      if (!res.ok) throw Object.assign(new Error(out?.error ?? res.statusText), { status: res.status, body: out });
      return out;
    },
  };
  // Category scripts load after this one, so set up once every script has run.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})();
