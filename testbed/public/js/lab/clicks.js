// Lab · Clicks page scripts.

G.lab('clicks/listener-div', (id) => {
  G.$('#vault').addEventListener('click', (e) => {
    G.$('#vault-state').textContent = 'Vault is open.';
    G.pass(id, 'opened the vault', e);
  });
});

G.lab('clicks/pointerdown', (id) => {
  const el = G.$('#engine');
  el.addEventListener('pointerdown', (e) => {
    G.$('#engine-state').textContent = 'Engine running.';
    G.pass(id, 'pointerdown received', e);
  });
  el.addEventListener('click', (e) => { if (!e.isTrusted) G.$('#engine-state').textContent = 'A synthetic click arrived, but this control only listens for pointerdown.'; });
});

G.lab('clicks/mousedown', (id) => {
  const el = G.$('#gate');
  el.addEventListener('mousedown', (e) => {
    G.$('#gate-state').textContent = 'The gate is open.';
    G.pass(id, 'mousedown received', e);
  });
});

G.lab('clicks/trusted', (id) => {
  G.$('#trusted').addEventListener('click', (e) => {
    if (!e.isTrusted) {
      G.$('#trusted-state').textContent = 'That click came from a script, not a real pointer.';
      return G.fail(id, 'synthetic click rejected', e);
    }
    G.$('#trusted-state').textContent = 'Verified.';
    G.pass(id, 'trusted click', e);
  });
});

G.lab('clicks/covered', () => {
  G.$('[data-close-cover]').addEventListener('click', () => G.$('#cover-pop').remove());
});

G.lab('clicks/moving', () => {
  const btn = G.$('#catch');
  const run = () => {
    btn.classList.remove('arrived');
    void btn.offsetWidth;
    setTimeout(() => btn.classList.add('arrived'), 50);
  };
  run();
  G.$('#replay').addEventListener('click', run);
});

G.lab('clicks/delayed', () => {
  setTimeout(() => {
    G.$('#offer-state').textContent = 'We found an offer: 20% off your next rental.';
    G.$('#offer').innerHTML = '<button type="button" class="secondary" data-fail="declined">No thanks</button> <button type="button" data-pass="accepted after the delay">Accept offer</button>';
  }, 3000);
});

G.lab('clicks/enabled-when-valid', (id) => {
  const f = G.$('#valid-form'), name = G.$('#vf-name'), email = G.$('#vf-email'), btn = G.$('#vf-create');
  f.addEventListener('input', () => { btn.disabled = !(name.value.trim() && /^\S+@\S+\.\S+$/.test(email.value)); });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = name.value.trim() === 'Jo' && email.value.trim() === 'jo@example.com';
    G.report(id, ok ? 'pass' : 'fail', `created ${name.value} <${email.value}>`, e);
  });
});

G.lab('clicks/corner-bubble', () => {
  const b = G.$('#bubble'), panel = G.$('#bubble-panel');
  b.addEventListener('click', () => { panel.hidden = !panel.hidden; b.setAttribute('aria-expanded', String(!panel.hidden)); });
});

G.lab('clicks/dblclick', (id) => {
  for (const f of G.$$('[data-folder]')) {
    f.addEventListener('click', () => { G.$$('.folder').forEach((x) => x.classList.toggle('selected', x === f)); });
    f.addEventListener('dblclick', (e) => {
      G.$('#folder-state').textContent = `Opened ${f.dataset.folder}.`;
      G.report(id, f.dataset.folder === 'Trip photos' ? 'pass' : 'fail', `opened ${f.dataset.folder}`, e);
    });
  }
});

G.lab('clicks/context-menu', (id) => {
  const menu = G.$('#file-menu');
  let target = null;
  document.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('[data-file]');
    if (!li) return;
    e.preventDefault();
    target = li;
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    menu.hidden = false;
    G.$('button', menu).focus();
  });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });
  menu.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act || !target) return;
    menu.hidden = true;
    if (act === 'delete') { G.fail(id, `deleted ${target.dataset.file}`, e); target.remove(); return; }
    const span = G.$('span', target);
    const input = Object.assign(document.createElement('input'), { value: target.dataset.file, ariaLabel: 'New file name' });
    span.replaceWith(input);
    input.focus();
    input.select();
    input.addEventListener('keydown', (k) => {
      if (k.key !== 'Enter') return;
      const from = target.dataset.file, to = input.value.trim();
      target.dataset.file = to;
      input.replaceWith(Object.assign(document.createElement('span'), { textContent: to }));
      G.report(id, from === 'report.pdf' && to === 'summary.pdf' ? 'pass' : 'fail', `renamed ${from} to ${to}`, k);
    });
  });
});

G.lab('clicks/long-press', (id) => {
  const btn = G.$('#record'), bar = G.$('#hold-bar'), state = G.$('#record-state');
  let start = 0, raf = 0;
  const tick = () => {
    const held = performance.now() - start;
    bar.style.width = `${Math.min(100, held / 10)}%`;
    if (held < 1000) raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('pointerdown', () => { start = performance.now(); tick(); });
  const end = (e) => {
    if (!start) return;
    cancelAnimationFrame(raf);
    const held = Math.round(performance.now() - start);
    start = 0;
    bar.style.width = '0';
    if (held >= 1000) { state.textContent = `Recorded ${held} ms.`; G.pass(id, `held for ${held} ms`, e); }
    else { state.textContent = `Too short (${held} ms). Hold for at least a second.`; G.fail(id, `held only ${held} ms`, e); }
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointerleave', end);
});

G.lab('clicks/modifier-click', (id) => {
  const items = G.$$('.selectable li');
  for (const li of items) {
    li.addEventListener('click', (e) => {
      const add = e.metaKey || e.ctrlKey;
      if (!add) items.forEach((x) => x.setAttribute('aria-selected', 'false'));
      li.setAttribute('aria-selected', String(!(add && li.getAttribute('aria-selected') === 'true')));
      const chosen = items.filter((x) => x.getAttribute('aria-selected') === 'true').map((x) => x.textContent);
      G.$('#sel-state').textContent = chosen.length ? `Selected: ${chosen.join(', ')}` : 'Nothing selected.';
      if (chosen.join() === 'Apple,Cherry,Elderberry') G.pass(id, 'selected all three', e);
    });
  }
});

G.lab('clicks/middle-click', (id) => {
  const link = G.$('#bg-link');
  link.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); G.pass(id, 'middle-clicked', e); } });
  link.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
  link.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey) { e.preventDefault(); G.pass(id, 'opened in background with a modifier', e); return; }
    G.fail(id, 'plain click', e);
  });
});

G.lab('clicks/canvas-spot', (id) => {
  const c = G.$('#target'), ctx = c.getContext('2d');
  const cx = 342, cy = 118;
  ctx.fillStyle = '#f6f4ef';
  ctx.fillRect(0, 0, c.width, c.height);
  [[46, '#b3261e'], [34, '#fff'], [22, '#b3261e'], [10, '#fff']].forEach(([r, color]) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); });
  c.addEventListener('click', (e) => {
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * c.width, y = ((e.clientY - r.top) / r.height) * c.height;
    const d = Math.round(Math.hypot(x - cx, y - cy));
    G.$('#target-state').textContent = `Hit ${d}px from the center.`;
    G.report(id, d <= 12 ? 'pass' : 'fail', `${d}px from the center`, e);
  });
});

G.lab('clicks/duplicate-delete', (id) => {
  G.$('.dup-table').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const row = b.closest('tr');
    row.remove();
    const left = G.$$('[data-row]').map((r) => r.dataset.row);
    if (row.dataset.row !== 'Beta') G.fail(id, `deleted ${row.dataset.row}`, e);
    else if (left.join() === 'Alpha,Gamma,Delta') G.pass(id, 'deleted Beta only', e);
  });
});
