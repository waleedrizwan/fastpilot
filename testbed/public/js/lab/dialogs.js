// Lab · Dialogs page scripts.

G.lab('dialogs/alert', (id) => G.$('#alert-btn').addEventListener('click', (e) => {
  alert('Saved! Your trip plan is safe.');
  G.$('#alert-state').textContent = 'Message acknowledged.';
  G.pass(id, 'alert dismissed', e);
}));

G.lab('dialogs/confirm-accept', (id) => G.$('#del-draft').addEventListener('click', (e) => {
  const ok = confirm('Delete “Notes from the ridge”?');
  G.$('#del-state').textContent = ok ? 'Draft deleted.' : 'Kept the draft.';
  G.report(id, ok ? 'pass' : 'fail', ok ? 'confirmed' : 'cancelled', e);
}));

G.lab('dialogs/confirm-dismiss', (id) => G.$('#reset-all').addEventListener('click', (e) => {
  const ok = confirm('Reset every setting to its default?');
  G.$('#reset-state').textContent = ok ? 'Everything was reset.' : 'All settings intact.';
  G.report(id, ok ? 'fail' : 'pass', ok ? 'confirmed the reset' : 'cancelled the reset', e);
}));

G.lab('dialogs/prompt', (id) => G.$('#rename').addEventListener('click', (e) => {
  const name = prompt('New board name', G.$('#board-name').textContent);
  if (name === null) return G.fail(id, 'cancelled the prompt', e);
  G.$('#board-name').textContent = name;
  G.report(id, name.trim() === 'Summit' ? 'pass' : 'fail', `named it "${name}"`, e);
}));

G.lab('dialogs/beforeunload', (id) => {
  const notes = G.$('#bu-notes');
  addEventListener('beforeunload', (e) => { if (notes.value) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('pagehide', () => {
    if (!notes.value) return;
    navigator.sendBeacon('/api/report', new Blob([JSON.stringify({ id, status: 'pass', detail: 'left with unsaved notes', ms: G.elapsed(id) })], { type: 'application/json' }));
  });
});

G.lab('dialogs/custom-modal', (id) => G.$('#cm-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = G.$('#cm-input').value.trim();
  G.$('#cm-name').textContent = v;
  G.closeModal(G.$('#cm'));
  G.report(id, v === 'Kai' ? 'pass' : 'fail', `saved name ${v}`, e);
}));

G.lab('dialogs/nested-modals', (id) => {
  G.$('#adv').addEventListener('modal:close', () => { G.$('#adv-summary').textContent = `Comments: ${G.$('#allow-comments').checked ? 'on' : 'off'}`; });
  G.$('#share-save').addEventListener('click', (e) => {
    const on = G.$('#allow-comments').checked;
    G.closeModal(G.$('#share'));
    G.report(id, on ? 'pass' : 'fail', `saved with comments ${on ? 'on' : 'off'}`, e);
  });
});

G.lab('dialogs/focus-trap', (id) => G.$('#fb-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const r = G.$('#fb-rating').value, t = G.$('#fb-text').value.trim();
  G.closeModal(G.$('#fb'));
  G.report(id, r === '5' && t === 'Great views' ? 'pass' : 'fail', `rating ${r}, "${t}"`, e);
}));

G.lab('dialogs/sticky-modal', (id) => {
  const m = G.$('#safety');
  G.openModal(m);
  G.$('#understand').addEventListener('change', (e) => { G.$('#safety-go').disabled = !e.target.checked; });
  G.$('#safety-go').addEventListener('click', (e) => { G.closeModal(m); G.pass(id, 'acknowledged the notice', e); });
});

G.lab('dialogs/dialog-element', (id) => {
  const d = G.$('#dlg');
  G.$('#dlg-open').addEventListener('click', () => d.showModal());
  d.addEventListener('close', () => {
    G.$('#dlg-state').textContent = d.returnValue === 'keep' ? 'Draft kept.' : d.returnValue === 'discard' ? 'Draft discarded.' : 'Dialog closed.';
    G.report(id, d.returnValue === 'keep' ? 'pass' : 'fail', `closed with "${d.returnValue || 'Escape'}"`);
  });
});

G.lab('dialogs/undo-toast', (id) => {
  const list = G.$('#photos');
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-delete]')?.closest('li');
    if (!li) return;
    const next = li.nextSibling, name = li.dataset.photo;
    li.remove();
    const t = G.toast(`Deleted ${name}. `, { ms: 5000 });
    const undo = Object.assign(document.createElement('button'), { type: 'button', className: 'small secondary', textContent: 'Undo' });
    undo.addEventListener('click', (ev) => {
      list.insertBefore(li, next);
      t.remove();
      G.report(id, name === 'Larch Lake' ? 'pass' : 'fail', `restored ${name}`, ev);
    });
    t.append(undo);
  });
});

G.lab('dialogs/drawer', (id) => {
  const d = G.$('#drawer'), open = G.$('#drawer-open');
  const set = (on) => { d.hidden = !on; d.classList.toggle('open', on); open.setAttribute('aria-expanded', String(on)); };
  open.addEventListener('click', () => set(true));
  G.$('#drawer-close').addEventListener('click', () => set(false));
  G.$('#drawer-apply').addEventListener('click', (e) => {
    const on = G.$$('input:checked', d).map((i) => i.value);
    set(false);
    G.$('#drawer-state').textContent = on.length ? `Filtered by ${on.join(', ')}: 11 campsites.` : 'Showing all 42 campsites.';
    G.report(id, on.join() === 'Dogs allowed' ? 'pass' : 'fail', `applied ${on.join(', ') || 'no filters'}`, e);
  });
});
