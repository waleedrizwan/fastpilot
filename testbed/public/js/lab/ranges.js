// Lab · Ranges & dates page scripts.

/** A keyboard- and pointer-driven slider made of divs. */
function cslider(root, { step = 5, min = 0, max = 100, onChange }) {
  const track = G.$('.track', root), thumbs = G.$$('.thumb', root), fill = G.$('.fill', root);
  const val = (t) => Number(t.getAttribute('aria-valuenow'));
  const paint = () => {
    const vs = thumbs.map(val), lo = thumbs.length > 1 ? vs[0] : min, hi = vs.at(-1);
    thumbs.forEach((t, i) => { t.style.left = `${((vs[i] - min) / (max - min)) * 100}%`; });
    fill.style.left = `${((lo - min) / (max - min)) * 100}%`;
    fill.style.width = `${((hi - lo) / (max - min)) * 100}%`;
  };
  const set = (t, v, e) => {
    const i = thumbs.indexOf(t);
    const lo = i > 0 ? val(thumbs[i - 1]) : min, hi = i < thumbs.length - 1 ? val(thumbs[i + 1]) : max;
    v = Math.max(lo, Math.min(hi, Math.round(v / step) * step));
    t.setAttribute('aria-valuenow', String(v));
    t.setAttribute('aria-valuetext', String(v));
    paint();
    onChange(thumbs.map(val), e);
  };
  for (const t of thumbs) {
    t.addEventListener('keydown', (e) => {
      const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 4, PageDown: -step * 4 }[e.key];
      if (e.key === 'Home') { e.preventDefault(); return set(t, min, e); }
      if (e.key === 'End') { e.preventDefault(); return set(t, max, e); }
      if (d === undefined) return;
      e.preventDefault();
      set(t, val(t) + d, e);
    });
    t.addEventListener('pointerdown', (e) => {
      t.setPointerCapture(e.pointerId);
      t.focus();
      const move = (ev) => {
        const r = track.getBoundingClientRect();
        set(t, min + ((ev.clientX - r.left) / r.width) * (max - min), ev);
      };
      t.addEventListener('pointermove', move);
      t.addEventListener('pointerup', () => t.removeEventListener('pointermove', move), { once: true });
    });
  }
  track.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.thumb')) return;
    const r = track.getBoundingClientRect(), v = min + ((e.clientX - r.left) / r.width) * (max - min);
    const nearest = thumbs.reduce((a, b) => (Math.abs(val(a) - v) <= Math.abs(val(b) - v) ? a : b));
    set(nearest, v, e);
    nearest.focus();
  });
  paint();
}

G.lab('ranges/native-range', (id) => {
  const r = G.$('#temp');
  r.addEventListener('input', () => { G.$('#temp-out').textContent = r.value; });
  G.$('#temp-set').addEventListener('click', (e) => G.report(id, r.value === '37' ? 'pass' : 'fail', `set to ${r.value}`, e));
});

G.lab('ranges/aria-slider', (id) => cslider(G.$('#vol'), {
  onChange: ([v], e) => { G.$('#vol-out').textContent = `${v}%`; if (v === 80) G.pass(id, 'volume 80', e); },
}));

G.lab('ranges/dual-thumb', (id) => {
  let vals = [0, 500];
  cslider(G.$('#pr'), { step: 25, max: 500, onChange: (v) => { vals = v; G.$('#pr-out').textContent = `$${v[0]} – $${v[1]}`; } });
  G.$('#pr-apply').addEventListener('click', (e) => G.report(id, vals[0] === 100 && vals[1] === 300 ? 'pass' : 'fail', `$${vals[0]}–$${vals[1]}`, e));
});

const formCheck = (id, sel, read, want) => G.$(sel).addEventListener('submit', (e) => {
  e.preventDefault();
  const got = read();
  G.report(id, got === want ? 'pass' : 'fail', `saved ${got || '(empty)'}`, e);
});
G.lab('ranges/date-input', (id) => formCheck(id, '#date-form', () => G.$('#start').value, '2026-12-24'));
G.lab('ranges/time-input', (id) => formCheck(id, '#time-form', () => G.$('#alarm').value, '06:45'));
G.lab('ranges/datetime-input', (id) => formCheck(id, '#dt-form', () => G.$('#when').value, '2026-11-05T14:30'));
G.lab('ranges/month-week', (id) => formCheck(id, '#mw-form', () => `${G.$('#bill').value} ${G.$('#sprint').value}`, '2027-03 2027-W09'));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
/** Renders a month grid into el; onPick gets an ISO date. */
function monthGrid(el, state, onPick, mark = () => '') {
  const { y, m } = state;
  const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  el.innerHTML = `<div class="dp-head"><button type="button" class="icon-btn" data-dp="-1" aria-label="Previous month">‹</button>
    <strong>${MONTHS[m]} ${y}</strong><button type="button" class="icon-btn" data-dp="1" aria-label="Next month">›</button></div>
    <div class="dp-grid">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<span class="dow">${d}</span>`).join('')}${'<span></span>'.repeat(first)}
    ${Array.from({ length: days }, (_, i) => { const iso = `${y}-${pad(m + 1)}-${pad(i + 1)}`; return `<button type="button" class="dp-day ${mark(iso)}" data-day="${iso}" aria-label="${MONTHS[m]} ${i + 1}, ${y}">${i + 1}</button>`; }).join('')}</div>`;
  el.onclick = (e) => {
    const nav = e.target.closest('[data-dp]');
    if (nav) {
      e.stopPropagation();
      state.m += Number(nav.dataset.dp);
      if (state.m < 0) { state.m = 11; state.y--; }
      if (state.m > 11) { state.m = 0; state.y++; }
      return monthGrid(el, state, onPick, mark);
    }
    const day = e.target.closest('[data-day]');
    if (day) onPick(day.dataset.day, e);
  };
}

G.lab('ranges/calendar', (id) => {
  const input = G.$('#cal-input'), pop = G.$('#cal-pop'), state = { y: 2026, m: 9 };
  let picked = '';
  input.addEventListener('click', () => { pop.hidden = !pop.hidden; if (!pop.hidden) monthGrid(pop, state, pick); });
  function pick(iso) {
    picked = iso;
    const [y, m, d] = iso.split('-').map(Number);
    input.value = `${MONTHS[m - 1]} ${d}, ${y}`;
    pop.hidden = true;
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.ac-wrap')) pop.hidden = true; });
  G.$('#cal-confirm').addEventListener('click', (e) => G.report(id, picked === '2027-01-15' ? 'pass' : 'fail', `picked ${picked || 'nothing'}`, e));
});

G.lab('ranges/date-range', (id) => {
  const el = G.$('#rg-cal'), state = { y: 2026, m: 9 };
  let start = '', end = '';
  const mark = (iso) => (iso === start || iso === end ? 'sel' : start && end && iso > start && iso < end ? 'between' : '');
  const pick = (iso) => {
    if (!start || end || iso < start) { start = iso; end = ''; } else end = iso;
    G.$('#rg-out').textContent = start && end ? `${start} → ${end}` : `Start: ${start}. Now pick the end day.`;
    monthGrid(el, state, pick, mark);
  };
  monthGrid(el, state, pick, mark);
  G.$('#rg-apply').addEventListener('click', (e) => G.report(id, start === '2026-11-03' && end === '2026-11-09' ? 'pass' : 'fail', `${start || '?'} → ${end || '?'}`, e));
});

G.lab('ranges/color', (id) => {
  const c = G.$('#marker'), out = G.$('#swatch-out');
  const paint = () => { out.textContent = c.value; out.style.background = c.value; };
  c.addEventListener('input', paint);
  paint();
  G.$('#color-form').addEventListener('submit', (e) => {
    e.preventDefault();
    G.report(id, c.value.toLowerCase() === '#2f5d3a' ? 'pass' : 'fail', `saved ${c.value}`, e);
  });
});
