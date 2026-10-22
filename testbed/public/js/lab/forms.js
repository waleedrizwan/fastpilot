// Lab · Forms page scripts.

G.lab('forms/wizard', (id) => {
  const form = G.$('#wiz'), sets = G.$$('fieldset[data-step]', form), steps = G.$$('#wiz-steps li');
  let i = 0;
  const val = () => ({ plan: form.querySelector('[name=plan]:checked')?.value, seats: form.elements.seats.value, billing: form.querySelector('[name=billing]:checked')?.value });
  const history = [];
  const show = () => {
    sets.forEach((s, k) => { s.hidden = k !== i; });
    steps.forEach((s, k) => { s.className = k < i ? 'done' : k === i ? 'current' : ''; });
    G.$('#w-back').disabled = i === 0;
    G.$('#w-next').textContent = i === sets.length - 1 ? 'Finish' : 'Next';
    if (i === 3) { const v = val(); G.$('#w-review').textContent = `${v.plan} plan, ${v.seats} seats, billed ${v.billing?.toLowerCase()}.`; history.push(v.seats); }
    G.$('#w-error').hidden = true;
  };
  G.$('#w-back').addEventListener('click', () => { i = Math.max(0, i - 1); show(); });
  G.$('#w-next').addEventListener('click', (e) => {
    const v = val();
    const err = i === 0 && !v.plan ? 'Choose a plan.' : i === 1 && !(Number(v.seats) >= 1) ? 'Enter a number of seats.' : i === 2 && !v.billing ? 'Choose billing.' : '';
    if (err) { G.$('#w-error').textContent = err; G.$('#w-error').hidden = false; return; }
    if (i < sets.length - 1) { i++; show(); return; }
    const ok = v.plan === 'Pro' && v.seats === '5' && v.billing === 'Annual' && history.includes('3');
    form.innerHTML = `<p>Done: ${v.plan}, ${v.seats} seats, ${v.billing}.</p>`;
    G.report(id, ok ? 'pass' : 'fail', `${v.plan}, ${v.seats} seats, ${v.billing}; reviewed seats ${history.join(' then ')}`, e);
  });
});

G.lab('forms/conditional', (id) => {
  G.$('#c-group').addEventListener('change', (e) => { G.$('#c-size-wrap').hidden = !e.target.checked; });
  G.$('#cond').addEventListener('change', (e) => { if (e.target.name === 'guide') G.$('#c-lang-wrap').hidden = e.target.value !== 'yes'; });
  G.$('#cond').addEventListener('submit', (e) => {
    e.preventDefault();
    const group = G.$('#c-group').checked, size = G.$('#c-size').value, guide = G.$('[name=guide]:checked').value, lang = G.$('#c-lang').value;
    G.report(id, group && size === '8' && guide === 'yes' && lang === 'French' ? 'pass' : 'fail', `group ${group}, size ${size}, guide ${guide}, ${lang}`, e);
  });
});

G.lab('forms/repeat-rows', (id) => {
  const rows = G.$('#trav-rows');
  let n = 0;
  const add = () => {
    n++;
    rows.insertAdjacentHTML('beforeend', `<div class="row trav-row"><label class="inline">Name <input name="tname" aria-label="Traveller ${n} name"></label>
      <label class="inline">Age <input name="tage" type="number" min="0" max="120" style="width:90px" aria-label="Traveller ${n} age"></label>
      <button type="button" class="small ghost" data-remove aria-label="Remove traveller ${n}">Remove</button></div>`);
  };
  add();
  G.$('#trav-add').addEventListener('click', add);
  rows.addEventListener('click', (e) => { if (e.target.closest('[data-remove]')) e.target.closest('.trav-row').remove(); });
  G.$('#trav').addEventListener('submit', (e) => {
    e.preventDefault();
    const list = G.$$('.trav-row', rows).map((r) => `${G.$('[name=tname]', r).value.trim()}:${G.$('[name=tage]', r).value}`).filter((x) => x !== ':');
    G.report(id, list.join(',') === 'Ana:12,Ben:34,Cy:67' ? 'pass' : 'fail', list.join(', '), e);
  });
});

G.lab('forms/reset-trap', (id) => {
  const f = G.$('#rt');
  f.addEventListener('reset', () => G.fail(id, 'pressed Reset and cleared the form'));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = ['#rt-name', '#rt-city', '#rt-postal'].map((s) => G.$(s).value.trim());
    G.report(id, v.join('|') === 'Jo Doe|Calgary|T2P 1J9' ? 'pass' : 'fail', v.join(', '), e);
  });
});

G.lab('forms/autosave', (id) => {
  const t = G.$('#as-notes'), s = G.$('#as-state');
  let timer;
  t.addEventListener('input', () => {
    s.textContent = 'Unsaved changes…';
    clearTimeout(timer);
    timer = setTimeout(async () => {
      s.innerHTML = '<span class="spinner" aria-hidden="true"></span> Saving…';
      await G.sleep(800);
      s.textContent = `Saved at ${new Date().toLocaleTimeString()}.`;
      if (t.value.trim() === 'Remember the bear canister') G.pass(id, 'autosaved the note');
    }, 1500);
  });
});

G.lab('forms/disabled-fieldset', (id) => {
  G.$('#has-res').addEventListener('change', (e) => { G.$('#res-fields').disabled = !e.target.checked; });
  G.$('#res').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = G.$('#res-no').value.trim().toUpperCase();
    G.$('#res-state').textContent = v === 'R-2048' ? 'Found: Lakeshore cabin, 3 nights.' : 'No reservation with that number.';
    G.report(id, v === 'R-2048' ? 'pass' : 'fail', `looked up ${v}`, e);
  });
});

G.lab('forms/long-form', (id) => G.$('#long').addEventListener('submit', (e) => {
  e.preventDefault();
  const vals = Object.fromEntries(G.$$('#long input').map((i) => [i.name, i.value.trim()]));
  const changed = Object.entries(vals).filter(([k, v]) => (k === 'First name' ? v !== 'Demo' : v && !['Emergency contact phone', 'Dietary needs'].includes(k)));
  const ok = vals['Emergency contact phone'] === '555-0100' && vals['Dietary needs'].toLowerCase() === 'vegetarian' && !changed.length;
  G.report(id, ok ? 'pass' : 'fail', ok ? 'two fields set' : `phone ${vals['Emergency contact phone']}, diet ${vals['Dietary needs']}${changed.length ? `, also changed ${changed.map(([k]) => k).join(', ')}` : ''}`, e);
}));

G.lab('forms/same-labels', (id) => G.$('#addrs').addEventListener('submit', (e) => {
  e.preventDefault();
  const s = G.$('#Shipping-city').value.trim(), b = G.$('#Billing-city').value.trim();
  G.report(id, s === 'Calgary' && b === 'Regina' ? 'pass' : 'fail', `shipping ${s || '?'}, billing ${b || '?'}`, e);
}));
