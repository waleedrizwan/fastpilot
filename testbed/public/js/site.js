// Store chrome: mega menu, search suggestions, account menu, notifications,
// cookie banner and the back-to-top button.

(() => {
  const { $, $$ } = G;

  // Mega menu panels open on hover and stay open for 300 ms after the pointer leaves.
  for (const item of $$('.has-panel')) {
    let timer;
    item.addEventListener('mouseenter', () => {
      clearTimeout(timer);
      $$('.has-panel.open').forEach((o) => o !== item && o.classList.remove('open'));
      item.classList.add('open');
    });
    item.addEventListener('mouseleave', () => { timer = setTimeout(() => item.classList.remove('open'), 300); });
  }

  // Header search suggestions, debounced.
  const search = $('.search input');
  const suggest = $('#search-suggest');
  if (search && suggest) {
    let timer, active = -1;
    const close = () => { suggest.hidden = true; search.setAttribute('aria-expanded', 'false'); active = -1; };
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = search.value.trim();
        if (!q) return close();
        const hits = await G.api(`/api/search?q=${encodeURIComponent(q)}`);
        suggest.innerHTML = hits.length
          ? hits.map((p, i) => `<a role="option" id="sg-${i}" href="/shop/p/${p.slug}">${p.name.replace(/</g, '&lt;')} <span>$${p.price}</span></a>`).join('')
          : '<div class="none">No matches</div>';
        suggest.hidden = false;
        search.setAttribute('aria-expanded', 'true');
      }, 250);
    });
    search.addEventListener('keydown', (e) => {
      const opts = $$('[role=option]', suggest);
      if (e.key === 'Escape') return close();
      if (!opts.length || suggest.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        opts.forEach((o, i) => o.classList.toggle('active', i === active));
        search.setAttribute('aria-activedescendant', opts[active].id);
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        location.href = opts[active].href;
      }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) close(); });
  }

  // Popup menus and panels toggled by a button with aria-controls.
  function popup(button, panel, { menu = false } = {}) {
    if (!button || !panel) return;
    const set = (open) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      if (open && menu) $('[role=menuitem]', panel)?.focus();
    };
    button.addEventListener('click', (e) => { e.stopPropagation(); set(panel.hidden); });
    document.addEventListener('click', (e) => { if (!panel.contains(e.target)) set(false); });
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { set(false); button.focus(); }
      if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const items = $$('[role=menuitem]', panel);
      const i = items.indexOf(document.activeElement);
      const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
      items[(next + items.length) % items.length].focus();
    });
  }
  popup($('.acct-btn'), $('#acct-menu'), { menu: true });
  popup($('.bell'), $('#notif-pop'));
  $('[data-mark-read]')?.addEventListener('click', () => {
    $$('.notif-list .unread').forEach((li) => li.classList.remove('unread'));
    const badge = $('[data-unread]');
    if (badge) badge.hidden = true;
    $('.bell')?.setAttribute('aria-label', 'Notifications, none unread');
  });

  // Cookie banner.
  const banner = $('.cookie-banner');
  async function consent(choice, extra = {}) {
    await G.api('/consent', { choice, ...extra });
    banner?.remove();
    G.closeModal($('#consent-modal'));
  }
  $$('[data-consent]').forEach((b) => b.addEventListener('click', () => {
    const choice = b.dataset.consent;
    if (choice === 'customize') return G.openModal('consent-modal', b);
    if (choice === 'save') {
      const m = $('#consent-modal');
      return consent('custom', { analytics: $('[name=analytics]', m).checked, marketing: $('[name=marketing]', m).checked });
    }
    consent(choice);
  }));

  const toTop = $('.to-top');
  if (toTop) {
    addEventListener('scroll', () => { toTop.hidden = scrollY < 600; }, { passive: true });
    toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // Add-to-cart buttons anywhere in the store update the header badge.
  addEventListener('cart:changed', (e) => {
    const badge = $('[data-cart-count]');
    if (!badge) return;
    badge.textContent = e.detail.count;
    badge.hidden = !e.detail.count;
    badge.parentElement.setAttribute('aria-label', `Cart, ${e.detail.count} items`);
  });
})();
