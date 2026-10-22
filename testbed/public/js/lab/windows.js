// Lab · Windows & tabs page scripts, including the pages opened in other windows.

G.lab('windows/page-permit', () => G.$('#permit-confirm').addEventListener('click', (e) => {
  G.$('#permit-state').textContent = 'Permit confirmed. You can close this tab.';
  G.pass('lab/windows/new-tab', 'confirmed in the new tab', e);
}));

G.lab('windows/popup', () => G.$('#popup-open').addEventListener('click', () => {
  const w = window.open('/lab/windows/page/terms', 'terms', 'width=480,height=420');
  G.$('#popup-state').textContent = w ? 'Popup opened.' : 'The popup was blocked.';
}));
G.lab('windows/page-terms', () => {
  const done = (status, detail) => (e) => {
    (window.opener?.G ?? G).report('lab/windows/popup', status, detail, e);
    setTimeout(() => window.close(), 300);
  };
  G.$('#t-approve').addEventListener('click', done('pass', 'approved in the popup'));
  G.$('#t-decline').addEventListener('click', done('fail', 'declined in the popup'));
});

G.lab('windows/oauth-popup', (id) => {
  const btn = G.$('#oauth-open'), other = btn.dataset.other;
  btn.addEventListener('click', () => window.open(`${other}/x/oauth?origin=${encodeURIComponent(location.origin)}`, 'pinecone', 'width=460,height=520'));
  addEventListener('message', (e) => {
    if (e.origin !== other || e.data?.type !== 'pinecone-oauth') return;
    G.$('#oauth-state').textContent = e.data.allowed ? 'connected' : 'access denied';
    G.report(id, e.data.allowed ? 'pass' : 'fail', e.data.allowed ? 'access allowed' : 'access denied', { isTrusted: e.data.trusted });
  });
});

G.lab('windows/round-trip', (id) => G.$('#rt').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = Number(G.$('#rt-price').value.replace(/[$,\s]/g, ''));
  G.report(id, v === 189 ? 'pass' : 'fail', `entered ${G.$('#rt-price').value}`, e);
}));

G.lab('windows/print', (id) => {
  addEventListener('afterprint', () => G.pass(id, 'print dialog completed'));
  G.$('#print').addEventListener('click', () => window.print());
});
