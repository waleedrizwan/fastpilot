// Support: help center with searchable FAQ and long articles, tickets with
// attachments and drafts, and a chat bot that answers after a delay.

import { define } from '../challenges.ts';
import { product, SUPPORT_CATEGORIES, type Ticket } from '../lib/data.ts';
import { h, jsonScript, raw, type Raw } from '../lib/html.ts';
import { get, json, post, redirect, type Req } from '../lib/http.ts';
import { errorPage, page } from '../lib/layout.ts';
import { report, stores } from '../lib/state.ts';

const rmaCode = (order: number) => `RMA-${order}-${((order * 7919) % 1296).toString(36).toUpperCase().padStart(2, '0')}`;

define(
  {
    id: 'support/faq-search', area: 'support', title: 'Search the FAQ', path: '/help',
    task: 'Use the help center search to find how many days you have to return unused gear. Submit the number in the Answer box.',
    check: 'answer', needs: ['type', 'click', 'read'], level: 1, answer: 60,
  },
  {
    id: 'support/toc-anchor', area: 'support', title: 'Deep in the terms', path: '/help/terms',
    task: 'In the Terms of sale article, go to section 9, Governing law, and submit the city named there in the Answer box.',
    check: 'answer', needs: ['click', 'read', 'type'], level: 1, answer: 'Halifax',
  },
  {
    id: 'support/old-policy', area: 'support', title: 'Last year\'s policy', path: '/help/returns',
    task: 'In the Returns help article, switch to the 2025 version of the policy and submit how many days returns were allowed then.',
    check: 'answer', needs: ['select', 'read', 'type'], level: 1, answer: 30,
  },
  {
    id: 'support/new-ticket', area: 'support', title: 'File a billing ticket', path: '/support/new',
    task: 'File a High-priority support ticket in Billing → Double charge with the subject "Charged twice for order 1006", CC sam@example.com, and a one-sentence description of the problem.',
    check: 'auto', needs: ['type', 'select', 'click', 'key'], level: 2, note: 'CC is a chip input: type an address and press Enter or comma.',
  },
  {
    id: 'support/save-draft', area: 'support', title: 'Save, don\'t send', path: '/support/new',
    task: 'Start a support ticket in Products → Repair request with the subject "Tent zipper stuck", and save it as a draft instead of submitting it.',
    check: 'auto', needs: ['type', 'select', 'click'], level: 1,
  },
  {
    id: 'support/attachment', area: 'support', title: 'Ticket with a photo', path: '/support/new',
    task: 'File a Normal-priority ticket in Products → Warranty claim with the subject "Cracked pole", a short description, and any image file attached.',
    check: 'auto', needs: ['type', 'select', 'click', 'upload'], level: 2,
  },
  {
    id: 'support/reply-ticket', area: 'support', title: 'Reply and resolve', path: '/support/tickets',
    task: 'Reply to the support ticket "Tent pole cracked" saying the photo is attached (include the words "photo attached"), then mark the ticket resolved.',
    check: 'auto', needs: ['click', 'type'], level: 2,
  },
  {
    id: 'support/chat-status', area: 'support', title: 'Ask the bot', path: '/support/chat',
    task: 'Ask the support chat for the status of order 1007 and submit the status it gives in the Answer box.',
    check: 'answer', needs: ['click', 'type', 'wait', 'read'], level: 2, answer: 'Shipped',
  },
  {
    id: 'support/chat-return', area: 'support', title: 'Return through chat', path: '/support/chat',
    task: 'Use the support chat to start a return for order 1002, and submit the return code the bot gives you in the Answer box.',
    check: 'answer', needs: ['click', 'type', 'wait', 'read'], level: 2, answer: rmaCode(1002),
  },
);

// Help center

interface Article { slug: string; title: string; summary: string; body: (req: Req) => Raw }

const FAQ: [q: string, a: string][] = [
  ['How long do I have to return something?', 'Unused gear can be returned within 60 days of delivery. Used gear can be repaired at cost.'],
  ['When will my order ship?', 'In-stock orders ship within 1–2 business days. You get an email with tracking when it does.'],
  ['Do you ship internationally?', 'We ship to Canada, the United States, the United Kingdom and Australia.'],
  ['How do I use a promo code?', 'Enter it in the Promo code box on the cart page and press Apply.'],
  ['What does the warranty cover?', 'Defects in materials and workmanship for two years from purchase.'],
  ['How do I reset my password?', 'Use "Forgot your password?" on the sign-in page. The link arrives in your mailbox.'],
  ['Can I change my shipping address after ordering?', 'Yes, while the order is still Processing. Open a ticket in Orders → Change address.'],
  ['Is my payment information stored?', 'No. This is a test store and never takes payment.'],
  ['How do I turn on two-factor authentication?', 'Go to Account settings → Security and press "Turn on two-factor".'],
  ['Do you repair gear?', 'Yes. Open a ticket in Products → Repair request and we will send a prepaid label.'],
];

const TERMS_SECTIONS = [
  'Who we are', 'Orders and acceptance', 'Prices and taxes', 'Shipping', 'Returns', 'Warranty', 'Limitation of liability', 'Privacy', 'Governing law', 'Changes to these terms',
];

const ARTICLES: Article[] = [
  {
    slug: 'returns', title: 'Returns and exchanges', summary: 'How long you have, what qualifies and how to start a return.',
    body: (req) => {
      const v2025 = req.query.get('v') === '2025';
      return h`<div class="row"><label class="inline" for="policy-version">Policy version</label>
        <select id="policy-version" data-navigate>
          <option value="/help/returns" ${v2025 ? '' : raw('selected')}>Current (from January 2026)</option>
          <option value="/help/returns?v=2025" ${v2025 ? raw('selected') : ''}>2025</option>
        </select></div>
        <p>${v2025 ? 'Under the 2025 policy, unused gear could be returned within 30 days of delivery.' : 'Unused gear can be returned within 60 days of delivery.'}
          Items must be clean and in their original packaging. Start a return from your order page or through the support chat.</p>
        <p>Refunds go back to the original payment method within 5 business days of the return arriving at our warehouse.</p>`;
    },
  },
  {
    slug: 'shipping', title: 'Shipping options', summary: 'Standard, Express and Overnight shipping, and when they are free.',
    body: () => h`<table><thead><tr><th>Method</th><th>Time</th><th>Price</th></tr></thead><tbody>
      <tr><td>Standard</td><td>5–7 business days</td><td>$9.95, free over $150</td></tr>
      <tr><td>Express</td><td>2 business days</td><td>$19.95</td></tr>
      <tr><td>Overnight</td><td>Next business day</td><td>$39.95</td></tr></tbody></table>`,
  },
  {
    slug: 'warranty', title: 'Warranty and repairs', summary: 'What the two-year warranty covers and how repairs work.',
    body: () => h`<p>Every product carries a two-year warranty against defects in materials and workmanship.</p>
      <p>Damage from normal wear, accidents or misuse is not covered, but we repair it at cost. Open a ticket in Products → Repair request.</p>`,
  },
  {
    slug: 'terms', title: 'Terms of sale', summary: 'The legal terms for buying from Gauntlet Outfitters.',
    body: () => h`<nav class="toc card" aria-label="Contents"><strong>Contents</strong><ol>${TERMS_SECTIONS.map((t, i) => h`<li><a href="#section-${i + 1}">${t}</a></li>`)}</ol></nav>
      ${TERMS_SECTIONS.map((t, i) => h`<section id="section-${i + 1}" class="terms-section"><h2>${i + 1}. ${t}</h2>
        ${i === 8 ? h`<p>These terms are governed by the laws of Nova Scotia, and any dispute will be heard in the courts of Halifax.</p>` : ''}
        ${Array.from({ length: 4 }, () => h`<p>${`This section describes ${t.toLowerCase()} in detail. `.repeat(6)}</p>`)}
        <p><a href="#top" class="small">Back to top</a></p></section>`)}`,
  },
];

const faqList = () => h`<div class="faq" data-faq>${FAQ.map(([q, a]) => h`<details><summary>${q}</summary><p>${a}</p></details>`)}</div>`;

get('/support', (req) => page({
  req, title: 'Support', crumbs: [['Home', '/'], ['Support']],
  body: h`<h1>How can we help?</h1>
    <form action="/help" method="get" class="row help-search"><input type="search" name="q" placeholder="Search help articles" aria-label="Search help"><button type="submit">Search</button></form>
    <div class="area-cards">
      <a class="card area-card" href="/help"><h2>Help center</h2><p>Answers to common questions.</p></a>
      <a class="card area-card" href="/support/new"><h2>New ticket</h2><p>Tell us what went wrong.</p></a>
      <a class="card area-card" href="/support/tickets"><h2>Your tickets</h2><p>Replies and status.</p></a>
      <a class="card area-card" href="/support/chat"><h2>Chat</h2><p>Talk to our assistant.</p></a>
    </div>`,
}));

get('/help', (req) => {
  const q = (req.query.get('q') ?? '').trim();
  return page({
    req, title: 'Help center', crumbs: [['Home', '/'], ['Support', '/support'], ['Help center']], scripts: ['/static/js/pages/support.js'],
    body: h`<h1>Help center</h1>
      <div class="row help-search"><input type="search" id="faq-filter" value="${q}" placeholder="Search questions" aria-label="Search questions">
        <span class="muted small" data-faq-count aria-live="polite"></span></div>
      <h2>Frequently asked questions</h2>${faqList()}
      <h2>Articles</h2>
      <ul class="article-list">${ARTICLES.map((a) => h`<li><a href="/help/${a.slug}">${a.title}</a><br><span class="muted small">${a.summary}</span></li>`)}</ul>`,
  });
});

get('/help/:slug', (req) => {
  const a = ARTICLES.find((x) => x.slug === req.params.slug);
  if (!a) { req.res.statusCode = 404; return errorPage(req, 404, 'Article not found', 'That help article does not exist.'); }
  return page({
    req, title: a.title, crumbs: [['Home', '/'], ['Help center', '/help'], [a.title]], scripts: ['/static/js/pages/support.js'],
    body: h`<article class="help-article" id="top"><h1>${a.title}</h1>${a.body(req)}
      <div class="helpful card" data-helpful><span>Was this article helpful?</span>
        <button type="button" class="small secondary" data-vote="yes">Yes</button><button type="button" class="small secondary" data-vote="no">No</button>
        <form hidden data-feedback><label for="fb">What was missing?</label><textarea id="fb"></textarea><button type="submit" class="small">Send feedback</button></form>
      </div></article>`,
  });
});

// Tickets


function ticketForm(req: Req, v: Record<string, string>, errors: Record<string, string>): Raw {
  const subs = SUPPORT_CATEGORIES[v.category] ?? [];
  return page({
    req, title: 'New ticket', crumbs: [['Home', '/'], ['Support', '/support'], ['New ticket']], scripts: ['/static/js/pages/support.js'],
    body: h`<h1>Open a support ticket</h1>
      ${v.savedDraft ? h`<div class="flash info" role="status">Draft saved. You can come back to it any time.</div>` : ''}
      ${Object.keys(errors).length ? h`<div class="flash error" role="alert">${Object.values(errors).join(' ')}</div>` : ''}
      <form method="post" action="/support/new" enctype="multipart/form-data" class="ticket-form" novalidate>
        <label for="t-subject">Subject</label><input id="t-subject" name="subject" value="${v.subject ?? ''}" maxlength="120">
        <div class="grid-2">
          <div><label for="t-category">Category</label>
            <select id="t-category" name="category" data-category><option value="">Choose a category…</option>
              ${Object.keys(SUPPORT_CATEGORIES).map((c) => h`<option ${c === v.category ? raw('selected') : ''}>${c}</option>`)}</select></div>
          <div><label for="t-sub">Topic</label>
            <select id="t-sub" name="subcategory" data-subcategory ${subs.length ? '' : raw('disabled')}><option value="">${subs.length ? 'Choose a topic…' : 'Choose a category first'}</option>
              ${subs.map((s) => h`<option ${s === v.subcategory ? raw('selected') : ''}>${s}</option>`)}</select></div>
        </div>
        <div data-order-field ${v.category === 'Orders' ? '' : raw('hidden')}><label for="t-order">Order number</label><input id="t-order" name="order" value="${v.order ?? ''}" inputmode="numeric"></div>
        <fieldset><legend>Priority</legend>
          ${['Low', 'Normal', 'High', 'Urgent'].map((p) => h`<label class="inline"><input type="radio" name="priority" value="${p}" ${p === (v.priority || 'Normal') ? raw('checked') : ''}> ${p}</label>`)}
        </fieldset>
        <label for="t-body">Describe the problem</label>
        <textarea id="t-body" name="body" maxlength="2000" data-counter>${v.body ?? ''}</textarea>
        <p class="hint"><span data-count>${2000 - (v.body ?? '').length}</span> characters left</p>
        <label for="t-cc">CC (press Enter or comma after each address)</label>
        <div class="chips-input" data-chips>
          ${(v.cc ?? '').split(',').filter(Boolean).map((e) => h`<span class="chip-item">${e}<button type="button" aria-label="Remove ${e}">×</button></span>`)}
          <input id="t-cc" type="email" autocomplete="off" placeholder="name@example.com">
        </div>
        <input type="hidden" name="cc" value="${v.cc ?? ''}">
        <label for="t-files">Attachments</label>
        <div class="dropzone" data-dropzone>
          <p>Drag photos here, or <label for="t-files" class="link-like">browse</label></p>
          <input id="t-files" name="attachments" type="file" multiple accept="image/*,.pdf,.txt">
          <ul class="file-list" data-file-list></ul>
        </div>
        <fieldset><legend>Contact me by</legend>
          <label class="inline"><input type="checkbox" name="contact" value="email" checked> Email</label>
          <label class="inline"><input type="checkbox" name="contact" value="phone" data-phone-toggle> Phone</label>
          <div data-phone hidden><label for="t-phone">Phone number</label><input id="t-phone" name="phone" type="tel"></div>
        </fieldset>
        <div class="hp" aria-hidden="true"><label for="t-website">Website</label><input id="t-website" name="website" tabindex="-1" autocomplete="off"></div>
        <div class="form-actions">
          <button type="submit" name="action" value="draft" class="secondary">Save draft</button>
          <button type="submit" name="action" value="submit">Submit ticket</button>
        </div>
      </form>
      ${jsonScript('subcategories', SUPPORT_CATEGORIES)}`,
  });
}

get('/support/new', (req) => {
  const draft = req.query.get('draft') ? req.session.data.ticketDraft : undefined;
  return ticketForm(req, draft ? { ...draft, savedDraft: '1' } : {}, {});
});

post('/support/new', (req) => {
  const f = req.form;
  const v = Object.fromEntries(['subject', 'category', 'subcategory', 'order', 'priority', 'body', 'cc', 'phone', 'website'].map((k) => [k, (f.get(k) ?? '').trim()]));
  const action = f.get('action') === 'draft' ? 'draft' : 'submit';
  const files = req.files.filter((x) => x.field === 'attachments');
  const cc = v.cc.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (action === 'draft') {
    req.session.data.ticketDraft = v;
    const ok = v.category === 'Products' && v.subcategory === 'Repair request' && v.subject.toLowerCase() === 'tent zipper stuck';
    if (ok) report(req, 'support/save-draft', 'pass', 'draft saved');
    return redirect(req, '/support/new?draft=1', 303);
  }
  const errors: Record<string, string> = {};
  if (!v.subject) errors.subject = 'Add a subject.';
  if (!SUPPORT_CATEGORIES[v.category]?.includes(v.subcategory)) errors.category = 'Choose a category and topic.';
  if (!v.body) errors.body = 'Describe the problem.';
  if (cc.some((e) => !/^\S+@\S+\.\S+$/.test(e))) errors.cc = 'One of the CC addresses is not valid.';
  if (Object.keys(errors).length) { req.res.statusCode = 422; return ticketForm(req, v, errors); }

  const ticket: Ticket = {
    id: Math.max(...stores.tickets.map((t) => t.id)) + 1, subject: v.subject, category: v.category, subcategory: v.subcategory,
    priority: v.priority || 'Normal', status: v.website ? 'Spam' : 'Open', cc, body: v.body, created: new Date().toISOString().slice(0, 10),
    replies: [], attachments: files.map((x) => `${x.filename} (${Math.ceil(x.size / 1024)} KB)`),
  };
  stores.tickets.push(ticket);
  req.session.data.ticketDraft = undefined;
  if (v.subject.toLowerCase().includes('charged twice')) {
    const ok = v.category === 'Billing' && v.subcategory === 'Double charge' && ticket.priority === 'High' &&
      v.subject.toLowerCase() === 'charged twice for order 1006' && cc.includes('sam@example.com') && !v.website;
    report(req, 'support/new-ticket', ok ? 'pass' : 'fail', v.website ? 'filled the hidden honeypot field' : `${ticket.priority} ${v.category} → ${v.subcategory}, cc ${cc.join(', ') || 'none'}`);
  }
  if (v.subject.toLowerCase() === 'cracked pole') {
    const ok = v.category === 'Products' && v.subcategory === 'Warranty claim' && ticket.priority === 'Normal' && files.some((x) => /^image\//.test(x.type));
    report(req, 'support/attachment', ok ? 'pass' : 'fail', `${files.length} attachment(s)`);
  }
  redirect(req, `/support/tickets/${ticket.id}`, 303);
});

const STATUS_PILL: Record<string, string> = { Open: 'status-fail', 'Waiting on customer': 'status-pending', Closed: 'status-pass', Resolved: 'status-pass', Spam: 'status-violation' };

get('/support/tickets', (req) => {
  const status = req.query.get('status') ?? '';
  const list = stores.tickets.filter((t) => !status || (status === 'closed' ? ['Closed', 'Resolved'].includes(t.status) : status === 'open' ? !['Closed', 'Resolved'].includes(t.status) : true));
  return page({
    req, title: 'Your tickets', crumbs: [['Home', '/'], ['Support', '/support'], ['Tickets']],
    body: h`<h1>Your tickets</h1>
      <nav class="seg" aria-label="Filter tickets">${[['', 'All'], ['open', 'Open'], ['closed', 'Closed']].map(([s, label]) =>
        h`<a href="/support/tickets${s ? `?status=${s}` : ''}" ${s === status ? raw('aria-current="page"') : ''}>${label}</a>`)}</nav>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Opened</th></tr></thead>
        <tbody>${[...list].reverse().map((t) => h`<tr><td>${t.id}</td><td><a href="/support/tickets/${t.id}">${t.subject}</a></td><td>${t.category} → ${t.subcategory}</td>
          <td>${t.priority}</td><td><span class="pill ${STATUS_PILL[t.status] ?? ''}">${t.status}</span></td><td>${t.created}</td></tr>`)}</tbody></table></div>
      <p><a class="button" href="/support/new">Open a new ticket</a></p>`,
  });
});

get('/support/tickets/:id', (req) => {
  const t = stores.tickets.find((x) => x.id === Number(req.params.id));
  if (!t) { req.res.statusCode = 404; return errorPage(req, 404, 'Ticket not found', 'That ticket does not exist.'); }
  const closed = ['Closed', 'Resolved'].includes(t.status);
  return page({
    req, title: t.subject, crumbs: [['Home', '/'], ['Support', '/support'], ['Tickets', '/support/tickets'], [`#${t.id}`]], scripts: ['/static/js/pages/support.js'],
    body: h`<h1>${t.subject} <span class="pill ${STATUS_PILL[t.status] ?? ''}">${t.status}</span></h1>
      <p class="muted">#${t.id} · ${t.category} → ${t.subcategory} · ${t.priority} priority · opened ${t.created}${t.cc.length ? ` · CC ${t.cc.join(', ')}` : ''}</p>
      <ol class="thread">
        <li class="msg mine"><p class="who">You</p><p>${t.body}</p>${t.attachments.length ? h`<p class="muted small">📎 ${t.attachments.join(', ')}</p>` : ''}</li>
        ${t.replies.map((r) => h`<li class="msg ${r.from === 'You' ? 'mine' : ''}"><p class="who">${r.from} · ${r.at}</p><div class="md">${raw(markdown(r.body))}</div></li>`)}
      </ol>
      ${closed ? h`<p class="muted">This ticket is ${t.status.toLowerCase()}.</p>` : h`<form method="post" action="/support/tickets/${t.id}/reply" class="reply-form">
        <div role="tablist" aria-label="Reply editor"><button role="tab" type="button" id="tab-write" aria-controls="panel-write" aria-selected="true">Write</button>
          <button role="tab" type="button" id="tab-preview" aria-controls="panel-preview" aria-selected="false" tabindex="-1">Preview</button></div>
        <div role="tabpanel" id="panel-write" aria-labelledby="tab-write"><label for="reply" class="sr-only">Reply</label><textarea id="reply" name="body" placeholder="Write a reply. **Markdown** works."></textarea></div>
        <div role="tabpanel" id="panel-preview" aria-labelledby="tab-preview" hidden><div class="md preview" data-preview></div></div>
        <div class="form-actions"><button type="submit">Send reply</button></div>
      </form>
      <form method="post" action="/support/tickets/${t.id}/resolve"><button type="submit" class="secondary">Mark as resolved</button></form>`}`,
  });
});

/** Tiny Markdown: escapes, then **bold**, *italic*, `code` and [links](url). */
function markdown(src: string): string {
  return h`${src}`.__html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2">$1</a>').split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

function checkReply(req: Req, t: Ticket) {
  if (t.id !== 501) return;
  const replied = t.replies.some((r) => r.from === 'You' && /photo attached/i.test(r.body));
  if (replied && ['Resolved', 'Closed'].includes(t.status)) report(req, 'support/reply-ticket', 'pass', 'replied and resolved');
}

post('/support/tickets/:id/reply', (req) => {
  const t = stores.tickets.find((x) => x.id === Number(req.params.id));
  const body = (req.form.get('body') ?? '').trim();
  if (t && body) {
    t.replies.push({ from: 'You', body, at: new Date().toISOString().slice(0, 10) });
    checkReply(req, t);
  }
  redirect(req, `/support/tickets/${req.params.id}`, 303);
});

post('/support/tickets/:id/resolve', (req) => {
  const t = stores.tickets.find((x) => x.id === Number(req.params.id));
  if (t) {
    t.status = 'Resolved';
    checkReply(req, t);
  }
  redirect(req, `/support/tickets/${req.params.id}`, 303);
});

// Chat bot

interface ChatState { stage: 'start' | 'order-status' | 'return' | 'human'; }

function bot(req: Req, text: string): { reply: string; chips: string[] } {
  const st: ChatState = (req.session.data.chat ??= { stage: 'start' });
  const t = text.trim().toLowerCase();
  const num = Number(t.match(/\d{3,}/)?.[0]);
  const order = stores.orders.find((o) => o.id === num);
  const MENU = ['Track an order', 'Return an item', 'Talk to a human'];
  if (/human|agent|person/.test(t)) {
    st.stage = 'human';
    return { reply: 'All of our people are helping other hikers right now. You are number 3 in the queue. I can still help with orders and returns.', chips: MENU };
  }
  if (/track|status|where/.test(t) && !num) { st.stage = 'order-status'; return { reply: 'Sure. What is the order number?', chips: [] }; }
  if (/return|refund|send back/.test(t) && !num) { st.stage = 'return'; return { reply: 'I can start a return. Which order is it for?', chips: [] }; }
  if (num && (st.stage === 'return' || /return/.test(t))) {
    st.stage = 'start';
    if (!order) return { reply: `I couldn't find order ${num}. Check the number on your receipt.`, chips: MENU };
    if (order.status !== 'Delivered') return { reply: `Order ${num} hasn't been delivered yet, so it can't be returned. Its status is ${order.status}.`, chips: MENU };
    return { reply: `Done! Your return code for order ${num} is ${rmaCode(num)}. Print it and put it in the box.`, chips: MENU };
  }
  if (num) {
    st.stage = 'start';
    if (!order) return { reply: `I couldn't find order ${num}. Check the number on your receipt.`, chips: MENU };
    const items = order.items.map((i) => product(i.slug)!.name).join(', ');
    return { reply: `Order ${num} (${items}) is ${order.status}.${order.tracking ? ` Tracking number ${order.tracking}.` : ''}`, chips: MENU };
  }
  if (/^(hi|hello|hey)\b/.test(t)) return { reply: 'Hi! What can I help you with today?', chips: MENU };
  return { reply: "Sorry, I didn't catch that. I can track orders, start returns, or find a human.", chips: MENU };
}

get('/support/chat', (req) => page({
  req, title: 'Chat', crumbs: [['Home', '/'], ['Support', '/support'], ['Chat']], scripts: ['/static/js/pages/support.js'],
  body: h`<h1>Chat with us</h1>
    <div class="chat card" data-chat>
      <ol class="chat-log" aria-live="polite" aria-label="Conversation">
        <li class="msg bot"><p class="who">Trail Bot</p><p>Hi! I'm Trail Bot. I can track orders, start returns, or find a human.</p></li>
      </ol>
      <div class="typing" hidden aria-hidden="true"><span></span><span></span><span></span> Trail Bot is typing</div>
      <div class="chips-row" data-chat-chips>${['Track an order', 'Return an item', 'Talk to a human'].map((c) => h`<button type="button" class="small secondary">${c}</button>`)}</div>
      <form class="chat-form" data-chat-form>
        <label for="chat-input" class="sr-only">Message</label>
        <textarea id="chat-input" rows="1" placeholder="Type a message. Enter sends, Shift+Enter adds a line."></textarea>
        <button type="submit">Send</button>
      </form>
    </div>`,
}));

post('/api/chat', (req) => {
  const text = String(req.json?.text ?? '').slice(0, 500);
  const out = bot(req, text);
  setTimeout(() => json(req, out), 900 + Math.floor(Math.random() * 1200));
});
