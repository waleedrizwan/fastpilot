// Dashboard: KPI cards for a date range, a canvas bar chart, and a live feed over Server-Sent Events.

App.view('', {
  title: 'Dashboard',
  async render(el) {
    const { revenue, months } = App.meta;
    const RANGES = [['7d', 'Last 7 days', 0.08], ['30d', 'Last 30 days', 0.3], ['90d', 'Last 90 days', 0.85], ['12m', 'Last 12 months', 3.4]];
    el.innerHTML = `<div class="view-head"><h1>Dashboard</h1>
        <div class="seg-buttons" role="group" aria-label="Date range">${RANGES.map(([id, label], i) => `<button type="button" data-range="${id}" aria-pressed="${i === 1}">${label}</button>`).join('')}</div>
        <details class="custom-range"><summary>Custom range</summary>
          <div class="row"><label class="inline">From <input type="date" data-from value="2026-09-01"></label><label class="inline">To <input type="date" data-to value="2026-09-30"></label><button type="button" class="small" data-apply-range>Apply</button></div>
        </details></div>
      <p class="muted" data-range-label>Showing the last 30 days</p>
      <div class="kpis" data-kpis></div>
      <div class="grid-2 dash-grid">
        <section class="card"><h2>Monthly revenue (thousands)</h2><canvas width="560" height="280" data-chart role="img" aria-label="Bar chart of monthly revenue"></canvas></section>
        <section class="card"><h2>Live activity <span class="live-dot" aria-hidden="true"></span></h2><ol class="feed" data-feed aria-live="off"></ol></section>
      </div>`;
    const kpis = el.querySelector('[data-kpis]');
    const paint = (factor) => {
      const vals = [['Revenue', `$${Math.round(612 * factor * 1000).toLocaleString('en-US')}`], ['Orders', Math.round(1830 * factor).toLocaleString('en-US')],
        ['Visitors', Math.round(48200 * factor).toLocaleString('en-US')], ['Conversion', `${(3.8 - factor * 0.2).toFixed(1)}%`]];
      kpis.innerHTML = vals.map(([k, v]) => `<div class="kpi card"><span class="muted">${k}</span><strong>${v}</strong></div>`).join('');
    };
    paint(0.3);
    el.querySelector('[role=group]').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-range]');
      if (!b) return;
      el.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const r = RANGES.find(([id]) => id === b.dataset.range);
      paint(r[2]);
      el.querySelector('[data-range-label]').textContent = `Showing the ${r[1].toLowerCase()}`;
      await G.api('/api/app/range', { range: r[0] });
    });
    el.querySelector('[data-apply-range]').addEventListener('click', () => {
      const from = el.querySelector('[data-from]').value, to = el.querySelector('[data-to]').value;
      if (!from || !to || from > to) return G.toast('Choose a start date before the end date');
      el.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      const days = (new Date(to) - new Date(from)) / 864e5 + 1;
      paint(days / 100);
      el.querySelector('[data-range-label]').textContent = `Showing ${from} to ${to}`;
    });

    // Bar chart drawn on a canvas, so its numbers only exist as pixels.
    const canvas = el.querySelector('[data-chart]');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, pad = 34, max = 100;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#66706b';
    ctx.strokeStyle = '#dcd8cf';
    for (let v = 0; v <= max; v += 25) {
      const y = H - pad - (v / max) * (H - pad * 2);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - 8, y); ctx.stroke();
      ctx.fillText(String(v), 6, y + 4);
    }
    const bw = (W - pad - 16) / months.length;
    months.forEach((m, i) => {
      const x = pad + i * bw + 6, v = revenue[i], bh = (v / max) * (H - pad * 2);
      ctx.fillStyle = i === 6 ? '#e0662f' : '#2f5d3a';
      if (v) ctx.fillRect(x, H - pad - bh, bw - 12, bh);
      ctx.fillStyle = '#1e2422';
      if (v) ctx.fillText(String(v), x + (bw - 12) / 2 - 7, H - pad - bh - 6);
      ctx.fillStyle = '#66706b';
      ctx.fillText(m, x + (bw - 12) / 2 - 10, H - pad + 16);
    });

    const feed = el.querySelector('[data-feed]');
    const source = new EventSource('/api/stream?every=2000');
    source.onmessage = (e) => {
      const d = JSON.parse(e.data);
      const li = document.createElement('li');
      li.innerHTML = `<span>${App.esc(d.text)}</span><time>${new Date(d.at).toLocaleTimeString()}</time>`;
      feed.prepend(li);
      while (feed.children.length > 8) feed.lastChild.remove();
    };
    return { cleanup: () => source.close() };
  },
});
