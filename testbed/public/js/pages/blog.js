// Journal: Load more, reading progress, likes, sharing, inline comment replies.

(() => {
  const { $, $$ } = G;

  const more = $('[data-load-more]'), list = $('[data-posts]');
  more?.addEventListener('click', async () => {
    more.disabled = true;
    more.innerHTML = '<span class="spinner" aria-hidden="true"></span> Loading…';
    const out = await G.api(`/api/blog?offset=${list.children.length}&tag=${encodeURIComponent(list.dataset.tag)}`);
    list.insertAdjacentHTML('beforeend', out.html);
    if (out.done) more.remove();
    else { more.disabled = false; more.textContent = 'Load more'; }
  });

  const bar = $('[data-progress]');
  if (bar) {
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
    };
    addEventListener('scroll', update, { passive: true });
    update();
  }

  $('[data-like]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    const on = b.getAttribute('aria-pressed') !== 'true';
    await G.api('/api/like', { slug: b.dataset.like, on });
    const n = Number($('[data-like-count]', b).textContent) + (on ? 1 : -1);
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = `${on ? '♥ Liked' : '♡ Like'} · <span data-like-count>${n}</span>`;
  });

  document.addEventListener('click', async (e) => {
    const share = e.target.closest('[data-share]');
    if (share?.dataset.share === 'pinecone') window.open(`/share?url=${encodeURIComponent(location.href)}`, 'share', 'width=520,height=480');
    if (share?.dataset.share === 'mail') location.href = `mailto:?subject=${encodeURIComponent(document.title)}&body=${encodeURIComponent(location.href)}`;
    if (e.target.closest('[data-copy-link]')) {
      try { await navigator.clipboard.writeText(location.href); G.toast('Link copied'); } catch { G.toast('Could not copy the link'); }
    }
    if (e.target.closest('[data-print]')) window.print();
  });

  // Reply buttons move the comment form under the comment.
  const form = $('[data-comment-form]');
  if (form) {
    const home = form.parentElement;
    const replying = $('[data-replying]', form);
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-reply-to]');
      if (b) {
        $$('[data-reply-to][aria-expanded=true]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
        b.setAttribute('aria-expanded', 'true');
        form.elements.parent.value = b.dataset.replyTo;
        $('strong', replying).textContent = b.closest('.comment').querySelector('.who strong').textContent;
        replying.hidden = false;
        b.after(form);
        form.elements.name.focus();
      }
      if (e.target.closest('[data-cancel-reply]')) {
        form.elements.parent.value = '';
        replying.hidden = true;
        $$('[data-reply-to][aria-expanded=true]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
        home.append(form);
      }
    });
  }
})();
