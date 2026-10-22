// Projects table: search and filters, sortable headers, column menu, select-all
// with bulk actions, double-click rename, hover-only row actions, right-click
// menu, expandable rows, pagination and CSV export.

App.view('projects', {
  title: 'Projects',
  async render(el) {
    const { esc } = App;
    const COLS = [['owner', 'Owner'], ['status', 'Status'], ['due', 'Due'], ['progress', 'Progress'], ['budget', 'Budget']];
    const PER = 10;
    const st = { list: [], q: '', owner: '', status: '', sort: 'name', dir: 1, cols: new Set(['owner', 'status', 'due', 'progress']), sel: new Set(), open: new Set(), page: 1, editing: null };

    el.innerHTML = `<div class="view-head"><h1>Projects</h1>
        <button type="button" class="secondary small" data-export>Export CSV</button></div>
      <div class="toolbar">
        <input type="search" placeholder="Search projects" aria-label="Search projects" data-q>
        <select aria-label="Owner" data-owner><option value="">All owners</option>${App.meta.owners.map((o) => `<option>${esc(o)}</option>`).join('')}</select>
        <select aria-label="Status" data-status><option value="">Any status</option>${['Active', 'Paused', 'Done', 'Archived'].map((s) => `<option>${s}</option>`).join('')}</select>
        <div class="menu-wrap"><button type="button" class="secondary small" aria-haspopup="menu" aria-expanded="false" data-cols-btn>Columns ▾</button>
          <ul class="menu" role="menu" hidden data-cols-menu>${COLS.map(([k, l]) => `<li role="none"><label class="inline" role="menuitemcheckbox" aria-checked="false" data-col="${k}"><input type="checkbox" tabindex="-1"> ${l}</label></li>`).join('')}</ul></div>
      </div>
      <div class="bulk-bar" hidden data-bulk><span data-bulk-count></span>
        <button type="button" class="small" data-bulk-action="archive">Archive</button>
        <button type="button" class="small secondary" data-bulk-action="activate">Mark active</button>
        <button type="button" class="small danger" data-bulk-action="delete">Delete</button>
        <button type="button" class="small ghost" data-bulk-clear>Clear selection</button></div>
      <div class="table-wrap"><table class="projects"><thead data-head></thead><tbody data-body><tr><td>Loading…</td></tr></tbody></table></div>
      <nav class="pagination" aria-label="Project pages" data-pages></nav>
      <ul class="menu context-menu" role="menu" hidden data-ctx></ul>`;
    const $ = (s) => el.querySelector(s);

    const shown = () => {
      const q = st.q.toLowerCase();
      const rows = st.list.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!st.owner || p.owner === st.owner) && (!st.status || p.status === st.status));
      return rows.sort((a, b) => {
        const x = a[st.sort], y = b[st.sort];
        return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * st.dir;
      });
    };

    function paint() {
      const rows = shown();
      const pages = Math.max(1, Math.ceil(rows.length / PER));
      st.page = Math.min(st.page, pages);
      const pageRows = rows.slice((st.page - 1) * PER, st.page * PER);
      const cols = COLS.filter(([k]) => st.cols.has(k));
      const allSel = rows.length && rows.every((p) => st.sel.has(p.id));
      const someSel = rows.some((p) => st.sel.has(p.id));
      const sortBtn = (k, label) => `<th aria-sort="${st.sort === k ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="th-sort" data-sort="${k}">${label}${st.sort === k ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
      $('[data-head]').innerHTML = `<tr><th><input type="checkbox" aria-label="Select all projects" data-all ${allSel ? 'checked' : ''}></th><th><span class="sr-only">Expand</span></th>
        ${sortBtn('name', 'Name')}${cols.map(([k, l]) => sortBtn(k, l)).join('')}<th><span class="sr-only">Actions</span></th></tr>`;
      $('[data-all]').indeterminate = !allSel && someSel;
      $('[data-body]').innerHTML = pageRows.map((p) => {
        const cell = { owner: esc(p.owner), status: `<span class="pill st-${p.status.toLowerCase()}">${p.status}</span>`, due: p.due,
          progress: `<div class="progress-bar" role="progressbar" aria-valuenow="${p.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(p.name)} progress"><span style="width:${p.progress}%"></span></div>`,
          budget: `$${p.budget.toLocaleString('en-US')}` };
        const nameCell = st.editing === p.id
          ? `<input class="cell-edit" value="${esc(p.name)}" aria-label="Project name" data-edit="${p.id}">`
          : `<span class="name" title="Double-click to rename">${esc(p.name)}</span>`;
        return `<tr data-id="${p.id}" class="${st.sel.has(p.id) ? 'selected' : ''}">
          <td><input type="checkbox" aria-label="Select ${esc(p.name)}" data-sel ${st.sel.has(p.id) ? 'checked' : ''}></td>
          <td><button type="button" class="icon-btn small" aria-expanded="${st.open.has(p.id)}" aria-label="Show details for ${esc(p.name)}" data-expand>${st.open.has(p.id) ? '▾' : '▸'}</button></td>
          <td class="name-cell">${nameCell}</td>${cols.map(([k]) => `<td>${cell[k]}</td>`).join('')}
          <td class="row-actions"><button type="button" class="small ghost" data-row-archive>Archive</button></td></tr>
          ${st.open.has(p.id) ? `<tr class="detail-row"><td></td><td colspan="${cols.length + 3}"><dl class="specs-list"><dt>Notes</dt><dd>${esc(p.notes)}</dd>
            <dt>Budget code</dt><dd>${p.code}</dd><dt>Progress</dt><dd>${p.progress}%</dd></dl></td></tr>` : ''}`;
      }).join('') || `<tr><td colspan="${cols.length + 4}" class="muted">No projects match.</td></tr>`;
      const pagesEl = $('[data-pages]');
      pagesEl.innerHTML = pages > 1 ? `<button type="button" class="small secondary" data-page="${st.page - 1}" ${st.page === 1 ? 'disabled' : ''}>‹ Previous</button>
        <span>Page ${st.page} of ${pages}</span>
        <button type="button" class="small secondary" data-page="${st.page + 1}" ${st.page === pages ? 'disabled' : ''}>Next ›</button>` : '';
      $('[data-bulk]').hidden = !st.sel.size;
      $('[data-bulk-count]').textContent = `${st.sel.size} selected`;
      for (const l of el.querySelectorAll('[data-col]')) {
        const on = st.cols.has(l.dataset.col);
        l.setAttribute('aria-checked', String(on));
        l.querySelector('input').checked = on;
      }
      const edit = $('[data-edit]');
      if (edit) { edit.focus(); edit.select(); }
    }

    st.list = await G.api('/api/app/projects');
    paint();

    $('[data-q]').addEventListener('input', (e) => { st.q = e.target.value; st.page = 1; paint(); });
    $('[data-owner]').addEventListener('change', (e) => { st.owner = e.target.value; st.page = 1; paint(); });
    $('[data-status]').addEventListener('change', (e) => { st.status = e.target.value; st.page = 1; paint(); });

    const colsBtn = $('[data-cols-btn]'), colsMenu = $('[data-cols-menu]');
    colsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      colsMenu.hidden = !colsMenu.hidden;
      colsBtn.setAttribute('aria-expanded', String(!colsMenu.hidden));
    });
    colsMenu.addEventListener('click', (e) => {
      const l = e.target.closest('[data-col]');
      if (!l) return;
      e.preventDefault();
      e.stopPropagation();
      const k = l.dataset.col;
      if (st.cols.has(k)) st.cols.delete(k); else st.cols.add(k);
      paint();
    });

    const save = async (id, name) => {
      const out = await G.api(`/api/app/projects/${id}`, { name });
      Object.assign(st.list.find((p) => p.id === id), out.project);
    };
    const finishEdit = async (commit) => {
      const input = $('[data-edit]');
      // Removing the input fires focusout, so a second call can arrive mid-save.
      if (!input || st.editing === null) return;
      const id = Number(input.dataset.edit), name = input.value.trim();
      st.editing = null;
      if (commit && name) await save(id, name);
      paint();
    };

    el.addEventListener('click', async (e) => {
      const t = e.target;
      if (!t.closest('[data-cols-menu]')) { colsMenu.hidden = true; colsBtn.setAttribute('aria-expanded', 'false'); }
      if (!t.closest('[data-ctx]')) $('[data-ctx]').hidden = true;
      const row = t.closest('tr[data-id]');
      const id = row && Number(row.dataset.id);
      if (t.closest('[data-sort]')) {
        const k = t.closest('[data-sort]').dataset.sort;
        st.dir = st.sort === k ? -st.dir : 1;
        st.sort = k;
        paint();
      } else if (t.matches('[data-all]')) {
        const rows = shown();
        if (t.checked) rows.forEach((p) => st.sel.add(p.id)); else rows.forEach((p) => st.sel.delete(p.id));
        paint();
      } else if (t.matches('[data-sel]')) {
        if (t.checked) st.sel.add(id); else st.sel.delete(id);
        paint();
      } else if (t.closest('[data-expand]')) {
        if (st.open.has(id)) st.open.delete(id); else st.open.add(id);
        paint();
      } else if (t.closest('[data-row-archive]')) {
        st.list = (await G.api('/api/app/projects-bulk', { ids: [id], action: 'archive' })).projects;
        paint();
      } else if (t.closest('[data-page]')) {
        st.page = Number(t.closest('[data-page]').dataset.page);
        paint();
      } else if (t.closest('[data-bulk-clear]')) {
        st.sel.clear();
        paint();
      } else if (t.closest('[data-bulk-action]')) {
        const action = t.closest('[data-bulk-action]').dataset.bulkAction;
        if (action === 'delete' && !confirm(`Delete ${st.sel.size} project(s)?`)) return;
        st.list = (await G.api('/api/app/projects-bulk', { ids: [...st.sel], action })).projects;
        st.sel.clear();
        paint();
      } else if (t.closest('[data-export]')) {
        const rows = [['Name', 'Owner', 'Status', 'Due', 'Progress', 'Budget'], ...shown().map((p) => [p.name, p.owner, p.status, p.due, p.progress, p.budget])];
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' })), download: 'projects.csv',
        });
        a.click();
        URL.revokeObjectURL(a.href);
      }
    });

    el.addEventListener('dblclick', (e) => {
      const cell = e.target.closest('.name-cell');
      if (!cell || st.editing) return;
      st.editing = Number(cell.closest('tr').dataset.id);
      paint();
    });
    el.addEventListener('keydown', (e) => {
      if (!e.target.matches('[data-edit]')) return;
      if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
      if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
    });
    el.addEventListener('focusout', (e) => { if (e.target.matches('[data-edit]')) finishEdit(true); });

    // Right-click menu.
    const ctx = $('[data-ctx]');
    el.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('tr[data-id]');
      if (!row) return;
      e.preventDefault();
      const p = st.list.find((x) => x.id === Number(row.dataset.id));
      ctx.innerHTML = ['Duplicate', 'Archive', 'Copy name'].map((a) => `<li role="none"><button type="button" role="menuitem" data-ctx-action="${a}">${a} ${a === 'Copy name' ? '' : esc(p.name)}</button></li>`).join('');
      ctx.dataset.id = p.id;
      const box = el.getBoundingClientRect();
      ctx.style.left = `${e.clientX - box.left}px`;
      ctx.style.top = `${e.clientY - box.top}px`;
      ctx.hidden = false;
      ctx.querySelector('button').focus();
    });
    ctx.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ctx-action]');
      if (!b) return;
      const id = Number(ctx.dataset.id);
      ctx.hidden = true;
      if (b.dataset.ctxAction === 'Duplicate') st.list = (await G.api(`/api/app/projects/${id}/duplicate`, {})).projects;
      if (b.dataset.ctxAction === 'Archive') st.list = (await G.api('/api/app/projects-bulk', { ids: [id], action: 'archive' })).projects;
      if (b.dataset.ctxAction === 'Copy name') {
        try { await navigator.clipboard.writeText(st.list.find((p) => p.id === id).name); G.toast('Name copied'); } catch {}
      }
      paint();
    });
    ctx.addEventListener('keydown', (e) => { if (e.key === 'Escape') ctx.hidden = true; });
  },
});
