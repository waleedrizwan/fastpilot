// Lab · Text input page scripts.

const onSubmit = (sel, fn) => G.$(sel).addEventListener('submit', (e) => { e.preventDefault(); fn(e); });

G.lab('text/input-types', (id) => onSubmit('#types', (e) => {
  const v = (s) => G.$(s).value.trim();
  const want = { '#t-name': 'Jo Doe', '#t-email': 'jo@example.com', '#t-age': '34', '#t-phone': '+1 416 555 0199', '#t-web': 'https://jo.example', '#t-search': 'ridge', '#t-bio': 'Weekend hiker.' };
  const wrong = Object.entries(want).filter(([s, x]) => v(s) !== x).map(([s]) => G.$(`label[for=${s.slice(1)}]`).textContent);
  G.report(id, wrong.length ? 'fail' : 'pass', wrong.length ? `wrong: ${wrong.join(', ')}` : 'every field right', e);
}));

G.lab('text/masked-phone', (id) => {
  const input = G.$('#phone');
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').slice(0, 10);
    input.value = d.length > 6 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : d;
  });
  onSubmit('#mask', (e) => {
    G.$('#mask-state').textContent = `Saved ${input.value}`;
    G.report(id, input.value === '(416) 555-0199' ? 'pass' : 'fail', `saved ${input.value}`, e);
  });
});

G.lab('text/digits-only', (id) => {
  const input = G.$('#vcode');
  input.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && !/\d/.test(e.key) && !e.metaKey && !e.ctrlKey) e.preventDefault();
  });
  onSubmit('#digits', (e) => G.report(id, input.value === '492817' ? 'pass' : 'fail', `entered ${input.value}`, e));
});

G.lab('text/paste-blocked', (id) => {
  const confirm = G.$('#np-confirm');
  for (const ev of ['paste', 'drop']) confirm.addEventListener(ev, (e) => { e.preventDefault(); G.$('#np-state').textContent = 'Pasting is not allowed here.'; });
  onSubmit('#nopaste', (e) => {
    const a = G.$('#np-email').value.trim(), b = confirm.value.trim();
    G.report(id, a === 'jo@example.com' && b === a ? 'pass' : 'fail', `email ${a}, confirm ${b}`, e);
  });
});

G.lab('text/controlled', (id) => {
  const input = G.$('#city');
  const state = { city: '' };
  input.addEventListener('input', () => { state.city = input.value; });
  setInterval(() => { if (input.value !== state.city) input.value = state.city; }, 200);
  onSubmit('#controlled', (e) => {
    G.$('#ctl-state').textContent = `Saved city: ${state.city || '(none)'}`;
    G.report(id, state.city.trim() === 'Banff' ? 'pass' : 'fail', `state holds "${state.city}"`, e);
  });
});

G.lab('text/autocomplete', (id) => {
  const CITIES = ['Whitby, Ontario', 'Whistler, British Columbia', 'White Rock, British Columbia', 'Whitecourt, Alberta', 'Whitehorse, Yukon', 'Wetaskiwin, Alberta', 'Winnipeg, Manitoba'];
  const input = G.$('#ac-input'), list = G.$('#ac-list'), hidden = G.$('#ac-value');
  let timer, active = -1;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  input.addEventListener('input', () => {
    hidden.value = '';
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      const hits = q.length < 2 ? [] : CITIES.filter((c) => c.toLowerCase().includes(q));
      if (!hits.length) return close();
      list.innerHTML = hits.map((c, i) => `<li role="option" id="ac-${i}" aria-selected="false">${c}</li>`).join('');
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }, 400);
  });
  const choose = (li) => { input.value = li.textContent; hidden.value = li.textContent; close(); };
  list.addEventListener('mousedown', (e) => { const li = e.target.closest('[role=option]'); if (li) { e.preventDefault(); choose(li); } });
  input.addEventListener('keydown', (e) => {
    const opts = G.$$('[role=option]', list);
    if (list.hidden || !opts.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('active', i === active));
      input.setAttribute('aria-activedescendant', opts[active].id);
    } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(opts[active]); }
    else if (e.key === 'Escape') close();
  });
  onSubmit('#ac', (e) => {
    if (!hidden.value) { G.$('#ac-state').textContent = 'Choose a city from the suggestions.'; return G.fail(id, `typed "${input.value}" without choosing a suggestion`, e); }
    G.$('#ac-state').textContent = `Confirmed ${hidden.value}.`;
    G.report(id, hidden.value === 'Whitehorse, Yukon' ? 'pass' : 'fail', `chose ${hidden.value}`, e);
  });
});

G.lab('text/chips', (id) => {
  const box = G.$('#tag-box'), input = G.$('#tag-input');
  const tags = () => G.$$('.chip-item', box).map((c) => c.firstChild.textContent);
  const add = () => {
    const v = input.value.trim().replace(/,$/, '').toLowerCase();
    if (!v || tags().includes(v)) { input.value = ''; return; }
    const chip = document.createElement('span');
    chip.className = 'chip-item';
    chip.append(v);
    const x = Object.assign(document.createElement('button'), { type: 'button', textContent: '×' });
    x.setAttribute('aria-label', `Remove ${v}`);
    chip.append(x);
    box.insertBefore(chip, input);
    input.value = '';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    else if (e.key === 'Backspace' && !input.value) G.$$('.chip-item', box).at(-1)?.remove();
  });
  input.addEventListener('input', () => { if (input.value.includes(',')) add(); });
  box.addEventListener('click', (e) => { if (e.target.closest('.chip-item button')) e.target.closest('.chip-item').remove(); });
  onSubmit('#tags', (e) => {
    add();
    const t = tags().sort().join(',');
    G.$('#tags-state').textContent = `Saved: ${tags().join(', ') || 'no tags'}`;
    G.report(id, t === 'camping,hiking,trail-running' ? 'pass' : 'fail', `tags ${t}`, e);
  });
});

G.lab('text/maxlength', (id) => {
  const t = G.$('#status-text');
  t.addEventListener('input', () => { G.$('#status-count').textContent = t.value.length; });
  onSubmit('#status', (e) => {
    G.$('#status-state').textContent = `Posted (${t.value.length} characters).`;
    G.report(id, t.value.length === 50 ? 'pass' : 'fail', `${t.value.length} characters`, e);
  });
});

G.lab('text/enter-submit', (id) => onSubmit('#archive', (e) => {
  const q = G.$('#arch-q').value.trim();
  G.$('#arch-results').innerHTML = `<p>3 results for “${q.replace(/</g, '&lt;')}”.</p>`;
  G.report(id, q.toLowerCase() === 'permits' ? 'pass' : 'fail', `searched for ${q}`, e);
}));

G.lab('text/shift-enter', (id) => {
  const input = G.$('#se-input');
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const text = input.value;
    if (!text.trim()) return;
    const li = document.createElement('li');
    li.className = 'msg mine';
    li.style.whiteSpace = 'pre-line';
    li.textContent = text;
    G.$('#se-log').append(li);
    input.value = '';
    G.report(id, text.trim() === 'Line one\nLine two' ? 'pass' : 'fail', `sent ${JSON.stringify(text)}`, e);
  });
});

G.lab('text/contenteditable', (id) => {
  G.$('#note-save').addEventListener('click', (e) => {
    const t = G.$('#note').innerText.trim();
    G.report(id, t === 'Meet at 7' ? 'pass' : 'fail', `note reads "${t}"`, e);
  });
  G.$('#note').addEventListener('input', () => {
    const t = G.$('#note').innerText.trim();
    if (t === 'Meet at 7') G.pass(id, 'note reads "Meet at 7"');
  });
});

G.lab('text/readonly', (id) => {
  const input = G.$('#ro-name');
  G.$('#ro-edit').addEventListener('click', () => { input.readOnly = false; input.focus(); G.$('#ro-edit').hidden = true; G.$('#ro-save').hidden = false; });
  onSubmit('#ro', (e) => {
    input.readOnly = true;
    G.$('#ro-edit').hidden = false;
    G.$('#ro-save').hidden = true;
    G.$('#ro-state').textContent = `Saved as ${input.value}.`;
    G.report(id, input.value.trim() === 'Summit Seeker' ? 'pass' : 'fail', `saved ${input.value}`, e);
  });
});

G.lab('text/clears-on-focus', (id) => {
  const input = G.$('#coupon-code'), HINT = 'Enter coupon';
  input.addEventListener('focus', () => { if (input.value === HINT) { input.value = ''; input.classList.remove('hinted'); } });
  input.addEventListener('blur', () => { if (!input.value) { input.value = HINT; input.classList.add('hinted'); } });
  onSubmit('#coupon', (e) => {
    const v = input.value.trim();
    G.$('#coupon-state').textContent = v.toUpperCase() === 'WINTER25' ? 'Coupon applied.' : `“${v}” is not a valid coupon.`;
    G.report(id, v.toUpperCase() === 'WINTER25' ? 'pass' : 'fail', `applied "${v}"`, e);
  });
});

G.lab('text/unicode', (id) => onSubmit('#uni', (e) => {
  const v = (s) => G.$(s).value.trim().normalize('NFC');
  const want = [['#u-name', 'Zoë Ångström'], ['#u-city', '東京'], ['#u-greet', 'Hi 👋'], ['#u-nick', 'مرحبا']];
  const wrong = want.filter(([s, x]) => v(s) !== x.normalize('NFC'));
  G.$('#uni-state').textContent = wrong.length ? `Check: ${wrong.map(([s]) => s.slice(3)).join(', ')}` : 'Saved.';
  G.report(id, wrong.length ? 'fail' : 'pass', wrong.length ? `mismatched ${wrong.map(([s]) => `${s.slice(3)}="${v(s)}"`).join(', ')}` : 'all four exact', e);
}));

G.lab('text/otp', (id) => {
  const boxes = G.$$('.otp input');
  boxes.forEach((b, i) => {
    b.addEventListener('input', () => {
      b.value = b.value.replace(/\D/g, '').slice(-1);
      if (b.value && boxes[i + 1]) boxes[i + 1].focus();
    });
    b.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
  });
  onSubmit('#otp-form', (e) => {
    const code = boxes.map((b) => b.value).join('');
    G.$('#otp-state').textContent = code === '381904' ? 'Verified.' : `“${code}” is not the code.`;
    G.report(id, code === '381904' ? 'pass' : 'fail', `entered ${code}`, e);
  });
});

G.lab('text/multiline', (id) => onSubmit('#addr', (e) => {
  const lines = G.$('#addr-text').value.split('\n').map((l) => l.trim()).filter(Boolean);
  G.report(id, lines.join('|') === '12 Pine St|Toronto ON|M5V 2T6' ? 'pass' : 'fail', `lines ${JSON.stringify(lines)}`, e);
}));

G.lab('text/datalist', (id) => onSubmit('#peak', (e) => {
  const v = G.$('#peak-input').value.trim();
  G.report(id, v === 'Mount Robson' ? 'pass' : 'fail', `chose ${v}`, e);
}));
