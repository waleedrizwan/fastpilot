// Lab · Choices page scripts.

G.lab('choices/native-select', (id) => G.$('#diff').addEventListener('change', (e) =>
  G.report(id, e.target.value === 'Strenuous' ? 'pass' : 'fail', `chose ${e.target.value || 'nothing'}`, e)));

G.lab('choices/optgroups', (id) => G.$('#park').addEventListener('change', (e) =>
  G.report(id, e.target.value === 'us-glacier' ? 'pass' : 'fail', `chose ${e.target.value}`, e)));

G.lab('choices/long-select', (id) => G.$('#country').addEventListener('change', (e) =>
  G.report(id, e.target.value === 'Kyrgyzstan' ? 'pass' : 'fail', `chose ${e.target.value}`, e)));

G.lab('choices/multi-select', (id) => G.$('#gear-save').addEventListener('click', (e) => {
  const chosen = [...G.$('#gear').selectedOptions].map((o) => o.value).sort().join(', ');
  G.report(id, chosen === 'Lanterns, Stoves, Tents' ? 'pass' : 'fail', `selected ${chosen || 'nothing'}`, e);
}));

G.lab('choices/dependent', (id) => {
  const c = G.$('#d-country'), s = G.$('#d-state'), city = G.$('#d-city');
  const fill = (sel, label, items) => {
    sel.innerHTML = `<option value="">${label}…</option>` + items.map((x) => `<option>${x}</option>`).join('');
    sel.disabled = !items.length;
  };
  c.addEventListener('change', async () => {
    fill(s, 'Loading', []); fill(city, 'City', []);
    fill(s, 'State or province', c.value ? await G.api(`/api/lab/places?country=${encodeURIComponent(c.value)}`) : []);
  });
  s.addEventListener('change', async () => {
    fill(city, 'Loading', []);
    fill(city, 'City', s.value ? await G.api(`/api/lab/places?country=${encodeURIComponent(c.value)}&state=${encodeURIComponent(s.value)}`) : []);
  });
  G.$('#d-go').addEventListener('click', (e) => {
    const path = [c.value, s.value, city.value].join(' → ');
    G.report(id, path === 'United States → Utah → Moab' ? 'pass' : 'fail', path, e);
  });
});

G.lab('choices/listbox', (id) => {
  const list = G.$('#sites'), opts = G.$$('[role=option]', list);
  let active = 0;
  const choose = (o) => { opts.forEach((x) => x.setAttribute('aria-selected', String(x === o))); list.setAttribute('aria-activedescendant', o.id); active = opts.indexOf(o); };
  opts.forEach((o) => o.addEventListener('click', () => choose(o)));
  list.addEventListener('keydown', (e) => {
    const next = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: opts.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    choose(opts[Math.max(0, Math.min(opts.length - 1, next))]);
  });
  G.$('#reserve').addEventListener('click', (e) => {
    const sel = opts.find((o) => o.getAttribute('aria-selected') === 'true')?.textContent ?? 'nothing';
    G.report(id, sel === 'Site 14' ? 'pass' : 'fail', `reserved ${sel}`, e);
  });
});

G.lab('choices/combobox', (id) => {
  const btn = G.$('#cg-btn'), pop = G.$('#cg-pop'), input = G.$('#cg-input'), list = G.$('#cg-list');
  let chosen = '';
  const load = async () => {
    const items = await G.api(`/api/lab/campgrounds?q=${encodeURIComponent(input.value)}`);
    list.innerHTML = items.map((c) => `<li role="option" tabindex="-1">${c}</li>`).join('') || '<li class="muted">No matches</li>';
  };
  btn.addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    btn.setAttribute('aria-expanded', String(!pop.hidden));
    if (!pop.hidden) { input.value = ''; load(); input.focus(); }
  });
  input.addEventListener('input', load);
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[role=option]');
    if (!li) return;
    chosen = li.textContent;
    btn.textContent = `${chosen} ▾`;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  });
  G.$('#cg-book').addEventListener('click', (e) => G.report(id, chosen === 'Lake Louise Campground' ? 'pass' : 'fail', `booked ${chosen || 'nothing'}`, e));
});

G.lab('choices/aria-radios', (id) => {
  const radios = G.$$('#len [role=radio]');
  const pick = (r, e) => {
    radios.forEach((x) => { x.setAttribute('aria-checked', String(x === r)); x.tabIndex = x === r ? 0 : -1; });
    r.focus();
    G.report(id, r.textContent === 'Overnight' ? 'pass' : 'fail', `chose ${r.textContent}`, e);
  };
  radios.forEach((r) => r.addEventListener('click', (e) => pick(r, e)));
  G.$('#len').addEventListener('keydown', (e) => {
    const i = radios.indexOf(document.activeElement);
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || !d) return;
    e.preventDefault();
    pick(radios[(i + d + radios.length) % radios.length], e);
  });
});

G.lab('choices/native-radios', (id) => G.$('#skill').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = G.$('#skill [name=skill]:checked')?.value ?? 'nothing';
  G.report(id, v === 'Intermediate' ? 'pass' : 'fail', `chose ${v}`, e);
}));

G.lab('choices/styled-checkboxes', (id) => G.$('#pack').addEventListener('submit', (e) => {
  e.preventDefault();
  const on = G.$$('#pack input:checked').map((i) => i.value).sort().join(', ');
  G.report(id, on === 'Bring a map, Bring a stove' ? 'pass' : 'fail', `ticked ${on || 'nothing'}`, e);
}));

G.lab('choices/aria-checkboxes', (id) => {
  const boxes = G.$$('.aria-check');
  const check = (e) => {
    const state = Object.fromEntries(boxes.map((b) => [b.textContent, b.getAttribute('aria-checked') === 'true']));
    if (state['Email me'] && !state['Text me']) G.pass(id, 'email on, text off', e);
  };
  for (const b of boxes) {
    const toggle = (e) => { b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')); check(e); };
    b.addEventListener('click', toggle);
    b.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); toggle(e); } });
  }
});

G.lab('choices/tristate', (id) => {
  const all = G.$('#all'), items = G.$$('.item');
  const sync = (e) => {
    const n = items.filter((i) => i.checked).length;
    all.checked = n === items.length;
    all.indeterminate = n > 0 && n < items.length;
    const on = items.filter((i) => i.checked).map((i) => i.value);
    if (on.length === 4 && !on.includes('Batteries')) G.pass(id, 'everything but batteries', e);
  };
  all.addEventListener('change', (e) => { items.forEach((i) => { i.checked = all.checked; }); sync(e); });
  items.forEach((i) => i.addEventListener('change', sync));
});

G.lab('choices/switches', (id) => {
  for (const s of G.$$('[role=switch]')) {
    s.addEventListener('click', (e) => {
      s.setAttribute('aria-checked', String(s.getAttribute('aria-checked') !== 'true'));
      const v = Object.fromEntries(G.$$('[role=switch]').map((x) => [x.dataset.key, x.getAttribute('aria-checked') === 'true']));
      if (!v.wifi && v.bt && v.loc) G.pass(id, 'Wi-Fi off, Bluetooth on, Location on', e);
      else if (!v.loc) G.fail(id, 'turned Location off', e);
    });
  }
});

G.lab('choices/segmented', (id) => {
  const btns = G.$$('.seg-buttons button');
  btns.forEach((b) => b.addEventListener('click', (e) => {
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (b.textContent === 'Metric') G.pass(id, 'metric units', e);
  }));
});

G.lab('choices/stars', (id) => {
  const stars = G.$$('.stars-input button');
  const paint = (n) => stars.forEach((s) => s.classList.toggle('on', Number(s.dataset.n) <= n));
  stars.forEach((s) => {
    s.addEventListener('mouseenter', () => paint(Number(s.dataset.n)));
    s.addEventListener('click', (e) => {
      const n = Number(s.dataset.n);
      stars.forEach((x) => x.setAttribute('aria-checked', String(x === s)));
      G.$('#stars-state').textContent = `Rated ${n} of 5.`;
      G.report(id, n === 4 ? 'pass' : 'fail', `rated ${n}`, e);
    });
  });
  G.$('.stars-input').addEventListener('mouseleave', () => paint(Number(stars.find((s) => s.getAttribute('aria-checked') === 'true')?.dataset.n ?? 0)));
});
