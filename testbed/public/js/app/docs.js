// Docs editor: a contenteditable page with a formatting toolbar, a link dialog,
// a "/" block menu, clickable checklists and autosave.

App.view('docs', {
  title: 'Docs',
  async render(el) {
    const { html } = await G.api('/api/app/doc');
    el.innerHTML = `<div class="view-head"><h1>Docs</h1><span class="muted small" data-save-state aria-live="polite">All changes saved</span></div>
      <div class="editor card">
        <div class="toolbar editor-bar" role="toolbar" aria-label="Formatting">
          <button type="button" class="icon-btn" data-cmd="bold" aria-label="Bold (⌘B)"><b>B</b></button>
          <button type="button" class="icon-btn" data-cmd="italic" aria-label="Italic (⌘I)"><i>I</i></button>
          <button type="button" class="icon-btn" data-cmd="underline" aria-label="Underline (⌘U)"><u>U</u></button>
          <button type="button" class="icon-btn" data-block="h2" aria-label="Heading">H</button>
          <button type="button" class="icon-btn" data-cmd="insertUnorderedList" aria-label="Bulleted list">•</button>
          <button type="button" class="icon-btn" data-block="checklist" aria-label="Checklist">☑</button>
          <button type="button" class="icon-btn" data-link aria-label="Insert link">🔗</button>
        </div>
        <div class="doc" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Document" spellcheck="false" data-doc>${html}</div>
        <p class="muted small" data-words></p>
      </div>
      <ul class="menu slash-menu" role="listbox" aria-label="Insert block" hidden data-slash></ul>
      <div class="modal-backdrop" id="link-modal" hidden>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="link-h"><h2 id="link-h">Insert link</h2>
          <form data-link-form><label for="link-url">URL</label><input id="link-url" name="url" type="url" placeholder="https://" required>
            <div class="actions"><button type="button" class="secondary" data-close-modal>Cancel</button><button type="submit">Insert</button></div></form></div>
      </div>`;
    const doc = el.querySelector('[data-doc]'), status = el.querySelector('[data-save-state]'), slash = el.querySelector('[data-slash]');
    document.execCommand('defaultParagraphSeparator', false, 'p');

    const words = () => { el.querySelector('[data-words]').textContent = `${(doc.innerText.match(/\S+/g) ?? []).length} words`; };
    words();
    let timer;
    const changed = () => {
      for (const li of doc.querySelectorAll('ul.checklist > li:not([data-checked])')) li.dataset.checked = 'false';
      words();
      status.textContent = 'Saving…';
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await G.api('/api/app/doc', { html: doc.innerHTML });
        status.textContent = 'All changes saved';
      }, 700);
    };
    doc.addEventListener('input', changed);

    // Toolbar buttons keep the selection by acting on mousedown.
    const bar = el.querySelector('.editor-bar');
    bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    let savedRange = null;
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      doc.focus();
      if (b.dataset.cmd) document.execCommand(b.dataset.cmd);
      if (b.dataset.block === 'h2') document.execCommand('formatBlock', false, 'h2');
      if (b.dataset.block === 'checklist') makeBlock('checklist');
      if (b.hasAttribute('data-link')) {
        const sel = getSelection();
        savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        G.openModal('link-modal', b);
        return;
      }
      changed();
    });
    el.querySelector('[data-link-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      G.closeModal(el.querySelector('#link-modal'));
      doc.focus();
      if (savedRange) { getSelection().removeAllRanges(); getSelection().addRange(savedRange); }
      document.execCommand('createLink', false, e.target.elements.url.value);
      changed();
    });

    // Clicking the box at the left of a checklist item toggles it.
    doc.addEventListener('click', (e) => {
      const li = e.target.closest('ul.checklist > li');
      if (!li || e.clientX - li.getBoundingClientRect().left > 26) return;
      li.dataset.checked = String(li.dataset.checked !== 'true');
      changed();
    });

    const block = () => {
      let n = getSelection().anchorNode;
      while (n && n.parentNode !== doc && !(n.nodeName === 'LI' && n.parentNode?.parentNode === doc)) n = n.parentNode;
      return n && n !== doc ? n : null;
    };
    const caretInto = (node) => {
      const r = document.createRange();
      r.selectNodeContents(node);
      r.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    };
    function makeBlock(kind) {
      const b = block();
      if (!b) return;
      let target;
      if (kind === 'checklist') {
        const li = document.createElement('li');
        li.dataset.checked = 'false';
        li.innerHTML = b.textContent.startsWith('/') || !b.textContent.trim() ? '<br>' : b.innerHTML;
        const host = b.nodeName === 'LI' ? b.parentNode : b;
        const prev = host.previousElementSibling;
        if (prev?.matches('ul.checklist') && host !== prev) { prev.append(li); host.remove(); }
        else if (host.matches?.('ul.checklist')) { b.replaceWith(li); }
        else { const ul = document.createElement('ul'); ul.className = 'checklist'; ul.append(li); host.replaceWith(ul); }
        target = li;
      } else if (kind === 'h2' || kind === 'p') {
        target = document.createElement(kind);
        target.innerHTML = b.textContent.startsWith('/') ? '<br>' : b.innerHTML;
        (b.nodeName === 'LI' ? b.parentNode : b).replaceWith(target);
      } else if (kind === 'ul') {
        const ul = document.createElement('ul');
        target = document.createElement('li');
        target.innerHTML = '<br>';
        ul.append(target);
        b.replaceWith(ul);
      } else if (kind === 'hr') {
        const hr = document.createElement('hr');
        target = document.createElement('p');
        target.innerHTML = '<br>';
        b.replaceWith(hr, target);
      }
      if (target) caretInto(target);
    }

    // "/" menu on an empty line.
    const OPTIONS = [['h2', 'Heading'], ['ul', 'Bulleted list'], ['checklist', 'Checklist item'], ['hr', 'Divider'], ['p', 'Text']];
    let opts = [], active = 0, slashBlock = null;
    const closeSlash = () => { slash.hidden = true; slashBlock = null; };
    doc.addEventListener('input', () => {
      const b = block();
      const text = b?.textContent ?? '';
      if (!b || !text.startsWith('/')) return closeSlash();
      slashBlock = b;
      const q = text.slice(1).toLowerCase();
      opts = OPTIONS.filter(([, label]) => label.toLowerCase().includes(q));
      active = 0;
      if (!opts.length) return closeSlash();
      slash.innerHTML = opts.map(([k, label], i) => `<li role="option" data-kind="${k}" aria-selected="${i === active}" class="${i === active ? 'active' : ''}">${label}</li>`).join('');
      const r = getSelection().getRangeAt(0).getBoundingClientRect(), box = el.getBoundingClientRect();
      slash.style.left = `${(r.left || b.getBoundingClientRect().left) - box.left}px`;
      slash.style.top = `${(r.bottom || b.getBoundingClientRect().bottom) - box.top + 4}px`;
      slash.hidden = false;
    });
    const choose = (kind) => {
      if (slashBlock) caretInto(slashBlock);
      makeBlock(kind);
      closeSlash();
      changed();
    };
    doc.addEventListener('keydown', (e) => {
      if (slash.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        [...slash.children].forEach((li, i) => { li.classList.toggle('active', i === active); li.setAttribute('aria-selected', String(i === active)); });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        choose(opts[active][0]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSlash();
      }
    });
    slash.addEventListener('mousedown', (e) => {
      const li = e.target.closest('[data-kind]');
      if (!li) return;
      e.preventDefault();
      choose(li.dataset.kind);
    });
    return { cleanup: () => clearTimeout(timer) };
  },
});
