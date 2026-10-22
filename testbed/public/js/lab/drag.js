// Lab · Drag & drop page scripts.

const order = (list) => G.$$('li', list).map((li) => li.textContent.replace('⠿', '').trim());

G.lab('drag/html5-reorder', (id) => {
  const list = G.$('#h5');
  let dragging = null;
  list.addEventListener('dragstart', (e) => { dragging = e.target.closest('li'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragging.textContent); dragging.classList.add('dragging'); });
  list.addEventListener('dragend', () => dragging?.classList.remove('dragging'));
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const over = e.target.closest('li');
    if (!over || over === dragging) return;
    const r = over.getBoundingClientRect();
    over.parentNode.insertBefore(dragging, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
  });
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    const o = order(list);
    G.report(id, o[0] === 'Tent' ? 'pass' : 'fail', `order: ${o.join(', ')}`, e);
  });
});

G.lab('drag/pointer-sortable', (id) => {
  const list = G.$('#ps');
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    li.classList.add('dragging');
    const move = (ev) => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#ps li');
      if (!over || over === li) return;
      const r = over.getBoundingClientRect();
      list.insertBefore(li, ev.clientY < r.top + r.height / 2 ? over : over.nextSibling);
    };
    const up = (ev) => {
      li.classList.remove('dragging');
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      const o = order(list);
      if (o.indexOf('Stove') === o.indexOf('Sleeping bag') + 1) G.pass(id, `order: ${o.join(', ')}`, ev);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
});

G.lab('drag/drop-target', (id) => {
  const ticket = G.$('#ticket'), scanner = G.$('#scanner');
  ticket.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', 'ticket'));
  scanner.addEventListener('dragover', (e) => { e.preventDefault(); scanner.classList.add('over'); });
  scanner.addEventListener('dragleave', () => scanner.classList.remove('over'));
  scanner.addEventListener('drop', (e) => {
    e.preventDefault();
    scanner.classList.remove('over');
    if (e.dataTransfer.getData('text/plain') !== 'ticket') return;
    scanner.append(ticket);
    G.$('#scan-state').textContent = 'Ticket scanned. Welcome aboard!';
    G.pass(id, 'ticket scanned', e);
  });
});

G.lab('drag/handle-only', (id) => {
  const track = G.$('#dt'), handle = G.$('.drag-handle', track), fill = G.$('.drag-fill', track);
  let pct = 0;
  const paint = () => { handle.style.left = `${pct}%`; fill.style.width = `${pct}%`; G.$('#dt-out').textContent = `${pct}%`; };
  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => { const r = track.getBoundingClientRect(); pct = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 100); paint(); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', (ev) => {
      handle.removeEventListener('pointermove', move);
      G.report(id, Math.abs(pct - 75) <= 3 ? 'pass' : 'fail', `released at ${pct}%`, ev);
    }, { once: true });
  });
  paint();
});

G.lab('drag/splitter', (id) => {
  const sd = G.$('#sd'), gutter = G.$('.gutter', sd);
  gutter.addEventListener('pointerdown', (e) => {
    gutter.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = sd.getBoundingClientRect(), p = Math.round(Math.max(10, Math.min(90, ((ev.clientX - r.left) / r.width) * 100)));
      sd.style.gridTemplateColumns = `${p}% 10px 1fr`;
      G.$('#sd-out').textContent = `Left: ${p}%`;
      if (p >= 70) G.pass(id, `left pane ${p}%`, ev);
    };
    gutter.addEventListener('pointermove', move);
    gutter.addEventListener('pointerup', () => gutter.removeEventListener('pointermove', move), { once: true });
  });
});

G.lab('drag/canvas-draw', (id) => {
  const c = G.$('#draw'), ctx = c.getContext('2d');
  const A = [30, 90, 70, 60], B = [420, 90, 70, 60];
  const reset = () => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#2e7d4f'; ctx.fillRect(...A);
    ctx.fillStyle = '#1f6fd1'; ctx.fillRect(...B);
  };
  reset();
  const pos = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height]; };
  const inside = ([x, y], [bx, by, bw, bh]) => x >= bx && x <= bx + bw && y >= by && y <= by + bh;
  c.addEventListener('pointerdown', (e) => {
    c.setPointerCapture(e.pointerId);
    const start = pos(e);
    ctx.strokeStyle = '#b3261e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(...start);
    let n = 0;
    const move = (ev) => { ctx.lineTo(...pos(ev)); ctx.stroke(); n++; };
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', (ev) => {
      c.removeEventListener('pointermove', move);
      const ok = inside(start, A) && inside(pos(ev), B) && n > 2;
      G.$('#draw-state').textContent = ok ? 'Connected!' : 'Start in the green box and finish in the blue one.';
      G.report(id, ok ? 'pass' : 'fail', ok ? 'line connects the boxes' : 'line did not connect the boxes', ev);
    }, { once: true });
  });
  G.$('#draw-clear').addEventListener('click', reset);
});

G.lab('drag/map-pan', () => {
  const map = G.$('#map'), inner = G.$('#map-inner');
  let x = 0, y = 0;
  map.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.marker')) return;
    map.setPointerCapture(e.pointerId);
    const sx = e.clientX - x, sy = e.clientY - y;
    const move = (ev) => { x = Math.min(0, Math.max(-900, ev.clientX - sx)); y = Math.min(0, Math.max(-400, ev.clientY - sy)); inner.style.transform = `translate(${x}px, ${y}px)`; };
    map.addEventListener('pointermove', move);
    map.addEventListener('pointerup', () => map.removeEventListener('pointermove', move), { once: true });
  });
});
