// Home page hero carousel: auto-advances every 5 s, pauses on hover or focus.

(() => {
  const { $, $$ } = G;
  const slides = $$('.hero .slide'), dots = $$('.hero .dot');
  let i = 0, paused = false;
  const show = (n) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => { s.hidden = k !== i; });
    dots.forEach((d, k) => d.classList.toggle('active', k === i));
  };
  $('[data-slide=prev]').addEventListener('click', () => show(i - 1));
  $('[data-slide=next]').addEventListener('click', () => show(i + 1));
  dots.forEach((d) => d.addEventListener('click', () => show(Number(d.dataset.go))));
  const hero = $('.hero');
  hero.addEventListener('mouseenter', () => { paused = true; });
  hero.addEventListener('mouseleave', () => { paused = false; });
  hero.addEventListener('focusin', () => { paused = true; });
  hero.addEventListener('focusout', () => { paused = false; });
  setInterval(() => { if (!paused) show(i + 1); }, 5000);
})();
