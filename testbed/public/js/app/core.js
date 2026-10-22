// Workspace core: router (history or hash), view registry, command palette,
// unsaved-changes guard and theme. Views register with App.view(route, spec).

(() => {
  const { $, $$ } = G;
  const root = $('.app');
  const hashMode = root.dataset.routing === 'hash';
  const meta = JSON.parse($('#app-meta').textContent);
  const views = new Map();
  let current = null;
  let guard = null;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const routeOf = () => (hashMode ? location.hash.replace(/^#\/?/, '') : location.pathname.replace(/^\/app\/?/, '')).split(/[/?]/)[0];
  const href = (r) => (hashMode ? `#/${r}` : `/app${r ? `/${r}` : ''}`);

  async function render() {
    const r = routeOf();
    const spec = views.get(r) ?? views.get('404');
    try { current?.cleanup?.(); } catch {}
    current = null;
    guard = null;
    for (const a of $$('[data-route]')) {
      if (a.dataset.route === r) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const el = $('#view');
    el.innerHTML = '';
    document.title = `${spec.title} · Workspace · Gauntlet`;
    current = (await spec.render(el)) ?? null;
  }

  function confirmDiscard() {
    return new Promise((resolve) => {
      const modal = $('#discard-modal');
      G.openModal(modal);
      const onClick = (e) => {
        const b = e.target.closest('[data-discard]');
        if (!b) return;
        modal.removeEventListener('click', onClick);
        G.closeModal(modal);
        resolve(b.dataset.discard === 'leave');
      };
      modal.addEventListener('click', onClick);
    });
  }

  async function go(r) {
    if (r === routeOf()) return;
    if (guard?.() && !(await confirmDiscard())) return;
    guard = null;
    if (hashMode) location.hash = `#/${r}`;
    else { history.pushState(null, '', href(r)); render(); }
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-route]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    go(a.dataset.route);
  });
  addEventListener('popstate', () => { if (!hashMode) render(); });
  addEventListener('hashchange', () => { if (hashMode) render(); });
  addEventListener('beforeunload', (e) => {
    if (guard?.()) { e.preventDefault(); e.returnValue = ''; }
  });

  async function setTheme(theme, via) {
    const out = await G.api('/api/app/settings', { theme, via });
    document.body.classList.toggle('app-dark', out.settings.theme === 'dark');
    return out.settings;
  }

  // Command palette.
  const COMMANDS = [
    ...[['', 'Dashboard'], ['projects', 'Projects'], ['board', 'Board'], ['calendar', 'Calendar'], ['docs', 'Docs'], ['inbox', 'Inbox'], ['settings', 'Settings']]
      .map(([r, label]) => ({ label: `Go to ${label}`, run: () => go(r) })),
    { label: 'Switch to dark theme', run: () => setTheme('dark', 'palette') },
    { label: 'Switch to light theme', run: () => setTheme('light', 'palette') },
    { label: 'Open the store', run: () => { location.href = '/'; } },
    { label: 'Show keyboard shortcuts', run: () => G.toast('j/k move, e archive, / search (inbox) · ⌘K palette', { ms: 5000 }) },
  ];
  const palette = $('#palette'), pInput = $('[data-palette-input]'), pList = $('[data-palette-list]');
  let matches = COMMANDS, active = 0;
  function paint() {
    const q = pInput.value.trim().toLowerCase();
    matches = COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
    active = Math.min(active, Math.max(0, matches.length - 1));
    pList.innerHTML = matches.length
      ? matches.map((c, i) => `<li role="option" id="pal-${i}" aria-selected="${i === active}" class="${i === active ? 'active' : ''}">${esc(c.label)}</li>`).join('')
      : '<li class="none">No matching commands</li>';
    pInput.setAttribute('aria-activedescendant', matches.length ? `pal-${active}` : '');
  }
  function openPalette() {
    pInput.value = '';
    active = 0;
    paint();
    G.openModal(palette);
    pInput.focus();
  }
  function runActive(i = active) {
    const cmd = matches[i];
    G.closeModal(palette);
    cmd?.run();
  }
  pInput.addEventListener('input', () => { active = 0; paint(); });
  pInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % Math.max(1, matches.length);
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runActive();
    }
  });
  pList.addEventListener('click', (e) => {
    const li = e.target.closest('[role=option]');
    if (li) runActive(Number(li.id.slice(4)));
  });
  $('[data-palette-open]').addEventListener('click', openPalette);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.hidden ? openPalette() : G.closeModal(palette); }
  });

  window.App = {
    meta, esc, href, go,
    view: (route, spec) => views.set(route, spec),
    setGuard: (fn) => { guard = fn; },
    refresh: render,
    setTheme,
  };
  App.view('404', { title: 'Not found', render: (el) => { el.innerHTML = '<h1>Nothing here</h1><p>That workspace page does not exist.</p>'; } });
  document.addEventListener('DOMContentLoaded', render);
})();
