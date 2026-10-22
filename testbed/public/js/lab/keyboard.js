// Lab · Keyboard page scripts.

G.lab('keyboard/command-palette', (id) => {
  const modal = G.$('#kp'), input = G.$('#kp-input'), list = G.$('#kp-list');
  const CMDS = ['Archive all', 'Archive read', 'Mark all as read', 'Mute for an hour', 'Open settings'];
  let hits = CMDS, active = 0;
  const paint = () => {
    hits = CMDS.filter((c) => c.toLowerCase().includes(input.value.toLowerCase()));
    active = Math.min(active, Math.max(0, hits.length - 1));
    list.innerHTML = hits.map((c, i) => `<li role="option" class="${i === active ? 'active' : ''}" aria-selected="${i === active}">${c}</li>`).join('');
  };
  const run = (cmd, e) => { G.closeModal(modal); G.report(id, cmd === 'Archive all' ? 'pass' : 'fail', `ran ${cmd}`, e); G.toast(`Ran: ${cmd}`); };
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.value = ''; active = 0; paint(); G.openModal(modal); input.focus(); }
  });
  input.addEventListener('input', () => { active = 0; paint(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; paint(); }
    if (e.key === 'Enter' && hits[active]) { e.preventDefault(); run(hits[active], e); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) run(li.textContent, e); });
});

G.lab('keyboard/help-shortcut', () => {
  document.addEventListener('keydown', (e) => {
    if (e.key === '?' && !e.target.closest('input, textarea')) G.openModal('help-modal');
  });
});

G.lab('keyboard/sequence', (id) => {
  let last = '', at = 0;
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey) return;
    const now = performance.now();
    if (last === 'g' && now - at < 1000) {
      const panel = { h: 'Home', i: 'Inbox', s: 'Settings' }[e.key];
      if (panel) {
        G.$('#seq-panel').textContent = panel;
        G.report(id, panel === 'Inbox' ? 'pass' : 'fail', `opened ${panel}`, e);
      }
      last = '';
      return;
    }
    last = e.key;
    at = now;
  });
});

G.lab('keyboard/tab-reveal', (id) => {
  G.$('#skip').addEventListener('click', (e) => {
    e.preventDefault();
    G.$('#results').focus();
    G.pass(id, `activated the skip link (${e.detail === 0 ? 'keyboard' : 'pointer'})`, e);
  });
});

G.lab('keyboard/grid', (id) => {
  const cells = G.$$('[data-cell]');
  const at = (c, r) => G.$(`[data-cell="${c}${r}"]`);
  const move = (cell, dc, dr) => {
    const [c, r] = [cell.dataset.cell[0], Number(cell.dataset.cell.slice(1))];
    const next = at(String.fromCharCode(Math.max(65, Math.min(68, c.charCodeAt(0) + dc))), Math.max(1, Math.min(5, r + dr)));
    cells.forEach((x) => { x.tabIndex = x === next ? 0 : -1; });
    next.focus();
  };
  const edit = (cell, initial = cell.textContent) => {
    const input = Object.assign(document.createElement('input'), { value: initial });
    input.setAttribute('aria-label', `Cell ${cell.dataset.cell}`);
    cell.textContent = '';
    cell.append(input);
    input.focus();
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        cell.textContent = input.value;
        if (cell.dataset.cell === 'C3' && input.value.trim() === '42') G.pass(id, 'C3 = 42', e);
        else if (input.value.trim() === '42') G.fail(id, `put 42 in ${cell.dataset.cell}`, e);
        move(cell, 0, 1);
      } else if (e.key === 'Escape') { cell.textContent = initial; cell.focus(); }
    });
  };
  for (const cell of cells) {
    cell.addEventListener('click', () => { cells.forEach((x) => { x.tabIndex = x === cell ? 0 : -1; }); cell.focus(); });
    cell.addEventListener('dblclick', () => edit(cell));
    cell.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d) { e.preventDefault(); move(cell, ...d); }
      else if (e.key === 'Enter') { e.preventDefault(); edit(cell); }
      else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); edit(cell, e.key); }
    });
  }
});

G.lab('keyboard/escape-only', (id) => {
  const m = G.$('#esc-modal');
  G.openModal(m);
  G.$('.modal', m).focus();
  m.addEventListener('modal:close', () => G.pass(id, 'closed with Escape'));
});

G.lab('keyboard/typing-test', (id) => {
  const want = G.$('.phrase').textContent;
  G.$('#tt-check').addEventListener('click', (e) => {
    const got = G.$('#tt').value;
    G.$('#tt-state').textContent = got === want ? 'Perfect.' : 'Not quite: check spacing, case and punctuation.';
    G.report(id, got === want ? 'pass' : 'fail', got === want ? 'exact match' : `typed ${JSON.stringify(got.slice(0, 80))}`, e);
  });
});

G.lab('keyboard/listbox-keys', (id) => {
  const list = G.$('#wp'), opts = G.$$('[role=option]', list);
  let active = 0;
  const select = (i, e) => {
    active = Math.max(0, Math.min(opts.length - 1, i));
    opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === active)));
    list.setAttribute('aria-activedescendant', opts[active].id);
    opts[active].scrollIntoView({ block: 'nearest' });
    if (active === opts.length - 1) G.pass(id, 'selected the last option', e);
  };
  opts.forEach((o, i) => o.addEventListener('click', (e) => select(i, e)));
  list.addEventListener('keydown', (e) => {
    const next = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: opts.length - 1, PageDown: active + 10, PageUp: active - 10 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next, e);
  });
});

G.lab('keyboard/keyboard-only', (id) => {
  const el = G.$('#ko');
  el.addEventListener('click', (e) => { if (e.detail > 0) G.$('#ko-state').textContent = 'Mouse clicks are ignored here. Use Enter or Space.'; });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    G.$('#ko-state').textContent = 'Confirmed.';
    G.pass(id, `activated with ${e.key === ' ' ? 'Space' : 'Enter'}`, e);
  });
});

G.lab('keyboard/save-shortcut', (id) => {
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    const v = G.$('#ss').value.trim();
    G.$('#ss-state').textContent = `Saved at ${new Date().toLocaleTimeString()}.`;
    G.report(id, v === 'draft one' ? 'pass' : 'fail', `saved "${v}"`, e);
  });
});
