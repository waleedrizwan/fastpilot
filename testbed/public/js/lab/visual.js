// Lab · Visual page scripts.

G.lab('visual/red-circle', (id) => {
  const c = G.$('#circles'), ctx = c.getContext('2d');
  const dots = [[90, 90, 40, '#1f6fd1', 'blue'], [230, 180, 46, '#2e7d4f', 'green'], [380, 80, 38, '#c62828', 'red'], [450, 210, 30, '#e0a100', 'yellow'], [150, 220, 28, '#8d7aa8', 'purple']];
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  for (const [x, y, r, col] of dots) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
  c.addEventListener('click', (e) => {
    const b = c.getBoundingClientRect(), x = ((e.clientX - b.left) / b.width) * c.width, y = ((e.clientY - b.top) / b.height) * c.height;
    const hit = dots.find(([cx, cy, r]) => Math.hypot(x - cx, y - cy) <= r);
    G.$('#circles-state').textContent = hit ? `You clicked the ${hit[4]} circle.` : 'Missed every circle.';
    G.report(id, hit?.[4] === 'red' ? 'pass' : 'fail', hit ? `clicked ${hit[4]}` : 'missed', e);
  });
});

G.lab('visual/image-map', (id) => {
  for (const a of G.$$('map area')) {
    a.addEventListener('click', (e) => { e.preventDefault(); G.report(id, a.alt === 'Lake' ? 'pass' : 'fail', `clicked ${a.alt}`, e); });
  }
});

G.lab('visual/svg-shapes', (id) => {
  for (const s of G.$$('[data-shape]')) s.addEventListener('click', (e) => G.report(id, s.dataset.shape === 'triangle' ? 'pass' : 'fail', `clicked the ${s.dataset.shape}`, e));
});

G.lab('visual/dial', (id) => {
  const dial = G.$('#dial'), needle = G.$('#needle');
  let deg = 0;
  dial.addEventListener('pointerdown', (e) => {
    dial.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = dial.getBoundingClientRect();
      deg = Math.round((Math.atan2(ev.clientX - (r.left + r.width / 2), -(ev.clientY - (r.top + r.height / 2))) * 180) / Math.PI + 360) % 360;
      needle.style.transform = `rotate(${deg}deg)`;
      G.$('#dial-state').textContent = `${deg}°`;
    };
    move(e);
    dial.addEventListener('pointermove', move);
    dial.addEventListener('pointerup', (ev) => {
      dial.removeEventListener('pointermove', move);
      G.report(id, Math.abs(deg - 270) <= 8 ? 'pass' : 'fail', `released at ${deg}°`, ev);
    }, { once: true });
  });
});
