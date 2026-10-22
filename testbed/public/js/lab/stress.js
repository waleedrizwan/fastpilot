// Lab · Stress page scripts.

G.lab('stress/many-buttons', (id) => G.$('#wall').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (b) G.report(id, b.dataset.i === '4999' ? 'pass' : 'fail', `clicked item ${b.dataset.i}`, e);
}));

G.lab('stress/never-settles', (id) => {
  const start = performance.now(), clock = G.$('#clock'), churn = G.$('#churn');
  let n = 0;
  const t = setInterval(() => {
    const ms = performance.now() - start;
    clock.textContent = `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`;
    churn.insertAdjacentHTML('afterbegin', `<li>tick ${++n}</li>`);
    if (churn.children.length > 5) churn.lastChild.remove();
  }, 50);
  G.$('#stop-clock').addEventListener('click', (e) => { clearInterval(t); G.pass(id, `stopped at ${clock.textContent}`, e); });
});

G.lab('stress/huge-select', (id) => G.$('#big-select').addEventListener('change', (e) =>
  G.report(id, e.target.value === 'Option 8642' ? 'pass' : 'fail', `chose ${e.target.value}`, e)));

G.lab('stress/long-task', () => G.$('#crunch').addEventListener('click', (e) => {
  e.target.disabled = true;
  G.$('#crunch-out').textContent = 'Crunching…';
  setTimeout(() => {
    const end = performance.now() + 3000;
    let x = 0;
    while (performance.now() < end) x++;
    G.$('#crunch-out').textContent = `Result: ${7 * 2 ** 20}`;
  }, 50);
}));
