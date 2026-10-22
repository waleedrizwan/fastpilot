// Lab · Files page scripts.

G.lab('files/single-upload', (id) => G.$('#one').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = G.$('#one-file').files[0];
  if (!f) { G.$('#one-state').textContent = 'Choose a file first.'; return; }
  G.$('#one-state').textContent = `Uploaded ${f.name} (${f.size} bytes).`;
  G.report(id, /\.txt$/i.test(f.name) && f.size > 0 ? 'pass' : 'fail', `uploaded ${f.name}`, e);
}));

G.lab('files/multi-upload', (id) => {
  const input = G.$('#multi-file');
  input.addEventListener('change', () => { G.$('#multi-list').innerHTML = [...input.files].map((f) => `<li>📷 ${f.name.replace(/</g, '&lt;')}</li>`).join(''); });
  G.$('#multi').addEventListener('submit', (e) => {
    e.preventDefault();
    const files = [...input.files];
    const ok = files.length === 2 && files.every((f) => f.type.startsWith('image/'));
    G.$('#multi-state').textContent = `${files.length} file(s) uploaded.`;
    G.report(id, ok ? 'pass' : 'fail', `${files.length} file(s): ${files.map((f) => f.type || '?').join(', ')}`, e);
  });
});

G.lab('files/dropzone', (id) => {
  const dz = G.$('#dz');
  for (const ev of ['dragenter', 'dragover']) dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (!f) return G.fail(id, 'dropped something that was not a file', e);
    G.$('#dz-state').textContent = `Received ${f.name}.`;
    G.pass(id, `dropped ${f.name}`, e);
  });
});

G.lab('files/avatar', (id) => {
  const input = G.$('#av-file'), save = G.$('#av-save'), preview = G.$('#av-preview');
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f || !f.type.startsWith('image/')) { preview.textContent = '!'; save.disabled = true; return; }
    const url = URL.createObjectURL(f);
    preview.innerHTML = `<img src="${url}" alt="Preview of ${f.name.replace(/"/g, '')}">`;
    save.disabled = false;
  });
  save.addEventListener('click', (e) => G.pass(id, `saved ${input.files[0]?.name}`, e));
});
