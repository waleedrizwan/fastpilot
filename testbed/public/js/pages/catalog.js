// Challenge catalog: filtering and copying tasks.

(() => {
  const { $, $$ } = G;
  const text = $('#cat-filter'), area = $('#area-filter'), only = $('#only-supported');
  function apply() {
    const q = text.value.trim().toLowerCase();
    for (const section of $$('.catalog-area')) {
      const areaOk = !area.value || section.dataset.area === area.value;
      let shown = 0;
      for (const row of $$('tbody tr', section)) {
        const ok = areaOk && (!only.checked || row.dataset.supported === '1') && (!q || row.textContent.toLowerCase().includes(q));
        row.hidden = !ok;
        if (ok) shown++;
      }
      section.hidden = !shown;
    }
  }
  [text, area, only].forEach((el) => el.addEventListener('input', apply));
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      G.toast('Task copied');
    } catch {
      G.toast('Copy failed; select the task text instead');
    }
  });
})();
