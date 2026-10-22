// Store pages: filters, quick view, wishlist, compare tray, endless scroll,
// product page widgets, cart and orders.

(() => {
  const { $, $$ } = G;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const money = (n) => `$${Number(n).toFixed(2)}`;

  // Selects that submit their form on change. The shop's sort select writes into the filter form.
  for (const sel of $$('[data-autosubmit]')) {
    sel.addEventListener('change', () => {
      const filter = $('#filter-form');
      if (sel.id === 'sort' && filter) {
        filter.elements.sort.value = sel.value;
        filter.submit();
      } else {
        sel.form?.submit();
      }
    });
  }

  // Dual price slider: keep min <= max and show the values.
  const dual = $('.dual-range');
  if (dual) {
    const [lo, hi] = $$('input', dual);
    const sync = (e) => {
      if (Number(lo.value) > Number(hi.value)) (e?.target === lo ? hi : lo).value = e?.target.value;
      $('[data-out=min]').textContent = lo.value;
      $('[data-out=max]').textContent = hi.value;
    };
    lo.addEventListener('input', sync);
    hi.addEventListener('input', sync);
  }

  // Quick view.
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-quick]');
    if (!b) return;
    const body = $('#quick-modal .quick-body');
    body.innerHTML = '<p>Loading…</p>';
    G.openModal('quick-modal', b);
    const p = await G.api(`/api/products/${b.dataset.quick}`);
    body.innerHTML = `<h2 id="quick-title">${esc(p.name)}</h2>
      <div class="quick-grid"><img src="/img/p/${p.slug}.svg" alt="" width="240" height="180">
      <dl class="specs-list"><dt>Price</dt><dd>${money(p.price)}</dd><dt>Weight</dt><dd>${p.weight} g</dd>
      <dt>Colors</dt><dd>${p.colors.map(esc).join(', ')}</dd><dt>Rating</dt><dd>${p.rating} / 5 (${p.reviews} reviews)</dd>
      <dt>Availability</dt><dd>${p.stock ? 'In stock' : 'Out of stock'}</dd></dl></div>
      <p>${esc(p.blurb)}</p><p><a href="/shop/p/${p.slug}">View full details</a></p>`;
  });

  // Wishlist hearts.
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-wish]');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    const out = await G.api('/api/wishlist', { slug: b.dataset.wish, on });
    for (const x of $$(`[data-wish="${b.dataset.wish}"]`)) {
      x.setAttribute('aria-pressed', String(out.on));
      const name = x.getAttribute('aria-label').replace(/^(Add|Remove) /, '').replace(/ (to|from) wishlist$/, '');
      x.setAttribute('aria-label', `${out.on ? 'Remove' : 'Add'} ${name} ${out.on ? 'from' : 'to'} wishlist`);
      x.textContent = x.classList.contains('icon-btn') ? (out.on ? '♥' : '♡') : (out.on ? '♥ Saved' : '♡ Save');
    }
    G.toast(out.on ? 'Saved to your wishlist' : 'Removed from your wishlist');
  });

  // Compare tray, kept in sessionStorage across pages.
  const tray = $('.compare-tray');
  const getCompare = () => { try { return JSON.parse(sessionStorage.getItem('compare') ?? '[]'); } catch { return []; } };
  const setCompare = (list) => { try { sessionStorage.setItem('compare', JSON.stringify(list)); } catch {} renderTray(); };
  function renderTray() {
    if (!tray) return;
    const list = getCompare();
    tray.hidden = !list.length;
    $('.compare-list', tray).textContent = `Compare (${list.length}/4): ${list.map((x) => x.name).join(', ')}`;
    $('[data-compare-go]', tray).href = `/shop/compare?items=${list.map((x) => x.slug).join(',')}`;
    for (const cb of $$('[data-compare]')) cb.checked = list.some((x) => x.slug === cb.dataset.compare);
  }
  document.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-compare]');
    if (!cb) return;
    let list = getCompare().filter((x) => x.slug !== cb.dataset.compare);
    if (cb.checked) {
      if (list.length >= 4) { cb.checked = false; return G.toast('You can compare up to 4 products'); }
      list.push({ slug: cb.dataset.compare, name: cb.dataset.name });
    }
    setCompare(list);
  });
  $('[data-compare-clear]')?.addEventListener('click', () => setCompare([]));
  renderTray();

  // Endless scroll.
  const grid = $('[data-infinite]'), sentinel = $('[data-sentinel]');
  if (grid && sentinel) {
    let offset = grid.children.length, loading = false, done = false;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loading || done) return;
      loading = true;
      const out = await G.api(`/api/products?offset=${offset}&limit=8`);
      grid.insertAdjacentHTML('beforeend', out.html);
      offset += 8;
      done = out.done;
      loading = false;
      if (done) { sentinel.textContent = "You've seen everything."; io.disconnect(); }
      renderTray();
    }, { rootMargin: '200px' });
    io.observe(sentinel);
  }

  // Product page.
  const pdp = $('.pdp');
  if (pdp) {
    const slug = pdp.dataset.slug;
    let view = 0;
    const main = $('[data-main]');
    const showView = (v) => {
      view = (v + 4) % 4;
      main.src = `/img/p/${slug}.svg?view=${view}`;
      main.alt = main.alt.replace(/view \d/, `view ${view + 1}`);
      $$('.thumb').forEach((t) => t.classList.toggle('active', Number(t.dataset.view) === view));
    };
    $$('.thumb').forEach((t) => t.addEventListener('click', () => showView(Number(t.dataset.view))));
    $('[data-gal=prev]').addEventListener('click', () => showView(view - 1));
    $('[data-gal=next]').addEventListener('click', () => showView(view + 1));
    const frame = $('.main-image');
    frame.addEventListener('mousemove', (e) => {
      const r = frame.getBoundingClientRect();
      main.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
      main.style.transform = 'scale(1.8)';
    });
    frame.addEventListener('mouseleave', () => { main.style.transform = ''; });

    const form = $('[data-add-to-cart]');
    form.addEventListener('change', (e) => {
      if (e.target.name === 'color') $('[data-color-name]').textContent = e.target.value;
    });

    // Custom size listbox.
    const btn = $('#size-btn'), list = $('#size-list');
    if (btn && list) {
      const opts = $$('[role=option]', list);
      let active = 0;
      const open = (on) => {
        list.hidden = !on;
        btn.setAttribute('aria-expanded', String(on));
        if (on) { list.focus(); mark(active); }
      };
      const mark = (i) => {
        active = (i + opts.length) % opts.length;
        opts.forEach((o, k) => o.classList.toggle('active', k === active));
        list.setAttribute('aria-activedescendant', opts[active].id);
      };
      const choose = (o) => {
        opts.forEach((x) => x.setAttribute('aria-selected', String(x === o)));
        $('#size-value').textContent = o.dataset.value;
        form.elements.size.value = o.dataset.value;
        $('[data-size-error]').hidden = true;
        open(false);
        btn.focus();
      };
      btn.addEventListener('click', () => open(list.hidden));
      opts.forEach((o, i) => {
        o.addEventListener('click', () => choose(o));
        o.addEventListener('mousemove', () => mark(i));
      });
      list.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); mark(active + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); mark(active - 1); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(opts[active]); }
        else if (e.key === 'Escape') { open(false); btn.focus(); }
      });
      document.addEventListener('click', (e) => { if (!e.target.closest('.listbox-wrap')) list.hidden = true; });
    }

    for (const b of $$('[data-step]')) {
      b.addEventListener('click', () => {
        const input = form.elements.qty;
        input.value = Math.max(1, Math.min(10, Number(input.value || 1) + Number(b.dataset.step)));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.elements.size.value) { $('[data-size-error]').hidden = false; return; }
      const add = $('.add-btn');
      add.disabled = true;
      add.innerHTML = '<span class="spinner" aria-hidden="true"></span> Adding…';
      try {
        const out = await G.api('/api/cart', {
          slug, color: form.elements.color.value, size: form.elements.size.value, qty: Number(form.elements.qty.value),
        });
        dispatchEvent(new CustomEvent('cart:changed', { detail: { count: out.count } }));
        G.toast(`Added ${form.elements.qty.value} × ${out.name} to your cart`);
      } catch (err) {
        G.toast(err.message, { kind: 'violation' });
      } finally {
        add.disabled = false;
        add.textContent = 'Add to cart';
      }
    });

    const more = $('[data-more-reviews]');
    more?.addEventListener('click', async () => {
      const ol = $('.review-list');
      more.disabled = true;
      more.textContent = 'Loading…';
      const out = await G.api(`/api/products/${slug}/reviews?offset=${ol.children.length}&limit=5`);
      ol.insertAdjacentHTML('beforeend', out.reviews.map((r) => `<li class="review"><p><span class="stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span> <strong>${esc(r.title)}</strong></p><p>${esc(r.body)}</p><p class="muted small">${esc(r.author)} · ${r.date}</p></li>`).join(''));
      more.disabled = false;
      more.textContent = 'Load more reviews';
      if (ol.children.length >= out.total) more.remove();
    });

    $('[data-notify]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await G.api('/api/notify', { slug: e.target.dataset.notify, email: e.target.elements.email.value });
        G.closeModal($('#notify-modal'));
        G.toast("We'll email you when it's back");
      } catch (err) {
        G.toast(err.message);
      }
    });
  }

  // Cart: native confirm() before removing, shipping estimate.
  for (const f of $$('form[data-confirm]')) {
    f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); });
  }
  $('[data-estimate]')?.addEventListener('click', async () => {
    const out = $('[data-estimate-out]');
    out.textContent = 'Calculating…';
    try {
      out.textContent = (await G.api(`/api/shipping-estimate?postal=${encodeURIComponent($('#postal').value)}`)).text;
    } catch (err) {
      out.textContent = err.message;
    }
  });

  // Orders: tracking popup.
  $('[data-track]')?.addEventListener('click', (e) => {
    window.open(`/orders/${e.target.dataset.track}/track`, 'tracking', 'width=480,height=560');
  });
})();
