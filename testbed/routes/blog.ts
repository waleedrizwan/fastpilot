// The Journal: posts with Load more, tag filters, likes, nested comments,
// share popups, copy link and print.

import { define } from '../challenges.ts';
import { pick, POSTS, rng, type Post } from '../lib/data.ts';
import { h, type Raw } from '../lib/html.ts';
import { get, json, post, redirect, type Req } from '../lib/http.ts';
import { errorPage, page } from '../lib/layout.ts';
import { report } from '../lib/state.ts';

const sorted = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
const PER = 6;

define(
  {
    id: 'support/blog-tag', area: 'support', title: 'Count tagged posts', path: '/blog',
    task: 'In the Journal, find how many posts are tagged "testing". Submit the number in the Answer box.',
    check: 'answer', needs: ['click', 'read', 'type'], level: 1, answer: POSTS.filter((p) => p.tags.includes('testing')).length,
  },
  {
    id: 'support/blog-oldest', area: 'support', title: 'The oldest post', path: '/blog',
    task: 'Find the oldest post in the Journal and submit its title in the Answer box.',
    check: 'answer', needs: ['click', 'scroll', 'read', 'type'], level: 2, answer: sorted.at(-1)!.title,
    note: `Only ${PER} posts show until "Load more" is pressed.`,
  },
  {
    id: 'support/blog-reply', area: 'support', title: 'Reply to a comment', path: '/blog/repairing-a-torn-fly',
    task: 'On the Journal post "Repairing a torn fly", reply to Nadia\'s comment with "Thanks, this worked!" and the name Jo.',
    check: 'auto', needs: ['click', 'type', 'scroll'], level: 2, note: 'The reply form opens inline under the comment.',
  },
);

interface Comment { id: number; author: string; body: string; date: string; parent: number | null }

const LINES = ['Great write-up, thanks.', 'I tried this on my last trip and it helped.', 'Could you do one on winter camping?', 'Saved for my next outing.', 'The photos would be nice too.'];
const AUTHORS = ['Avery', 'Jordan', 'Riley', 'Quinn', 'Rowan', 'Sage'];

function comments(req: Req, slug: string): Comment[] {
  const all = (req.session.data.comments ??= {}) as Record<string, Comment[]>;
  if (!all[slug]) {
    const r = rng(`comments/${slug}`);
    all[slug] = Array.from({ length: 2 + Math.floor(r() * 3) }, (_, i) => ({ id: i + 1, author: pick(r, AUTHORS), body: pick(r, LINES), date: '2026-10-1' + i, parent: null }));
    if (slug === 'repairing-a-torn-fly') {
      all[slug].splice(1, 0, { id: 99, author: 'Nadia', body: 'Tenacious tape did the trick for me, but round the corners of the patch!', date: '2026-10-12', parent: null });
    }
  }
  return all[slug];
}

const likes = (req: Req): Record<string, boolean> => (req.session.data.likes ??= {});

const card = (p: Post) => h`<article class="card post-card">
  <h2><a href="/blog/${p.slug}">${p.title}</a></h2>
  <p class="muted small">${p.date} · ${p.author} · ${p.minutes} min read</p>
  <p>${p.paragraphs[0].slice(0, 140)}…</p>
  <p>${p.tags.map((t) => h`<a class="chip" href="/blog?tag=${t}">${t}</a>`)}</p>
</article>`;

get('/blog', (req) => {
  const tag = req.query.get('tag') ?? '';
  const list = sorted.filter((p) => !tag || p.tags.includes(tag));
  const tags = [...new Set(POSTS.flatMap((p) => p.tags))].sort();
  return page({
    req, title: 'Journal', crumbs: [['Home', '/'], ['Journal', tag ? '/blog' : undefined], ...(tag ? [[`#${tag}`] as [string]] : [])], scripts: ['/static/js/pages/blog.js'],
    body: h`<h1>Journal${tag ? h` <span class="muted">tagged “${tag}”</span>` : ''}</h1>
      <nav class="tag-cloud" aria-label="Tags"><a href="/blog" ${tag ? '' : h`aria-current="page"`}>All</a>${tags.map((t) => h`<a href="/blog?tag=${t}" ${t === tag ? h`aria-current="page"` : ''}>${t}</a>`)}</nav>
      <p class="muted">${list.length} post${list.length === 1 ? '' : 's'}</p>
      <div class="post-list" data-posts data-tag="${tag}">${list.slice(0, PER).map(card)}</div>
      ${list.length > PER ? h`<button type="button" class="secondary" data-load-more>Load more</button>` : ''}`,
  });
});

get('/api/blog', (req) => {
  const tag = req.query.get('tag') ?? '';
  const offset = Number(req.query.get('offset')) || 0;
  const list = sorted.filter((p) => !tag || p.tags.includes(tag));
  setTimeout(() => json(req, { html: list.slice(offset, offset + PER).map((p) => card(p).__html).join(''), done: offset + PER >= list.length }), 700);
});

function commentTree(list: Comment[], parent: number | null, depth = 0): Raw {
  const kids = list.filter((c) => c.parent === parent);
  if (!kids.length) return h``;
  return h`<ol class="comments ${depth ? 'nested' : ''}">${kids.map((c) => h`<li class="comment" id="comment-${c.id}">
    <p class="who"><strong>${c.author}</strong> <span class="muted small">${c.date}</span></p><p>${c.body}</p>
    <button type="button" class="small ghost" data-reply-to="${c.id}" aria-expanded="false">Reply to ${c.author}</button>
    ${commentTree(list, c.id, depth + 1)}</li>`)}</ol>`;
}

get('/blog/:slug', (req) => {
  const p = POSTS.find((x) => x.slug === req.params.slug);
  if (!p) { req.res.statusCode = 404; return errorPage(req, 404, 'Post not found', 'That post does not exist.'); }
  const sections = ['Before you go', 'On the trail', 'Afterwards'];
  const per = Math.ceil(p.paragraphs.length / 3);
  const list = comments(req, p.slug);
  const liked = !!likes(req)[p.slug];
  return page({
    req, title: p.title, crumbs: [['Home', '/'], ['Journal', '/blog'], [p.title]], scripts: ['/static/js/pages/blog.js'],
    body: h`<div class="progress" aria-hidden="true"><span data-progress></span></div>
      <div class="post-layout">
        <article class="post">
          <h1>${p.title}</h1>
          <p class="muted">${p.date} · ${p.author} · ${p.minutes} min read · ${p.tags.map((t) => h`<a class="chip" href="/blog?tag=${t}">${t}</a>`)}</p>
          ${sections.map((s, i) => h`<h2 id="${s.toLowerCase().replace(/\s+/g, '-')}">${s}</h2>${p.paragraphs.slice(i * per, (i + 1) * per).map((para) => h`<p>${para}</p>`)}`)}
          <div class="post-actions">
            <button type="button" class="secondary" data-like="${p.slug}" aria-pressed="${liked}">${liked ? '♥ Liked' : '♡ Like'} · <span data-like-count>${12 + p.minutes + (liked ? 1 : 0)}</span></button>
            <button type="button" class="secondary" data-share="pinecone">Share on Pinecone</button>
            <button type="button" class="secondary" data-share="mail">Email this</button>
            <button type="button" class="secondary" data-copy-link>Copy link</button>
            <button type="button" class="secondary" data-print>Print</button>
          </div>
        </article>
        <aside class="toc sticky card" aria-label="On this page"><strong>On this page</strong>
          <ol>${sections.map((s) => h`<li><a href="#${s.toLowerCase().replace(/\s+/g, '-')}">${s}</a></li>`)}<li><a href="#comments">Comments</a></li></ol></aside>
      </div>
      <section id="comments"><h2>Comments (${list.length})</h2>
        ${commentTree(list, null)}
        <form method="post" action="/blog/${p.slug}/comment" class="comment-form" data-comment-form>
          <input type="hidden" name="parent" value="">
          <p class="replying" data-replying hidden>Replying to <strong></strong> <button type="button" class="link-btn small" data-cancel-reply>Cancel</button></p>
          <label for="c-name">Name</label><input id="c-name" name="name" required>
          <label for="c-body">Comment</label><textarea id="c-body" name="body" required></textarea>
          <div class="form-actions"><button type="submit">Post comment</button></div>
        </form>
      </section>`,
  });
});

post('/blog/:slug/comment', (req) => {
  const p = POSTS.find((x) => x.slug === req.params.slug);
  if (!p) return redirect(req, '/blog', 303);
  const list = comments(req, p.slug);
  const name = (req.form.get('name') ?? '').trim(), body = (req.form.get('body') ?? '').trim();
  const parent = Number(req.form.get('parent')) || null;
  if (name && body) {
    const c = { id: Math.max(...list.map((x) => x.id)) + 1, author: name, body, date: new Date().toISOString().slice(0, 10), parent };
    list.push(c);
    if (p.slug === 'repairing-a-torn-fly' && (parent === 99 || /thanks, this worked/i.test(body))) {
      const ok = parent === 99 && /^thanks, this worked!?$/i.test(body) && name.toLowerCase() === 'jo';
      report(req, 'support/blog-reply', ok ? 'pass' : 'fail', parent === 99 ? `replied to Nadia as ${name}` : 'posted a new comment instead of a reply');
    }
    return redirect(req, `/blog/${p.slug}#comment-${c.id}`, 303);
  }
  redirect(req, `/blog/${p.slug}#comments`, 303);
});

post('/api/like', (req) => {
  const slug = String(req.json?.slug ?? '');
  likes(req)[slug] = !!req.json?.on;
  json(req, { ok: true, on: likes(req)[slug] });
});

get('/share', (req) => page({
  req, title: 'Share on Pinecone', shell: 'bare',
  body: h`<div class="share-popup"><h1>Share on Pinecone</h1><p>Sharing <code>${req.query.get('url') ?? ''}</code></p>
    <label for="share-text">Say something</label><textarea id="share-text">Worth a read!</textarea>
    <div class="form-actions"><button type="button" onclick="document.body.innerHTML='<p style=padding:20px>Shared! You can close this window.</p>'">Post</button>
    <button type="button" class="secondary" onclick="window.close()">Cancel</button></div></div>`,
}));
