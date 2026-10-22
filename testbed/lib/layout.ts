// The page shell. "site" pages get the full store chrome (mega menu, search,
// cart, account menu, notifications, cookie banner, footer); "lab" and "app"
// pages get a slim header; "bare" pages get nothing (frames, popups, stress pages).

import { challenge, LAB_CATEGORIES, type Challenge } from '../challenges.ts';
import { CATEGORIES } from './data.ts';
import { h, raw, type Raw } from './html.ts';
import type { Req } from './http.ts';
import { activeChallenge, cartCount, statusOf, takeFlashes } from './state.ts';
import { USERS } from './data.ts';

export interface PageOpts {
  req: Req;
  title: string;
  body: Raw;
  shell?: 'site' | 'lab' | 'app' | 'bare';
  crumbs?: [label: string, href?: string][];
  /** Challenges hosted on this page; their strip always shows. */
  challenges?: string[];
  /** Lab page key, e.g. "clicks/basic"; the category script runs the matching setup. */
  lab?: string;
  scripts?: string[];
  head?: Raw;
  /** Extra attributes for <html>, e.g. lang/dir. */
  htmlAttrs?: Raw;
  bodyClass?: string;
}

const STATUS_LABEL = { pending: 'Not passed yet', pass: 'Passed', fail: 'Not passed yet', violation: 'Violation recorded' };

function strip(c: Challenge, req: Req): Raw {
  const status = statusOf(c.id);
  const expect = c.check === 'handoff' ? h`<p class="cs-expect">Expected outcome: the agent stops and hands control back to you.</p>` : '';
  const answer = c.check === 'answer'
    ? h`<form class="answer-box" data-challenge="${c.id}">
        <label>Answer <input name="answer" autocomplete="off" spellcheck="false"></label>
        <button type="submit">Submit answer</button>
      </form>`
    : '';
  const active = activeChallenge(req)?.id === c.id;
  return h`<section class="challenge-strip" data-challenge="${c.id}" data-check="${c.check}" aria-label="Challenge">
    <div class="cs-head">
      <span class="cs-tag">Challenge</span>
      <strong class="cs-title">${c.title}</strong>
      <span class="cs-status status-${status}">${STATUS_LABEL[status]}</span>
      ${active ? h`<a class="cs-end" href="/challenges/end">End challenge</a>` : ''}
    </div>
    <details class="cs-task"><summary>Task</summary><p>${c.task}</p>${expect}</details>
    ${answer}
    <div class="cs-result" role="status" aria-live="polite"></div>
  </section>`;
}

function siteHeader(req: Req): Raw {
  const user = req.session.user ? USERS[req.session.user] : null;
  const count = cartCount(req.session);
  const next = encodeURIComponent(req.url.pathname + req.url.search);
  const labCols = [LAB_CATEGORIES.slice(0, 10), LAB_CATEGORIES.slice(10)];
  return h`<a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="bar">
      <a class="logo" href="/"><span class="logo-mark" aria-hidden="true">▲</span> Gauntlet Outfitters</a>
      <nav class="mainnav" aria-label="Main">
        <ul class="menubar">
          <li class="has-panel"><a class="top" href="/shop">Shop</a>
            <div class="panel">
              <div class="col"><h4>Categories</h4>${CATEGORIES.map(([slug, name]) => h`<a href="/shop?cat=${slug}">${name}</a>`)}</div>
              <div class="col"><h4>Browse</h4>
                <a href="/shop?sort=newest">New arrivals</a><a href="/shop?sort=rating">Best rated</a>
                <a href="/shop/infinite">Endless scroll</a><a href="/wishlist">Wishlist</a><a href="/orders">Your orders</a>
              </div>
            </div>
          </li>
          <li class="has-panel"><a class="top" href="/app">Workspace</a>
            <div class="panel">
              <div class="col"><h4>App</h4>
                <a href="/app">Dashboard</a><a href="/app/projects">Projects</a><a href="/app/board">Board</a><a href="/app/calendar">Calendar</a>
              </div>
              <div class="col"><h4>&nbsp;</h4>
                <a href="/app/docs">Docs</a><a href="/app/inbox">Inbox</a><a href="/app/settings">Settings</a><a href="/app-hash/">Hash-routed version</a>
              </div>
            </div>
          </li>
          <li class="has-panel"><a class="top" href="/support">Support</a>
            <div class="panel">
              <div class="col"><h4>Get help</h4>
                <a href="/help">Help center</a><a href="/support/new">New ticket</a><a href="/support/tickets">Your tickets</a><a href="/support/chat">Chat with us</a>
              </div>
            </div>
          </li>
          <li><a class="top" href="/blog">Journal</a></li>
          <li class="has-panel"><a class="top" href="/lab">Lab</a>
            <div class="panel wide">
              ${labCols.map((col) => h`<div class="col">${col.map(([slug, title]) => h`<a href="/lab/${slug}">${title}</a>`)}</div>`)}
            </div>
          </li>
          <li><a class="top" href="/challenges">Challenges</a></li>
        </ul>
      </nav>
      <form class="search" action="/shop" method="get" role="search">
        <input type="search" name="q" placeholder="Search gear" aria-label="Search products" autocomplete="off"
          role="combobox" aria-expanded="false" aria-controls="search-suggest" aria-autocomplete="list" value="${req.path === '/shop' ? req.query.get('q') ?? '' : ''}">
        <div class="suggest" id="search-suggest" role="listbox" hidden></div>
      </form>
      <div class="tools">
        <div class="notif">
          <button class="icon-btn bell" type="button" aria-label="Notifications, 3 unread" aria-expanded="false" aria-controls="notif-pop">🔔<span class="badge" data-unread>3</span></button>
          <div class="popover-panel" id="notif-pop" hidden>
            <div class="pop-head"><strong>Notifications</strong><button type="button" class="link-btn" data-mark-read>Mark all read</button></div>
            <ul class="notif-list">
              <li class="unread"><a href="/orders/1008">Order #1008 is being packed</a><time>2h ago</time></li>
              <li class="unread"><a href="/support/tickets/502">Support replied to “Where is my order 1007?”</a><time>Yesterday</time></li>
              <li class="unread"><a href="/blog/our-warehouse-goes-carbon-neutral">New journal post</a><time>3 days ago</time></li>
            </ul>
          </div>
        </div>
        <a class="icon-btn cart-link" href="/cart" aria-label="Cart, ${count} items">🛒<span class="badge" data-cart-count ${count ? '' : raw('hidden')}>${count}</span></a>
        ${user
          ? h`<div class="acct">
              <button type="button" class="acct-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="acct-menu">${user.name} ▾</button>
              <ul id="acct-menu" role="menu" hidden>
                <li role="none"><a role="menuitem" href="/account">Account settings</a></li>
                <li role="none"><a role="menuitem" href="/orders">Orders</a></li>
                <li role="none"><a role="menuitem" href="/wishlist">Wishlist</a></li>
                <li role="none"><button role="menuitem" type="submit" form="logout-form">Sign out</button></li>
              </ul>
              <form id="logout-form" method="post" action="/logout"></form>
            </div>`
          : h`<a class="signin" href="/login?next=${next}">Sign in</a>`}
      </div>
    </div>
  </header>`;
}

const siteFooter = () => h`<footer class="site-footer">
  <div class="cols">
    <div><h4>Shop</h4>${CATEGORIES.map(([slug, name]) => h`<a href="/shop?cat=${slug}">${name}</a>`)}</div>
    <div><h4>Account</h4><a href="/login">Sign in</a><a href="/register">Create account</a><a href="/orders">Orders</a><a href="/wishlist">Wishlist</a><a href="/account">Settings</a><a href="/inbox">Mailbox</a></div>
    <div><h4>Support</h4><a href="/help">Help center</a><a href="/support/new">New ticket</a><a href="/support/tickets">Tickets</a><a href="/support/chat">Chat</a></div>
    <div><h4>Gauntlet</h4><a href="/blog">Journal</a><a href="/lab">Lab</a><a href="/challenges">Challenges</a><a href="/scoreboard">Scoreboard</a><a href="/sitemap">Sitemap</a></div>
  </div>
  <p class="fineprint">Gauntlet Outfitters is a test site for browser automation. Nothing here is real and nothing is for sale.
    <button type="button" class="link-btn" data-inspector-toggle>Event inspector</button></p>
</footer>
<button type="button" class="to-top" aria-label="Back to top" hidden>↑</button>`;

const cookieBanner = () => h`<div class="cookie-banner" role="region" aria-label="Cookie preferences">
  <p>We use cookies to keep you signed in and, if you agree, to measure visits and personalise offers.</p>
  <div class="actions">
    <button type="button" data-consent="customize" class="secondary">Customize</button>
    <button type="button" data-consent="reject" class="secondary">Reject non-essential</button>
    <button type="button" data-consent="all">Accept all</button>
  </div>
</div>
<div class="modal-backdrop" id="consent-modal" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
    <h2 id="consent-title">Cookie settings</h2>
    <label class="switch-row"><span>Strictly necessary</span><input type="checkbox" checked disabled></label>
    <label class="switch-row"><span>Analytics</span><input type="checkbox" name="analytics" checked></label>
    <label class="switch-row"><span>Marketing</span><input type="checkbox" name="marketing" checked></label>
    <div class="actions"><button type="button" data-consent="save">Save preferences</button></div>
  </div>
</div>`;

export function page(o: PageOpts): Raw {
  const { req } = o;
  const shell = o.shell ?? 'site';
  const ids = [...(o.challenges ?? [])];
  const active = activeChallenge(req);
  // The started challenge follows you across pages, except onto pages that host a challenge of their own.
  if (active && !ids.length && shell !== 'bare') ids.push(active.id);
  const strips = ids.map((id) => challenge(id)).filter((c): c is Challenge => !!c).map((c) => strip(c, req));
  const flashes = shell === 'bare' ? [] : takeFlashes(req.session);
  const crumbs = o.crumbs?.length
    ? h`<nav class="crumbs" aria-label="Breadcrumb"><ol>${o.crumbs.map(([label, href], i) =>
        h`<li>${href && i < o.crumbs!.length - 1 ? h`<a href="${href}">${label}</a>` : h`<span aria-current="page">${label}</span>`}</li>`)}</ol></nav>`
    : '';
  const header = shell === 'site' ? siteHeader(req)
    : shell === 'lab' ? h`<header class="lab-header"><a class="logo" href="/"><span class="logo-mark" aria-hidden="true">▲</span> Gauntlet</a>
        <nav aria-label="Lab"><a href="/lab">Lab index</a><a href="/challenges">Challenges</a><a href="/scoreboard">Scoreboard</a></nav></header>`
    : shell === 'app' ? h`<header class="lab-header app-header"><a class="logo" href="/"><span class="logo-mark" aria-hidden="true">▲</span> Gauntlet</a>
        <span class="muted">Workspace</span><nav aria-label="Site"><a href="/">Store</a><a href="/challenges">Challenges</a><a href="/scoreboard">Scoreboard</a></nav></header>`
    : '';
  const footer = shell === 'site' ? siteFooter()
    : shell === 'lab' ? h`<footer class="lab-footer"><button type="button" class="link-btn" data-inspector-toggle>Event inspector</button></footer>` : '';
  const showBanner = shell === 'site' && !req.cookies.consent;
  // Set by the Gauntlet runner: hide the challenge's status so the agent has to judge success itself.
  const agentRun = req.cookies.gauntlet_agent ? 'agent-run' : '';

  return h`<!doctype html>
<html lang="en" ${o.htmlAttrs ?? ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${o.title} · Gauntlet</title>
  <link rel="stylesheet" href="/static/css/site.css">
  ${o.head ?? ''}
</head>
<body class="shell-${shell} ${o.bodyClass ?? ''} ${agentRun}" ${o.lab ? h`data-lab="${o.lab}"` : ''}>
  ${header}
  <main id="main" tabindex="-1">
    ${crumbs}
    ${strips}
    ${flashes.map((f) => h`<div class="flash flash-${f.status}" role="status" data-flash="${f.id}">${f.status === 'pass'
      ? h`✓ Challenge passed: ${challenge(f.id)?.title}. Completion code <code>${f.code}</code>`
      : f.status === 'violation' ? h`⚠ Violation recorded for “${challenge(f.id)?.title}”${f.detail ? h`: ${f.detail}` : ''}`
      : h`✗ ${challenge(f.id)?.title}: ${f.detail ?? 'not quite'}`}</div>`)}
    ${o.body}
  </main>
  ${footer}
  ${showBanner ? cookieBanner() : ''}
  <div class="toasts" aria-live="polite"></div>
  <script src="/static/js/gauntlet.js"></script>
  ${shell === 'site' ? h`<script src="/static/js/site.js"></script>` : ''}
  ${o.lab ? h`<script src="/static/js/lab/${o.lab.split('/')[0]}.js"></script>` : ''}
  ${(o.scripts ?? []).map((s) => h`<script src="${s}"></script>`)}
</body>
</html>`;
}

export function errorPage(req: Req, status: number, title: string, message: Raw | string): Raw {
  return page({
    req, title, crumbs: [['Home', '/'], [title]],
    body: h`<section class="error-page"><p class="error-code">${status}</p><h1>${title}</h1><p>${message}</p>
      <p><a class="button" href="/">Go home</a> <a class="button secondary" href="/sitemap">Sitemap</a></p></section>`,
  });
}
