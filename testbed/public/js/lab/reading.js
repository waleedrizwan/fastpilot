// Lab · Reading page scripts.

G.lab('reading/canvas-text', () => {
  const c = G.$('#gate'), ctx = c.getContext('2d');
  ctx.fillStyle = '#2f5d3a'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui'; ctx.fillText('GATE CODE', 24, 50);
  ctx.font = 'bold 44px ui-monospace, monospace'; ctx.fillText('5 - 8 - 1 - 3', 24, 106);
});

G.lab('reading/show-more', () => G.$('#more').addEventListener('click', async (e) => {
  e.target.disabled = true;
  const out = await G.api('/api/lab/description');
  e.target.replaceWith(document.createTextNode(` ${out.rest}`));
}));
