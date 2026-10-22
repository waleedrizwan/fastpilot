// Support pages: FAQ filter, helpful votes, ticket form widgets (dependent
// selects, CC chips, dropzone), reply preview, and the chat bot client.

(() => {
  const { $, $$ } = G;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // FAQ filter: hides non-matching questions and opens matching ones.
  const filter = $('#faq-filter');
  if (filter) {
    const apply = () => {
      const q = filter.value.trim().toLowerCase();
      let n = 0;
      for (const d of $$('[data-faq] details')) {
        const hit = !q || d.textContent.toLowerCase().includes(q);
        d.hidden = !hit;
        d.open = !!q && hit;
        if (hit) n++;
      }
      $('[data-faq-count]').textContent = q ? `${n} matching question${n === 1 ? '' : 's'}` : '';
    };
    filter.addEventListener('input', apply);
    apply();
  }

  for (const sel of $$('[data-navigate]')) sel.addEventListener('change', () => { location.href = sel.value; });

  const helpful = $('[data-helpful]');
  helpful?.addEventListener('click', (e) => {
    const vote = e.target.closest('[data-vote]');
    if (!vote) return;
    $$('[data-vote]', helpful).forEach((b) => { b.disabled = true; });
    if (vote.dataset.vote === 'no') $('[data-feedback]', helpful).hidden = false;
    else helpful.querySelector('span').textContent = 'Thanks for letting us know!';
  });
  $('[data-feedback]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    e.target.replaceWith(Object.assign(document.createElement('p'), { textContent: 'Thanks, we read every comment.' }));
  });

  // Ticket form.
  const cat = $('[data-category]'), sub = $('[data-subcategory]');
  if (cat && sub) {
    const subs = JSON.parse($('#subcategories').textContent);
    cat.addEventListener('change', () => {
      const list = subs[cat.value] ?? [];
      sub.innerHTML = `<option value="">${list.length ? 'Choose a topic…' : 'Choose a category first'}</option>` + list.map((s) => `<option>${esc(s)}</option>`).join('');
      sub.disabled = !list.length;
      $('[data-order-field]').hidden = cat.value !== 'Orders';
    });
  }
  for (const field of $$('[data-counter]')) {
    const out = field.parentElement.querySelector('[data-count]') ?? $('[data-count]');
    field.addEventListener('input', () => { out.textContent = field.maxLength - field.value.length; });
  }
  $('[data-phone-toggle]')?.addEventListener('change', (e) => { $('[data-phone]').hidden = !e.target.checked; });

  // CC chips: Enter, comma or Tab turns the typed address into a chip.
  const chips = $('[data-chips]');
  if (chips) {
    const input = $('input', chips), hidden = chips.parentElement.querySelector('input[name=cc]');
    const sync = () => { hidden.value = $$('.chip-item', chips).map((c) => c.firstChild.textContent).join(','); };
    const add = () => {
      const v = input.value.trim().replace(/,$/, '');
      if (!v) return;
      const chip = document.createElement('span');
      chip.className = `chip-item${/^\S+@\S+\.\S+$/.test(v) ? '' : ' invalid'}`;
      chip.innerHTML = `${esc(v)}<button type="button" aria-label="Remove ${esc(v)}">×</button>`;
      chips.insertBefore(chip, input);
      input.value = '';
      sync();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',' || (e.key === 'Tab' && input.value)) { e.preventDefault(); add(); }
      else if (e.key === 'Backspace' && !input.value) { $$('.chip-item', chips).at(-1)?.remove(); sync(); }
    });
    input.addEventListener('blur', add);
    chips.addEventListener('click', (e) => {
      if (e.target.closest('.chip-item button')) { e.target.closest('.chip-item').remove(); sync(); }
      else input.focus();
    });
    chips.closest('form').addEventListener('submit', add);
  }

  // Dropzone for attachments.
  const drop = $('[data-dropzone]');
  if (drop) {
    const input = $('input[type=file]', drop), list = $('[data-file-list]', drop);
    const show = () => { list.innerHTML = [...input.files].map((f) => `<li>📎 ${esc(f.name)} <span class="muted">(${Math.ceil(f.size / 1024)} KB)</span></li>`).join(''); };
    input.addEventListener('change', show);
    for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const dt = new DataTransfer();
      for (const f of [...input.files, ...e.dataTransfer.files]) dt.items.add(f);
      input.files = dt.files;
      show();
    });
  }

  // Reply preview.
  const preview = $('[data-preview]');
  if (preview) {
    const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>')
      .split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    $('#tab-preview').addEventListener('click', () => { preview.innerHTML = md($('#reply').value) || '<p class="muted">Nothing to preview.</p>'; });
  }

  // Chat.
  const chat = $('[data-chat]');
  if (chat) {
    const log = $('.chat-log', chat), typing = $('.typing', chat), input = $('#chat-input'), chipsRow = $('[data-chat-chips]', chat);
    const add = (who, text) => {
      const li = document.createElement('li');
      li.className = `msg ${who === 'You' ? 'mine' : 'bot'}`;
      li.innerHTML = `<p class="who">${who}</p><p></p>`;
      li.lastChild.textContent = text;
      log.append(li);
      li.scrollIntoView({ block: 'end' });
      return li.lastChild;
    };
    const send = async (text) => {
      if (!text.trim()) return;
      add('You', text);
      input.value = '';
      chipsRow.innerHTML = '';
      typing.hidden = false;
      const out = await G.api('/api/chat', { text });
      typing.hidden = true;
      const p = add('Trail Bot', '');
      for (const ch of out.reply) { p.textContent += ch; await G.sleep(12); }
      chipsRow.innerHTML = out.chips.map((c) => `<button type="button" class="small secondary">${esc(c)}</button>`).join('');
    };
    chipsRow.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) send(b.textContent); });
    $('[data-chat-form]').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
    });
  }
})();
