// Lab · Locale & state page scripts.

const store = {
  get: (s, k) => { try { return s.getItem(k); } catch { return null; } },
  set: (s, k, v) => { try { s.setItem(k, v); } catch {} },
  del: (s, k) => { try { s.removeItem(k); } catch {} },
};

G.lab('locale/rtl', (id) => G.$('#rtl-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const n = G.$('#ar-name').value.trim(), c = G.$('#ar-city').value.trim();
  G.report(id, n === 'Layla' && c === 'Dubai' ? 'pass' : 'fail', `name ${n}, city ${c}`, e);
}));

G.lab('locale/japanese', (id) => G.$('#ja-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const d = G.$('#ja-dest').value, p = G.$('#ja-people').value;
  G.report(id, d === '札幌' && p === '2' ? 'pass' : 'fail', `${d || '?'}, ${p} people`, e);
}));

G.lab('locale/currency', () => {
  const PRICES = { USD: [9, 19, 49], EUR: [8.25, 17.5, 45], GBP: [7, 15, 39], JPY: [1400, 2900, 7500] };
  const sel = G.$('#cur');
  const paint = () => G.$$('[data-plan]').forEach((el, i) => {
    el.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: sel.value }).format(PRICES[sel.value][i]);
  });
  sel.addEventListener('change', paint);
  paint();
});

G.lab('locale/timezone', () => {
  const start = new Date(Date.UTC(2026, 10, 18, 17, 0));
  const paint = () => {
    const utc = G.$('#tz-utc').checked;
    G.$('#tz-time').textContent = start.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: utc ? 'UTC' : undefined });
    G.$('#tz-zone').textContent = utc ? '(UTC)' : `(${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  };
  G.$('#tz-utc').addEventListener('change', paint);
  paint();
});

G.lab('locale/onboarding', (id) => {
  const STEPS = ['Welcome! This is your trip planner.', 'Projects hold routes, gear lists and people.', 'Invite friends from the Share menu.', 'You are all set.'];
  const tour = G.$('#tour'), form = G.$('#proj');
  const paint = () => {
    const i = Number(store.get(localStorage, 'tour-step') ?? 0);
    if (i >= STEPS.length) { tour.hidden = true; form.hidden = false; return; }
    tour.hidden = false;
    form.hidden = true;
    tour.innerHTML = `<p class="muted small">Step ${i + 1} of ${STEPS.length}</p><p>${STEPS[i]}</p><button type="button" id="tour-next">${i === STEPS.length - 1 ? 'Finish' : 'Next'}</button>`;
    G.$('#tour-next').addEventListener('click', () => { store.set(localStorage, 'tour-step', String(i + 1)); paint(); });
  };
  G.$('#tour-reset').addEventListener('click', () => { store.del(localStorage, 'tour-step'); paint(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = G.$('#proj-name').value.trim();
    G.report(id, n === 'Base camp' ? 'pass' : 'fail', `created "${n}"`, e);
  });
  paint();
});

G.lab('locale/session-steps', () => G.$('#ci1').addEventListener('submit', (e) => {
  e.preventDefault();
  store.set(sessionStorage, 'checkin-code', G.$('#ci-code').value.trim());
  location.href = '/lab/locale/checkin-2';
}));
G.lab('locale/checkin-2', () => {
  const code = store.get(sessionStorage, 'checkin-code');
  const box = G.$('#ci2');
  if (!code) { box.innerHTML = '<p>Start from <a href="/lab/locale/session-steps">step 1</a>; your check-in session was not found.</p>'; return; }
  box.innerHTML = `<form id="ci2-form"><p>Step 2 of 2 · Booking <strong>${code.replace(/</g, '&lt;')}</strong></p><label class="inline"><input type="checkbox" id="ci-waiver"> I accept the trail waiver</label><button type="submit">Finish check-in</button></form>`;
  G.$('#ci2-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = code.toUpperCase() === 'GT-778' && G.$('#ci-waiver').checked;
    box.innerHTML = '<p>You are checked in. Enjoy the trail!</p>';
    G.report('lab/locale/session-steps', ok ? 'pass' : 'fail', `code ${code}, waiver ${ok ? 'accepted' : 'missing'}`, e);
  });
});

G.lab('locale/region-gate', () => document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-region]');
  if (!b) return;
  document.cookie = b.dataset.region ? `region=${b.dataset.region}; path=/; max-age=86400` : 'region=; path=/; max-age=0';
  location.reload();
}));
