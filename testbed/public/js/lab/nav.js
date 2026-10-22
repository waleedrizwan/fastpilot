// Lab · Navigation page scripts.

G.lab('nav/push-state', (id) => {
  const BODY = { overview: 'Overview: 3 active trips.', billing: 'Billing: next invoice on 1 November.', usage: 'Usage: 42 GPX downloads this month.' };
  let visitedBilling = false;
  const show = (tab, e) => {
    G.$$('[data-tab]').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    G.$('#tab-body').innerHTML = `<p>${BODY[tab]}</p>`;
    if (tab === 'billing') visitedBilling = true;
    if (e?.type === 'popstate' && tab === 'overview' && visitedBilling) G.pass(id, 'returned to Overview with Back', e);
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tab]');
    if (!a) return;
    e.preventDefault();
    history.pushState({ tab: a.dataset.tab }, '', `?tab=${a.dataset.tab}`);
    show(a.dataset.tab, e);
  });
  addEventListener('popstate', (e) => show(new URLSearchParams(location.search).get('tab') ?? 'overview', e));
  show(new URLSearchParams(location.search).get('tab') ?? 'overview');
});

G.lab('nav/js-links', (id) => {
  G.$('#js-next').addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('main p').textContent = 'Results 11–20 of 30.';
    G.pass(id, 'went to the next page', e);
  });
  G.$('#js-prev').addEventListener('click', (e) => G.fail(id, 'pressed Previous', e));
});
