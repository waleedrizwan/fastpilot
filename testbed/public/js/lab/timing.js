// Lab · Timing page scripts.

G.lab('timing/appears-later', () => {
  G.$('#gen').addEventListener('click', (e) => {
    e.target.disabled = true;
    G.$('#gen-out').innerHTML = '<p><span class="spinner" aria-hidden="true"></span> Generating…</p>';
    setTimeout(() => { G.$('#gen-out').innerHTML = '<p>Your report is ready.</p><button type="button" data-pass="downloaded when ready">Download report</button>'; }, 3000);
  });
});

G.lab('timing/spinner', () => setTimeout(() => { G.$('#spin-box').innerHTML = '<p>Permit number: <strong>PRM-58213</strong></p><p>Valid until 31 December 2026.</p>'; }, 2500));

G.lab('timing/progress', () => {
  G.$('#up-start').addEventListener('click', (e) => {
    e.target.disabled = true;
    let p = 0;
    const t = setInterval(() => {
      p = Math.min(100, p + 4);
      G.$('#up-bar').style.width = `${p}%`;
      G.$('.progress-bar').setAttribute('aria-valuenow', String(p));
      G.$('#up-text').textContent = p < 100 ? `${p}%` : 'Upload complete.';
      if (p === 100) { clearInterval(t); G.$('#up-continue').disabled = false; }
    }, 200);
  });
});

G.lab('timing/vanishing-toast', () => {
  const show = () => { G.toast('Your one-time code is ZX-4471', { ms: 3000 }); G.$('#get-code-again').hidden = false; };
  G.$('#get-code').addEventListener('click', show);
  G.$('#get-code-again').addEventListener('click', show);
});

G.lab('timing/rerender', (id) => {
  const people = ['Ana', 'Ben', 'Kai', 'Mo', 'Sol'];
  let tick = 0;
  const render = () => {
    tick++;
    const order = people.map((p, i) => people[(i + tick) % people.length]);
    G.$('#reqs').innerHTML = order.map((p) => `<li data-p="${p}">${p} requested access <button type="button" class="small" data-approve="${p}" id="ap-${p}-${tick}">Approve</button></li>`).join('');
    G.$('#reqs-tick').textContent = `Refreshed ${tick} time${tick === 1 ? '' : 's'}.`;
  };
  render();
  setInterval(render, 2000);
  G.$('#reqs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-approve]');
    if (b) G.report(id, b.dataset.approve === 'Kai' ? 'pass' : 'fail', `approved ${b.dataset.approve}`, e);
  });
});

G.lab('timing/live-feed', (id) => {
  let n = 0, stopped = false;
  const src = new EventSource('/api/stream?every=1000');
  src.onmessage = () => { if (!stopped) G.$('#counter').textContent = String(++n); };
  G.$('#stop').addEventListener('click', (e) => {
    stopped = true;
    src.close();
    G.$('#feed-state').textContent = `Stopped at ${n}.`;
    G.report(id, n >= 10 && n <= 12 ? 'pass' : 'fail', `stopped at ${n}`, e);
  });
});

G.lab('timing/slow-response', () => G.$('#bal').addEventListener('click', async (e) => {
  e.target.disabled = true;
  G.$('#bal-out').innerHTML = '<span class="spinner" aria-hidden="true"></span> Contacting the bank…';
  const out = await G.api('/api/lab/slow');
  G.$('#bal-out').textContent = `Balance: $${out.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}));

G.lab('timing/flaky', () => {
  const out = G.$('#load-out');
  const load = async () => {
    out.innerHTML = '<span class="spinner" aria-hidden="true"></span> Loading…';
    try {
      const d = await G.api('/api/lab/flaky');
      out.innerHTML = `<p>Dataset: <strong>${d.name}</strong> (${d.rows} rows)</p>`;
    } catch (err) {
      out.innerHTML = `<p class="field-error">Error: ${err.message}.</p><button type="button" class="secondary" id="retry">Retry</button>`;
      G.$('#retry').addEventListener('click', load);
    }
  };
  G.$('#load').addEventListener('click', load);
});

G.lab('timing/debounced', (id) => {
  const q = G.$('#db-q'), out = G.$('#db-results');
  let t;
  q.addEventListener('input', () => {
    clearTimeout(t);
    out.innerHTML = '';
    t = setTimeout(async () => {
      const hits = await G.api(`/api/lab/search?q=${encodeURIComponent(q.value.trim())}`);
      out.innerHTML = hits.map((x, i) => `<li><a href="#" data-i="${i}">${x}</a></li>`).join('') || '<li class="muted">No results</li>';
    }, 800);
  });
  out.addEventListener('click', (e) => {
    const a = e.target.closest('[data-i]');
    if (!a) return;
    e.preventDefault();
    G.report(id, q.value.trim().toLowerCase() === 'lantern' && a.dataset.i === '0' ? 'pass' : 'fail', `opened "${a.textContent}" for "${q.value}"`, e);
  });
});

G.lab('timing/long-poll', () => G.$('#ask').addEventListener('click', async (e) => {
  e.target.disabled = true;
  G.$('#ask-out').innerHTML = '<span class="spinner" aria-hidden="true"></span> Waiting for a manager to approve…';
  const out = await G.api('/api/lab/longpoll');
  G.$('#ask-out').textContent = `Approved by ${out.approver}.`;
}));

G.lab('timing/countdown', (id) => {
  const b = G.$('#skip');
  let left = 10;
  const t = setInterval(() => {
    left--;
    b.textContent = left > 0 ? `Skip ad in ${left}` : 'Skip ad ›';
    if (left <= 0) { clearInterval(t); b.disabled = false; }
  }, 1000);
  b.addEventListener('click', (e) => { G.$('.ad-box').innerHTML = '<p>Ad skipped. Enjoy the video!</p>'; G.pass(id, 'skipped the ad', e); });
});
