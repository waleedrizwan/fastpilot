// Kanban board: HTML5 drag and drop between and within columns, plus a ⋯ menu
// on every card that moves it to another column.

App.view('board', {
  title: 'Board',
  async render(el) {
    const { esc } = App;
    const COLUMNS = ['Backlog', 'In progress', 'Review', 'Done'];
    let cards = await G.api('/api/app/cards');
    el.innerHTML = `<div class="view-head"><h1>Board</h1><p class="muted">Drag cards between columns, or use each card's ⋯ menu.</p></div><div class="board" data-board></div>`;
    const board = el.querySelector('[data-board]');

    function paint() {
      board.innerHTML = COLUMNS.map((col) => {
        const list = cards.filter((c) => c.column === col);
        return `<section class="column" data-column="${col}" aria-label="${col}">
          <h2>${col} <span class="muted">${list.length}</span></h2>
          <ol class="cards">${list.map((c) => `<li class="kcard" draggable="true" data-card="${c.id}">
            <span class="chip">${esc(c.label)}</span><p>${esc(c.title)}</p>
            <div class="menu-wrap"><button type="button" class="icon-btn small" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${esc(c.title)}" data-card-menu>⋯</button>
              <ul class="menu" role="menu" hidden>${COLUMNS.filter((x) => x !== col).map((x) => `<li role="none"><button type="button" role="menuitem" data-move="${x}">Move to ${x}</button></li>`).join('')}</ul></div>
          </li>`).join('')}</ol></section>`;
      }).join('');
    }
    paint();

    async function save(via) {
      const out = await G.api('/api/app/cards', { order: cards.map((c) => ({ id: c.id, column: c.column })), via });
      cards = out.cards;
      paint();
    }

    board.addEventListener('click', async (e) => {
      const menuBtn = e.target.closest('[data-card-menu]');
      board.querySelectorAll('.kcard .menu').forEach((m) => { if (m.previousElementSibling !== menuBtn) { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); } });
      if (menuBtn) {
        const menu = menuBtn.nextElementSibling;
        menu.hidden = !menu.hidden;
        menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
        if (!menu.hidden) menu.querySelector('button').focus();
      }
      const move = e.target.closest('[data-move]');
      if (move) {
        const id = Number(move.closest('[data-card]').dataset.card);
        const card = cards.find((c) => c.id === id);
        cards = [...cards.filter((c) => c.id !== id), { ...card, column: move.dataset.move }];
        await save('menu');
        G.toast(`Moved "${card.title}" to ${move.dataset.move}`);
      }
    });

    let dragId = null;
    board.addEventListener('dragstart', (e) => {
      const li = e.target.closest('[data-card]');
      if (!li) return;
      dragId = Number(li.dataset.card);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragId));
      requestAnimationFrame(() => li.classList.add('dragging'));
    });
    board.addEventListener('dragend', () => { dragId = null; board.querySelectorAll('.dragging, .drop-before').forEach((x) => x.classList.remove('dragging', 'drop-before')); });
    const target = (e) => {
      const col = e.target.closest('[data-column]');
      if (!col) return null;
      const items = [...col.querySelectorAll('[data-card]')].filter((li) => Number(li.dataset.card) !== dragId);
      const before = items.find((li) => { const r = li.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      return { col, before };
    };
    board.addEventListener('dragover', (e) => {
      const t = target(e);
      if (!t || dragId === null) return;
      e.preventDefault();
      board.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
      t.before?.classList.add('drop-before');
    });
    board.addEventListener('drop', async (e) => {
      const t = target(e);
      if (!t || dragId === null) return;
      e.preventDefault();
      const card = cards.find((c) => c.id === dragId);
      const rest = cards.filter((c) => c.id !== dragId);
      const moved = { ...card, column: t.col.dataset.column };
      const at = t.before ? rest.findIndex((c) => c.id === Number(t.before.dataset.card)) : rest.length;
      rest.splice(at, 0, moved);
      cards = rest;
      await save('drag');
    });
  },
});
