// Lab · Scrolling page scripts.

G.lab('scroll/infinite', (id) => {
  const list = G.$('#inf'), sentinel = G.$('#inf-sentinel');
  let n = 0, busy = false;
  const more = async () => {
    if (busy || n >= 300) return;
    busy = true;
    await G.sleep(500);
    list.insertAdjacentHTML('beforeend', Array.from({ length: 20 }, () => { n++; return `<li>Item #${n} <button type="button" class="small secondary" data-n="${n}">Open</button></li>`; }).join(''));
    busy = false;
    if (n >= 300) sentinel.textContent = 'End of list.';
  };
  new IntersectionObserver(([e]) => { if (e.isIntersecting) more(); }, { rootMargin: '300px' }).observe(sentinel);
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]');
    if (b) G.report(id, b.dataset.n === '137' ? 'pass' : 'fail', `opened item #${b.dataset.n}`, e);
  });
});

G.lab('scroll/carousel', () => {
  const track = G.$('#snap'), slides = G.$$('.snap-slide');
  const idx = () => Math.round(track.scrollLeft / track.clientWidth);
  const go = (i) => track.scrollTo({ left: Math.max(0, Math.min(slides.length - 1, i)) * track.clientWidth, behavior: 'smooth' });
  G.$('#snap-prev').addEventListener('click', () => go(idx() - 1));
  G.$('#snap-next').addEventListener('click', () => go(idx() + 1));
  track.addEventListener('scroll', () => { G.$('#snap-pos').textContent = `${idx() + 1} / ${slides.length}`; }, { passive: true });
});

G.lab('scroll/virtual', (id) => {
  const box = G.$('#virt'), spacer = G.$('#virt-spacer'), ROW = 36, N = 10000;
  spacer.style.height = `${N * ROW}px`;
  const paint = () => {
    const start = Math.max(0, Math.floor(box.scrollTop / ROW) - 3), end = Math.min(N, Math.ceil((box.scrollTop + box.clientHeight) / ROW) + 3);
    let html = '';
    for (let i = start; i < end; i++) html += `<div class="virt-row" style="top:${i * ROW}px" role="button" tabindex="0" data-row="${i + 1}">Row ${i + 1}</div>`;
    spacer.innerHTML = html;
  };
  box.addEventListener('scroll', paint, { passive: true });
  spacer.addEventListener('click', (e) => {
    const r = e.target.closest('[data-row]');
    if (!r) return;
    G.$('#virt-state').textContent = `Clicked row ${r.dataset.row}.`;
    G.report(id, r.dataset.row === '7342' ? 'pass' : 'fail', `clicked row ${r.dataset.row}`, e);
  });
  paint();
});

G.lab('scroll/scroll-to-accept', () => {
  const box = G.$('#lic');
  box.addEventListener('scroll', () => { if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) G.$('#lic-accept').disabled = false; });
});

G.lab('scroll/lazy-images', () => {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const fig = e.target;
      io.unobserve(fig);
      setTimeout(() => { G.$('figcaption', fig).textContent = new TextDecoder().decode(Uint8Array.from(atob(fig.dataset.caption), (c) => c.charCodeAt(0))); fig.classList.add('loaded'); }, 400);
    }
  }, { threshold: 0.5 });
  G.$$('.lazy').forEach((f) => io.observe(f));
});

G.lab('scroll/scroll-jack', () => {
  const secs = G.$$('.jack-sec');
  let i = 0, locked = false;
  addEventListener('wheel', (e) => {
    e.preventDefault();
    if (locked || Math.abs(e.deltaY) < 4) return;
    locked = true;
    i = Math.max(0, Math.min(secs.length - 1, i + Math.sign(e.deltaY)));
    secs[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { locked = false; }, 700);
  }, { passive: false });
});

G.lab('scroll/checkpoint', () => {
  const cp = G.$('#cp'), meter = G.$('#meter');
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.round((scrollY / max) * 100) : 0;
    meter.textContent = `${p}%`;
    cp.hidden = p < 40 || p > 60;
  };
  addEventListener('scroll', update, { passive: true });
  update();
});
