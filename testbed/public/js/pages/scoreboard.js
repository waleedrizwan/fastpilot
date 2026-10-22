// Scoreboard: live refresh, filters, reset and manual marking.

(() => {
  const { $, $$ } = G;
  const filter = $('#sb-filter'), live = $('#sb-live');

  function apply() {
    const f = filter.value;
    for (const section of $$('.sb-area')) {
      let shown = 0;
      for (const row of $$('tbody tr', section)) {
        const s = row.dataset.status;
        const ok = !f || (f === 'attempted' ? row.dataset.attempts !== '0' : f === 'supported' ? row.dataset.supported === '1'
          : f === 'gap' ? row.dataset.supported === '0' : s === f);
        row.hidden = !ok;
        if (ok) shown++;
      }
      section.hidden = !shown;
    }
  }
  filter.addEventListener('input', apply);

  // Reloads when results change, keeping the filter and scroll position.
  let last = '';
  async function poll() {
    if (!live.checked || document.hidden) return;
    const data = await G.api('/api/results');
    const sig = JSON.stringify(data.challenges.map((c) => [c.id, c.result.attempts.length, c.result.status]));
    if (last && sig !== last) {
      sessionStorage.setItem('sb-state', JSON.stringify({ f: filter.value, y: scrollY }));
      location.reload();
    }
    last = sig;
  }
  try {
    const st = JSON.parse(sessionStorage.getItem('sb-state') ?? 'null');
    if (st) { filter.value = st.f; scrollTo(0, st.y); sessionStorage.removeItem('sb-state'); }
  } catch {}
  apply();
  poll();
  setInterval(poll, 3000);

  document.addEventListener('click', async (e) => {
    const row = e.target.closest('tr[data-id]');
    const mark = e.target.closest('[data-mark]');
    if (mark && row) { await G.api('/api/results/mark', { id: row.dataset.id, status: mark.dataset.mark }); location.reload(); }
    if (e.target.closest('[data-reset]') && row) { await G.api('/api/results/reset', { id: row.dataset.id }); location.reload(); }
  });
  $('#sb-reset-all').addEventListener('click', async () => {
    if (!confirm('Reset every result? This cannot be undone.')) return;
    await G.api('/api/results/reset', {});
    location.reload();
  });
  $('#sb-reset-site').addEventListener('click', async () => {
    if (!confirm('Empty all carts, restore seeded orders and tickets, and sign everyone out?')) return;
    await G.api('/api/reset-site', {});
    G.toast('Site data reset');
  });
})();
