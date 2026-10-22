// Home page, newsletter signup and the sitemap.

import { challenges, define, LAB_CATEGORIES } from '../challenges.ts';
import { CATEGORIES, PRODUCTS } from '../lib/data.ts';
import { h, money } from '../lib/html.ts';
import { get, post, redirect } from '../lib/http.ts';
import { page } from '../lib/layout.ts';
import { report } from '../lib/state.ts';

define(
  {
    id: 'site/carousel-code', area: 'site', title: 'Code on the third slide', path: '/',
    task: 'The home page hero carousel shows a promo code on its third slide. Find the code and submit it in the Answer box.',
    check: 'answer', needs: ['click', 'read', 'type'], level: 1, answer: 'TRAIL10',
  },
  {
    id: 'site/newsletter', area: 'site', title: 'Newsletter signup', path: '/',
    task: 'Sign up for the newsletter at the bottom of the home page with the email trail@example.com, choosing the monthly digest only.',
    check: 'auto', needs: ['type', 'click', 'scroll'], level: 1,
  },
  {
    id: 'site/mega-menu', area: 'site', title: 'Mega menu', path: '/',
    task: 'Using the Shop menu in the site header, open the Camp kitchen category and tell me how many products it has.',
    check: 'answer', needs: ['hover', 'click', 'read'], level: 1, answer: PRODUCTS.filter((p) => p.cat === 'kitchen').length,
  },
  {
    id: 'site/search-typeahead', area: 'site', title: 'Search suggestions', path: '/',
    task: 'Type "lan" into the header search box and open the second suggestion. Submit the product name in the Answer box.',
    check: 'answer', needs: ['type', 'wait', 'click'], level: 2,
    answer: () => PRODUCTS.filter((p) => p.name.toLowerCase().includes('lan') || p.cat.includes('lan'))[1].name,
  },
);

const SLIDES = [
  ['Gear tested on real trails', 'Every product here was carried, pitched, soaked and fixed by our testers.', '/shop', 'Shop all gear'],
  ['A workspace for trip planning', 'Projects, boards, calendars and docs for your next expedition.', '/app', 'Open the workspace'],
  ['Autumn sale', 'Use code TRAIL10 at checkout for 10% off everything in your cart.', '/shop?sort=rating', 'Shop best rated'],
];

get('/', (req) => page({
  req, title: 'Home', scripts: ['/static/js/pages/home.js'],
  body: h`<section class="hero" aria-roledescription="carousel" aria-label="Highlights">
      <div class="slides">
        ${SLIDES.map(([title, text, href, cta], i) => h`<div class="slide slide-${i + 1}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${SLIDES.length}" ${i ? h`hidden` : ''}>
          <h1>${title}</h1><p>${text}</p><a class="button" href="${href}">${cta}</a>
        </div>`)}
      </div>
      <div class="hero-controls">
        <button type="button" class="icon-btn" data-slide="prev" aria-label="Previous slide">‹</button>
        <div class="dots">${SLIDES.map((_, i) => h`<button type="button" class="dot ${i ? '' : 'active'}" data-go="${i}" aria-label="Show slide ${i + 1}"></button>`)}</div>
        <button type="button" class="icon-btn" data-slide="next" aria-label="Next slide">›</button>
      </div>
    </section>
    <section class="area-cards">
      ${[
        ['Shop', 'Filters, product pages, cart and a four-step checkout.', '/shop'],
        ['Account', 'Sign in, register, reset a password, two-factor codes and settings.', '/account'],
        ['Workspace', 'A single-page app with tables, a board, calendar, docs and inbox.', '/app'],
        ['Support', 'Help center, tickets with attachments and a chat bot.', '/support'],
        ['Journal', 'Articles, comments, sharing and endless “Load more”.', '/blog'],
        ['Lab', `${LAB_CATEGORIES.length} categories of isolated mechanics, one per page.`, '/lab'],
      ].map(([title, text, href]) => h`<a class="card area-card" href="${href}"><h2>${title}</h2><p>${text}</p></a>`)}
    </section>
    <h2>Featured gear</h2>
    <div class="product-grid">
      ${PRODUCTS.filter((_, i) => i % 9 === 0).map((p) => h`<a class="card product-card" href="/shop/p/${p.slug}">
        <img src="/img/p/${p.slug}.svg" alt="${p.name}" width="240" height="180"><strong>${p.name}</strong><span>${money(p.price)}</span></a>`)}
    </div>
    <section class="newsletter card">
      <h2>Trail notes in your inbox</h2>
      <form method="post" action="/newsletter">
        <label for="nl-email">Email address</label>
        <input id="nl-email" name="email" type="email" required placeholder="you@example.com">
        <fieldset><legend>What would you like?</legend>
          <label class="inline"><input type="checkbox" name="list" value="weekly" checked> Weekly tips</label>
          <label class="inline"><input type="checkbox" name="list" value="monthly"> Monthly digest</label>
          <label class="inline"><input type="checkbox" name="list" value="offers" checked> Offers and sales</label>
        </fieldset>
        <button type="submit">Subscribe</button>
      </form>
    </section>`,
}));

post('/newsletter', (req) => {
  const email = (req.form.get('email') ?? '').trim().toLowerCase();
  const lists = req.form.getAll('list').sort();
  req.session.data.newsletter = { email, lists };
  if (email === 'trail@example.com') {
    const ok = lists.length === 1 && lists[0] === 'monthly';
    report(req, 'site/newsletter', ok ? 'pass' : 'fail', `subscribed to ${lists.join(', ') || 'nothing'}`);
  }
  redirect(req, '/newsletter/thanks', 303);
});

get('/newsletter/thanks', (req) => {
  const nl = req.session.data.newsletter;
  return page({
    req, title: 'Subscribed', crumbs: [['Home', '/'], ['Newsletter']],
    body: nl
      ? h`<h1>You're subscribed</h1><p>We'll send ${nl.lists.join(', ') || 'nothing (you unticked every list)'} to <strong>${nl.email}</strong>.</p><p><a href="/">Back home</a></p>`
      : h`<h1>Nothing to confirm</h1><p><a href="/">Back home</a></p>`,
  });
});

get('/sitemap', (req) => page({
  req, title: 'Sitemap', crumbs: [['Home', '/'], ['Sitemap']],
  body: h`<h1>Sitemap</h1>
    <div class="sitemap">
      <section><h2>Shop</h2><a href="/shop">All gear</a>${CATEGORIES.map(([s, n]) => h`<a href="/shop?cat=${s}">${n}</a>`)}<a href="/shop/infinite">Endless scroll</a><a href="/cart">Cart</a><a href="/checkout">Checkout</a><a href="/orders">Orders</a><a href="/wishlist">Wishlist</a></section>
      <section><h2>Account</h2><a href="/login">Sign in</a><a href="/register">Register</a><a href="/forgot">Forgot password</a><a href="/2fa">Two-factor</a><a href="/account">Settings</a><a href="/inbox">Mailbox</a></section>
      <section><h2>Support</h2><a href="/help">Help center</a><a href="/support/new">New ticket</a><a href="/support/tickets">Tickets</a><a href="/support/chat">Chat</a><a href="/blog">Journal</a></section>
      <section><h2>Workspace</h2>${['', '/projects', '/board', '/calendar', '/docs', '/inbox', '/settings'].map((p) => h`<a href="/app${p}">/app${p}</a>`)}<a href="/app-hash/">Hash-routed app</a></section>
      ${LAB_CATEGORIES.map(([slug, title]) => h`<section><h2>Lab · ${title}</h2>${challenges().filter((c) => c.area === `lab:${slug}`).map((c) => h`<a href="${c.path}">${c.title}</a>`)}</section>`)}
    </div>`,
}));

/** Product pictures, drawn as SVG so the site needs no binary assets. */
get('/img/p/:file', (req) => {
  const slug = req.params.file.replace(/\.svg$/, '');
  const p = PRODUCTS.find((x) => x.slug === slug);
  const view = Number(req.query.get('view') ?? 0);
  const hue = [...slug].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const initials = (p?.name ?? '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
  const shapes = [
    `<polygon points="120,40 200,150 40,150" fill="hsl(${hue} 45% 45%)"/>`,
    `<rect x="60" y="50" width="120" height="100" rx="18" fill="hsl(${hue} 45% 45%)"/>`,
    `<circle cx="120" cy="95" r="55" fill="hsl(${hue} 45% 45%)"/>`,
    `<path d="M40 150 Q120 10 200 150 Z" fill="hsl(${hue} 45% 45%)"/>`,
  ];
  req.res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' });
  req.res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180" width="240" height="180">
    <rect width="240" height="180" fill="hsl(${hue} 35% 92%)"/>${shapes[view % 4]}
    <text x="120" y="108" font-family="system-ui,sans-serif" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`);
});
