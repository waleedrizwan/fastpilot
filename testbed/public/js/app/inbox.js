// Inbox: 10,000 generated messages in a virtualized list (only visible rows are
// in the DOM), a resizable reading pane, search, and j/k/e keyboard shortcuts.

App.view('inbox', {
  title: 'Inbox',
  async render(el) {
    const { esc } = App;
    const FIRST = ['Alex', 'Bea', 'Chen', 'Dara', 'Eli', 'Femi', 'Gus', 'Hana', 'Ivo', 'Jun', 'Kira', 'Luis', 'Mae', 'Nico', 'Oona', 'Pia'];
    const LAST = ['Adams', 'Brooks', 'Cole', 'Diaz', 'Evans', 'Ford', 'Gray', 'Hill', 'Ito', 'Jones', 'Khan', 'Lee'];
    const SUBJECTS = ['Weekly sync notes', 'Invoice attached', 'Trail conditions update', 'Re: gear order', 'Lunch on Friday?', 'Volunteer shifts', 'Map corrections',
      'Photos from the trip', 'Budget question', 'Warehouse schedule', 'New hire intro', 'Re: packing list', 'Shipping delay', 'Survey results'];
    const N = 10000, ROW = 56, special = App.meta.special;
    const base = Date.UTC(2026, 9, 21, 9, 0);
    const msg = (i) => i === special
      ? { id: i, from: 'Rosa Diaz', subject: 'Permit renewal', body: 'Hi team, our group camping permit expires at the end of the month. Can someone renew it?', at: base - i * 3.6e6 }
      : { id: i, from: `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`, subject: `${SUBJECTS[(i * 11) % SUBJECTS.length]}`, body: `Message ${i + 1}. Nothing urgent here.`, at: base - i * 3.6e6 };
    let archived = new Set(await G.api('/api/app/inbox/archived'));
    let q = '', ids = [], selected = null;

    el.innerHTML = `<div class="view-head"><h1>Inbox</h1><p class="muted small">Shortcuts: <kbd>j</kbd>/<kbd>k</kbd> move, <kbd>e</kbd> archive, <kbd>/</kbd> search.</p></div>
      <div class="toolbar"><input type="search" placeholder="Search mail" aria-label="Search mail" data-search><span class="muted small" data-count></span></div>
      <div class="split" data-split>
        <div class="mail-scroller" tabindex="0" aria-label="Messages" data-scroller><div class="mail-spacer" data-spacer></div></div>
        <div class="splitter" role="separator" aria-orientation="vertical" aria-label="Resize panes" tabindex="0" aria-valuenow="45" aria-valuemin="20" aria-valuemax="80" data-splitter></div>
        <article class="reader" data-reader><p class="muted">Select a message to read it.</p></article>
      </div>`;
    const $ = (s) => el.querySelector(s);
    const scroller = $('[data-scroller]'), spacer = $('[data-spacer]'), reader = $('[data-reader]');

    function filter() {
      const needle = q.toLowerCase();
      ids = [];
      for (let i = 0; i < N; i++) {
        if (archived.has(i)) continue;
        if (needle) { const m = msg(i); if (!m.from.toLowerCase().includes(needle) && !m.subject.toLowerCase().includes(needle)) continue; }
        ids.push(i);
      }
      spacer.style.height = `${ids.length * ROW}px`;
      $('[data-count]').textContent = `${ids.length.toLocaleString('en-US')} messages`;
      paintRows();
    }
    function paintRows() {
      const top = scroller.scrollTop, h = scroller.clientHeight;
      const start = Math.max(0, Math.floor(top / ROW) - 4), end = Math.min(ids.length, Math.ceil((top + h) / ROW) + 4);
      let html = '';
      for (let k = start; k < end; k++) {
        const m = msg(ids[k]);
        html += `<div class="mail-row ${m.id === selected ? 'selected' : ''}" role="option" aria-selected="${m.id === selected}" style="top:${k * ROW}px" data-mail="${m.id}">
          <strong>${esc(m.from)}</strong><span>${esc(m.subject)}</span><time>${new Date(m.at).toISOString().slice(0, 10)}</time></div>`;
      }
      spacer.innerHTML = html;
    }
    function open(id) {
      selected = id;
      const m = msg(id);
      reader.innerHTML = `<h2>${esc(m.subject)}</h2><p class="muted">From ${esc(m.from)} · ${new Date(m.at).toUTCString().slice(0, 22)}</p><p>${esc(m.body)}</p>
        <div class="form-actions"><button type="button" data-archive>Archive</button><button type="button" class="secondary" data-reply>Reply</button></div>
        <form hidden data-reply-form><label for="reply-body">Reply</label><textarea id="reply-body"></textarea><button type="submit" class="small">Send</button></form>`;
      paintRows();
    }
    async function archive(id) {
      const out = await G.api('/api/app/inbox/archive', { id });
      archived = new Set(out.archived);
      const k = ids.indexOf(id);
      filter();
      reader.innerHTML = '<p class="muted">Archived. Select another message.</p>';
      selected = ids[Math.min(k, ids.length - 1)] ?? null;
      if (selected !== null) open(selected);
      G.toast('Conversation archived');
    }
    const move = (d) => {
      const k = selected === null ? -1 : ids.indexOf(selected);
      const next = ids[Math.max(0, Math.min(ids.length - 1, k + d))];
      if (next === undefined) return;
      open(next);
      const y = ids.indexOf(next) * ROW;
      if (y < scroller.scrollTop) scroller.scrollTop = y;
      else if (y + ROW > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = y + ROW - scroller.clientHeight;
    };

    scroller.addEventListener('scroll', paintRows, { passive: true });
    scroller.addEventListener('click', (e) => { const r = e.target.closest('[data-mail]'); if (r) open(Number(r.dataset.mail)); });
    let t;
    $('[data-search]').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); scroller.scrollTop = 0; filter(); }, 200); });
    reader.addEventListener('click', (e) => {
      if (e.target.closest('[data-archive]')) archive(selected);
      if (e.target.closest('[data-reply]')) reader.querySelector('[data-reply-form]').hidden = false;
    });
    reader.addEventListener('submit', (e) => { e.preventDefault(); G.toast('Reply sent'); e.target.hidden = true; });
    const onKey = (e) => {
      if (e.target.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j') move(1);
      else if (e.key === 'k') move(-1);
      else if (e.key === 'e' && selected !== null) archive(selected);
      else if (e.key === '/') { e.preventDefault(); $('[data-search]').focus(); }
    };
    document.addEventListener('keydown', onKey);

    // Resizable split: drag the separator, or focus it and use arrow keys.
    const split = $('[data-split]'), splitter = $('[data-splitter]');
    const setPct = (p) => {
      p = Math.max(20, Math.min(80, p));
      split.style.gridTemplateColumns = `${p}% 8px 1fr`;
      splitter.setAttribute('aria-valuenow', String(Math.round(p)));
    };
    splitter.addEventListener('pointerdown', (e) => {
      splitter.setPointerCapture(e.pointerId);
      const box = split.getBoundingClientRect();
      const moveFn = (ev) => setPct(((ev.clientX - box.left) / box.width) * 100);
      splitter.addEventListener('pointermove', moveFn);
      splitter.addEventListener('pointerup', () => splitter.removeEventListener('pointermove', moveFn), { once: true });
    });
    splitter.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setPct(Number(splitter.getAttribute('aria-valuenow')) + (e.key === 'ArrowLeft' ? -5 : 5)); }
    });

    filter();
    return { cleanup: () => document.removeEventListener('keydown', onKey) };
  },
});
