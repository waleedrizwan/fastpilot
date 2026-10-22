// Lab · Hover page scripts.

G.lab('hover/tooltip', () => {
  const btn = G.$('#tip-btn');
  let tip = null;
  const show = () => {
    if (tip) return;
    tip = Object.assign(document.createElement('div'), { className: 'tooltip', role: 'tooltip', id: 'tip', textContent: 'Groups of up to 12 people can book together.' });
    document.body.append(tip);
    const r = btn.getBoundingClientRect();
    tip.style.left = `${r.left + scrollX}px`;
    tip.style.top = `${r.bottom + scrollY + 6}px`;
    btn.setAttribute('aria-describedby', 'tip');
  };
  const hide = () => { tip?.remove(); tip = null; btn.removeAttribute('aria-describedby'); };
  btn.addEventListener('mouseenter', show);
  btn.addEventListener('mouseleave', hide);
  btn.addEventListener('focus', show);
  btn.addEventListener('blur', hide);
});

G.lab('hover/flyout', () => {
  for (const li of G.$$('.fly')) {
    let t;
    li.addEventListener('mouseenter', () => { clearTimeout(t); li.classList.add('open'); });
    li.addEventListener('mouseleave', () => { t = setTimeout(() => li.classList.remove('open'), 300); });
    li.querySelector(':scope > button').addEventListener('click', () => li.classList.toggle('open'));
  }
  G.$('.flyout').addEventListener('click', (e) => { if (e.target.closest('a')) e.preventDefault(); });
});

G.lab('hover/hover-card', () => {
  const link = G.$('#rowan'), card = G.$('#hc');
  let t;
  const show = () => { clearTimeout(t); const r = link.getBoundingClientRect(); card.style.left = `${r.left + scrollX}px`; card.style.top = `${r.bottom + scrollY + 6}px`; card.hidden = false; };
  const hide = () => { t = setTimeout(() => { card.hidden = true; }, 250); };
  link.addEventListener('mouseenter', show);
  link.addEventListener('mouseleave', hide);
  card.addEventListener('mouseenter', () => clearTimeout(t));
  card.addEventListener('mouseleave', hide);
  link.addEventListener('click', (e) => e.preventDefault());
});

G.lab('hover/hover-intent', () => {
  const el = G.$('#intent'), menu = G.$('.menu', el);
  let t;
  el.addEventListener('mouseenter', () => { t = setTimeout(() => { menu.hidden = false; }, 600); });
  el.addEventListener('mouseleave', () => { clearTimeout(t); menu.hidden = true; });
  menu.addEventListener('click', (e) => e.preventDefault());
});
