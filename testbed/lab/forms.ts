// Lab · Forms: HTML5 and server validation, wizards, conditional and repeating
// fields, multiple submit buttons, GET forms, reset and honeypot traps, CSRF,
// autosave, disabled fieldsets, long forms and look-alike labels.

import { randomBytes } from 'node:crypto';
import { h, raw, type Raw } from '../lib/html.ts';
import { get, post, type Req } from '../lib/http.ts';
import { page } from '../lib/layout.ts';
import { report } from '../lib/state.ts';
import { lab } from './kit.ts';

const done = (req: Req, title: string, body: Raw) =>
  page({ req, title, shell: 'lab', crumbs: [['Lab', '/lab'], ['Forms', '/lab/forms'], [title]], body: h`<h1>${title}</h1>${body}` });

const WIZ = ['Plan', 'Seats', 'Billing', 'Review'];
const LONG_FIELDS = ['First name', 'Last name', 'Preferred name', 'Email', 'Phone', 'Street', 'City', 'Province', 'Postal code', 'Country',
  'Date of birth', 'Emergency contact name', 'Emergency contact phone', 'Relationship', 'Employer', 'Job title', 'Years hiking', 'Longest trip (days)',
  'Highest summit', 'First-aid certificate', 'Certificate expiry', 'Swimming ability', 'Dietary needs', 'Allergies', 'Medications', 'Shirt size',
  'Boot size', 'Tent owned', 'Stove owned', 'Car available', 'Seats in car', 'Languages', 'Radio licence', 'Photography', 'Instagram', 'Website',
  'How did you hear about us', 'Availability', 'Notes', 'Signature'];

lab('forms', [
  {
    slug: 'html5-validation', title: 'Browser validation', task: 'Sign up with name Jo, email jo@example.com, age 34 and ZIP code 90210.', check: 'auto', needs: ['type', 'click'], level: 1,
    note: 'Native required, type, min/max and pattern rules block submission with browser bubbles.',
    body: h`<form method="post" action="/lab/forms/html5">
      <label for="v-name">Name</label><input id="v-name" name="name" required>
      <label for="v-email">Email</label><input id="v-email" name="email" type="email" required>
      <label for="v-age">Age</label><input id="v-age" name="age" type="number" min="18" max="99" required>
      <label for="v-zip">ZIP code</label><input id="v-zip" name="zip" pattern="\\d{5}" title="Five digits" required>
      <div class="form-actions"><button type="submit">Sign up</button></div></form>`,
  },
  {
    slug: 'server-validation', title: 'Errors from the server', task: 'Register the username "trailblazer". If it is taken, use the first suggestion the page gives.', check: 'auto', needs: ['type', 'click', 'read'], level: 2,
    body: (req) => serverForm(req, {}, ''),
  },
  {
    slug: 'wizard', title: 'A wizard that remembers', task: 'Complete the signup wizard choosing the Pro plan, 3 seats and annual billing; on the Review step, go back and change the seats to 5, then finish.', check: 'auto', needs: ['click', 'type'], level: 2,
    body: h`<form id="wiz" class="wizard"><ol class="steps" id="wiz-steps">${WIZ.map((s, i) => h`<li class="${i ? '' : 'current'}">${s}</li>`)}</ol>
      <fieldset data-step="0"><legend>Plan</legend>${['Basic', 'Pro', 'Team'].map((p) => h`<label class="inline"><input type="radio" name="plan" value="${p}"> ${p}</label>`)}</fieldset>
      <fieldset data-step="1" hidden><legend>Seats</legend><label for="w-seats">Number of seats</label><input id="w-seats" name="seats" type="number" min="1" max="50" value="1"></fieldset>
      <fieldset data-step="2" hidden><legend>Billing</legend>${['Monthly', 'Annual'].map((p) => h`<label class="inline"><input type="radio" name="billing" value="${p}"> ${p}</label>`)}</fieldset>
      <fieldset data-step="3" hidden><legend>Review</legend><p id="w-review"></p></fieldset>
      <p class="field-error" id="w-error" hidden></p>
      <div class="form-actions"><button type="button" class="secondary" id="w-back" disabled>Back</button><button type="button" id="w-next">Next</button></div></form>`,
  },
  {
    slug: 'conditional', title: 'Fields that appear', task: 'Request a group quote: tick "Group booking" and set the group size to 8, choose Yes for a guide and pick French as the guide language, then send.', check: 'auto', needs: ['click', 'type', 'select'], level: 2,
    body: h`<form id="cond"><label class="inline"><input type="checkbox" id="c-group"> Group booking</label>
      <div id="c-size-wrap" hidden><label for="c-size">Group size</label><input id="c-size" type="number" min="2" max="40"></div>
      <fieldset><legend>Do you want a guide?</legend><label class="inline"><input type="radio" name="guide" value="no" checked> No</label><label class="inline"><input type="radio" name="guide" value="yes"> Yes</label></fieldset>
      <div id="c-lang-wrap" hidden><label for="c-lang">Guide language</label><select id="c-lang"><option value="">Choose…</option><option>English</option><option>French</option><option>German</option><option>Japanese</option></select></div>
      <div class="form-actions"><button type="submit">Send request</button></div></form>`,
  },
  {
    slug: 'repeat-rows', title: 'Add rows', task: 'List three travellers: Ana aged 12, Ben aged 34 and Cy aged 67. Then save.', check: 'auto', needs: ['click', 'type'], level: 2,
    body: h`<form id="trav"><div id="trav-rows"></div><button type="button" class="secondary" id="trav-add">+ Add traveller</button><div class="form-actions"><button type="submit">Save travellers</button></div></form>`,
  },
  {
    slug: 'two-submits', title: 'Two submit buttons', task: 'Publish the post titled "Autumn colours".', check: 'auto', needs: ['type', 'click'], level: 1,
    body: h`<form method="post" action="/lab/forms/post"><label for="p-title">Title</label><input id="p-title" name="title"><label for="p-body">Body</label><textarea id="p-body" name="body">Larches turn gold in late September.</textarea>
      <div class="form-actions"><button type="submit" name="action" value="draft" class="secondary">Save draft</button><button type="submit" name="action" value="publish">Publish</button></div></form>`,
  },
  {
    slug: 'get-search', title: 'A GET search form', task: 'Search trails for "ridge" with difficulty Hard.', check: 'auto', needs: ['type', 'select', 'click'], level: 1,
    body: h`<form method="get" action="/lab/forms/trails"><label for="tq">Keywords</label><input id="tq" name="q" type="search">
      <label for="td">Difficulty</label><select id="td" name="difficulty"><option value="">Any</option><option>Easy</option><option>Moderate</option><option>Hard</option></select>
      <div class="form-actions"><button type="submit">Search trails</button></div></form>`,
  },
  {
    slug: 'reset-trap', title: 'A Reset button that looks like Submit', task: 'Fill in the shipping form (name Jo Doe, city Calgary, postal code T2P 1J9) and submit it.', check: 'auto', needs: ['type', 'click'], level: 2,
    note: 'The Reset button is styled exactly like the Submit button and sits first.',
    body: h`<form id="rt"><label for="rt-name">Name</label><input id="rt-name"><label for="rt-city">City</label><input id="rt-city"><label for="rt-postal">Postal code</label><input id="rt-postal">
      <div class="form-actions"><button type="reset">Reset form</button><button type="submit">Submit form</button></div></form>`,
  },
  {
    slug: 'honeypot', title: 'Leave the hidden field alone', task: 'Send the contact form with the name Jo and the message "Hello".', check: 'auto', needs: ['type', 'click'], level: 1,
    note: 'A visually hidden "Website" field catches bots. Filling it records a violation.',
    body: h`<form method="post" action="/lab/forms/contact"><label for="hp-name">Name</label><input id="hp-name" name="name"><label for="hp-msg">Message</label><textarea id="hp-msg" name="message"></textarea>
      <div class="hp"><label for="hp-site">Website (leave empty)</label><input id="hp-site" name="website" tabindex="-1" autocomplete="off"></div>
      <div class="form-actions"><button type="submit">Send</button></div></form>`,
  },
  {
    slug: 'csrf', title: 'An expiring CSRF token', task: 'Submit the feedback form with the text "Great trails". If the page says the form expired, reload it and try again.', check: 'auto', needs: ['type', 'click', 'navigate'], level: 2,
    note: 'The hidden token expires 30 seconds after the page loads.',
    body: (req) => {
      const token = randomBytes(8).toString('hex');
      req.session.data.csrf = { token, at: Date.now() };
      return h`<form method="post" action="/lab/forms/feedback"><input type="hidden" name="csrf" value="${token}"><label for="fb-text">Feedback</label><textarea id="fb-text" name="text"></textarea>
        <div class="form-actions"><button type="submit">Send feedback</button></div></form>`;
    },
  },
  {
    slug: 'autosave', title: 'Autosave', task: 'Write "Remember the bear canister" in the notes and wait until it says Saved.', check: 'auto', needs: ['type', 'wait'], level: 1,
    body: h`<label for="as-notes">Trip notes</label><textarea id="as-notes"></textarea><p class="muted" id="as-state">All changes saved.</p>`,
  },
  {
    slug: 'disabled-fieldset', title: 'Unlock the fieldset', task: 'Enter the reservation number R-2048 and look it up.', check: 'auto', needs: ['click', 'type'], level: 1,
    body: h`<form id="res"><label class="inline"><input type="checkbox" id="has-res"> I have a reservation number</label>
      <fieldset id="res-fields" disabled><legend>Reservation</legend><label for="res-no">Reservation number</label><input id="res-no"><button type="submit">Look up</button></fieldset></form><p class="muted" id="res-state"></p>`,
  },
  {
    slug: 'long-form', title: 'Forty fields', task: 'In the application form, set "Emergency contact phone" to 555-0100 and "Dietary needs" to Vegetarian, then submit. Leave every other field as it is.', check: 'auto', needs: ['type', 'scroll', 'click'], level: 2,
    body: h`<form id="long" class="long-form">${LONG_FIELDS.map((f, i) => h`<div><label for="lf-${i}">${f}</label><input id="lf-${i}" name="${f}" ${f === 'First name' ? raw('value="Demo"') : ''}></div>`)}
      <div class="form-actions"><button type="submit">Submit application</button></div></form>`,
  },
  {
    slug: 'same-labels', title: 'Two forms, same labels', task: 'Set the shipping city to Calgary and the billing city to Regina, then save both addresses.', check: 'auto', needs: ['type', 'click'], level: 2,
    body: h`<form id="addrs" class="grid-2">${['Shipping', 'Billing'].map((k) => h`<fieldset><legend>${k} address</legend>
      <label for="${k}-street">Street</label><input id="${k}-street"><label for="${k}-city">City</label><input id="${k}-city"><label for="${k}-postal">Postal code</label><input id="${k}-postal"></fieldset>`)}
      <div class="form-actions"><button type="submit">Save addresses</button></div></form>`,
  },
]);

function serverForm(req: Req, v: Record<string, string>, error: string): Raw {
  return h`${error ? h`<div class="flash error" role="alert">${raw(error)}</div>` : ''}<form method="post" action="/lab/forms/register">
    <label for="sv-user">Username</label><input id="sv-user" name="username" value="${v.username ?? ''}">
    <label for="sv-email">Email</label><input id="sv-email" name="email" type="email" value="${v.email ?? 'jo@example.com'}">
    <div class="form-actions"><button type="submit">Register</button></div></form>`;
}

post('/lab/forms/html5', (req) => {
  const f = req.form;
  const ok = f.get('name') === 'Jo' && f.get('email') === 'jo@example.com' && f.get('age') === '34' && f.get('zip') === '90210';
  report(req, 'lab/forms/html5-validation', ok ? 'pass' : 'fail', `name ${f.get('name')}, age ${f.get('age')}, zip ${f.get('zip')}`);
  return done(req, 'Signed up', h`<p>Welcome, ${f.get('name')}.</p>`);
});

post('/lab/forms/register', (req) => {
  const u = (req.form.get('username') ?? '').trim();
  const v = { username: u, email: req.form.get('email') ?? '' };
  if (u === 'trailblazer') {
    req.res.statusCode = 422;
    return page({ req, title: 'Errors from the server', shell: 'lab', lab: 'forms/server-validation', challenges: ['lab/forms/server-validation'],
      body: h`<h1>Errors from the server</h1>${serverForm(req, v, 'That username is taken. Try <strong>trailblazer_26</strong> or <strong>trailblazer.jo</strong>.')}` });
  }
  report(req, 'lab/forms/server-validation', u === 'trailblazer_26' ? 'pass' : 'fail', `registered ${u}`);
  return done(req, 'Registered', h`<p>Account <strong>${u}</strong> created.</p>`);
});

post('/lab/forms/post', (req) => {
  const title = (req.form.get('title') ?? '').trim(), action = req.form.get('action');
  report(req, 'lab/forms/two-submits', title === 'Autumn colours' && action === 'publish' ? 'pass' : 'fail', `${action} "${title}"`);
  return done(req, action === 'publish' ? 'Published' : 'Draft saved', h`<p>“${title}” was ${action === 'publish' ? 'published' : 'saved as a draft'}.</p>`);
});

get('/lab/forms/trails', (req) => {
  const q = (req.query.get('q') ?? '').trim(), d = req.query.get('difficulty') ?? '';
  report(req, 'lab/forms/get-search', q.toLowerCase() === 'ridge' && d === 'Hard' ? 'pass' : 'fail', `q=${q}, difficulty=${d || 'Any'}`);
  return done(req, 'Trail results', h`<p>Results for “${q}”${d ? ` (${d})` : ''}:</p><ul><li>Larch Ridge</li><li>Sentinel Ridge</li></ul>`);
});

post('/lab/forms/contact', (req) => {
  const name = (req.form.get('name') ?? '').trim(), msg = (req.form.get('message') ?? '').trim(), site = req.form.get('website') ?? '';
  if (site) report(req, 'lab/forms/honeypot', 'violation', `filled the honeypot with "${site}"`);
  else report(req, 'lab/forms/honeypot', name === 'Jo' && msg === 'Hello' ? 'pass' : 'fail', `${name}: ${msg}`);
  return done(req, 'Message sent', h`<p>Thanks, ${name}.</p>`);
});

post('/lab/forms/feedback', (req) => {
  const c = req.session.data.csrf;
  if (!c || c.token !== req.form.get('csrf') || Date.now() - c.at > 30_000) {
    req.res.statusCode = 419;
    return done(req, 'Form expired', h`<p>This form expired for security reasons. <a href="/lab/forms/csrf">Reload the form</a> and send it again.</p>`);
  }
  const text = (req.form.get('text') ?? '').trim();
  report(req, 'lab/forms/csrf', text === 'Great trails' ? 'pass' : 'fail', `sent "${text}"`);
  return done(req, 'Feedback sent', h`<p>Thanks for the feedback.</p>`);
});
