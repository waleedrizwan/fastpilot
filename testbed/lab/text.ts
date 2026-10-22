// Lab · Text input: every input type, masks, filters, controlled inputs,
// suggestions, chips, Enter vs Shift+Enter, contenteditable and unicode.

import { h } from '../lib/html.ts';
import { lab } from './kit.ts';

const field = (id: string, label: string, attrs = '') => h`<label for="${id}">${label}</label><input id="${id}" ${{ __html: attrs }}>`;

lab('text', [
  {
    slug: 'input-types', title: 'Every input type', check: 'auto', needs: ['type', 'click'], level: 2,
    task: 'Fill the profile form: name Jo Doe, email jo@example.com, age 34, phone +1 416 555 0199, website https://jo.example, favourite trail search "ridge", bio "Weekend hiker." Then save it.',
    body: h`<form id="types" class="stack-form" novalidate>
      ${field('t-name', 'Name', 'type="text"')}${field('t-email', 'Email', 'type="email"')}${field('t-age', 'Age', 'type="number" min="0" max="120"')}
      ${field('t-phone', 'Phone', 'type="tel"')}${field('t-web', 'Website', 'type="url"')}${field('t-search', 'Favourite trail', 'type="search"')}
      <label for="t-bio">Bio</label><textarea id="t-bio"></textarea>
      <div class="form-actions"><button type="submit">Save profile</button></div></form>`,
  },
  {
    slug: 'masked-phone', title: 'Masked phone number', task: 'Enter the phone number 416 555 0199 and press Save.', check: 'auto', needs: ['type', 'click'], level: 1,
    note: 'The field formats as you type, e.g. (416) 555-0199.',
    body: h`<form id="mask"><label for="phone">Mobile number</label><input id="phone" inputmode="tel" placeholder="(555) 555-5555" autocomplete="off"><button type="submit">Save</button></form><p class="muted" id="mask-state"></p>`,
  },
  {
    slug: 'digits-only', title: 'Digits only', task: 'Enter the verification code 492817 and press Verify.', check: 'auto', needs: ['type', 'click'], level: 1,
    note: 'Keydown handlers block every non-digit key.',
    body: h`<form id="digits"><label for="vcode">Verification code</label><input id="vcode" inputmode="numeric" maxlength="6" autocomplete="one-time-code"><button type="submit">Verify</button></form>`,
  },
  {
    slug: 'paste-blocked', title: 'No pasting allowed', task: 'Enter jo@example.com in both the Email and the Confirm email fields, then continue.', check: 'auto', needs: ['type', 'click'], level: 1,
    body: h`<form id="nopaste" novalidate>${field('np-email', 'Email', 'type="email"')}${field('np-confirm', 'Confirm email', 'type="email" autocomplete="off"')}
      <p class="hint">For your security, pasting into Confirm email is disabled.</p><button type="submit">Continue</button></form><p id="np-state" class="muted"></p>`,
  },
  {
    slug: 'controlled', title: 'A controlled input', task: 'Set the city to Banff and press Save.', check: 'auto', needs: ['type', 'click'], level: 2,
    note: 'Like a React controlled input: the value lives in JS state and is re-rendered every 200 ms, so setting element.value directly is undone.',
    body: h`<form id="controlled"><label for="city">City</label><input id="city" autocomplete="off"><button type="submit">Save</button></form><p class="muted" id="ctl-state">Saved city: (none)</p>`,
  },
  {
    slug: 'autocomplete', title: 'Pick from suggestions', task: 'Choose "Whitehorse, Yukon" from the city suggestions and press Confirm.', check: 'auto', needs: ['type', 'wait', 'click'], level: 2,
    note: 'Free text is not accepted; a suggestion must be chosen.',
    body: h`<form id="ac"><label for="ac-input">City</label>
      <div class="ac-wrap"><input id="ac-input" role="combobox" aria-expanded="false" aria-controls="ac-list" aria-autocomplete="list" autocomplete="off">
      <ul id="ac-list" role="listbox" class="menu" hidden></ul></div><input type="hidden" id="ac-value">
      <button type="submit">Confirm</button></form><p class="muted" id="ac-state"></p>`,
  },
  {
    slug: 'chips', title: 'Tag input', task: 'Add the tags hiking, camping and trail-running, then press Save tags.', check: 'auto', needs: ['type', 'key', 'click'], level: 2,
    body: h`<form id="tags"><label for="tag-input">Tags (press Enter or comma after each)</label>
      <div class="chips-input" id="tag-box"><input id="tag-input" autocomplete="off"></div><button type="submit">Save tags</button></form><p class="muted" id="tags-state"></p>`,
  },
  {
    slug: 'maxlength', title: 'Exactly fifty characters', task: 'Post a status update that is exactly 50 characters long.', check: 'auto', needs: ['type', 'click'], level: 2,
    body: h`<form id="status"><label for="status-text">Status</label><textarea id="status-text" maxlength="60"></textarea>
      <p class="hint"><span id="status-count">0</span>/60 characters</p><button type="submit">Post</button></form><p class="muted" id="status-state"></p>`,
  },
  {
    slug: 'enter-submit', title: 'Search with Enter', task: 'Search the archive for "permits". There is no search button.', check: 'auto', needs: ['type', 'key'], level: 1,
    body: h`<form id="archive" role="search"><label for="arch-q">Search the archive</label><input id="arch-q" type="search" autocomplete="off"></form><div id="arch-results"></div>`,
  },
  {
    slug: 'shift-enter', title: 'Enter sends, Shift+Enter adds a line', task: 'Send one chat message with two lines: "Line one" on the first and "Line two" on the second.', check: 'auto', needs: ['type', 'key'], level: 2,
    body: h`<div class="chat card"><ol class="chat-log" id="se-log"></ol>
      <label for="se-input" class="sr-only">Message</label><textarea id="se-input" rows="2" placeholder="Enter sends · Shift+Enter for a new line"></textarea></div>`,
  },
  {
    slug: 'contenteditable', title: 'An editable note', task: 'Change the note so it reads exactly "Meet at 7".', check: 'auto', needs: ['click', 'type'], level: 1,
    body: h`<p>Sticky note (click to edit):</p><div class="sticky-note" contenteditable="true" id="note" aria-label="Note">Meet at the trailhead at 6:30</div><button type="button" id="note-save">Save note</button>`,
  },
  {
    slug: 'readonly', title: 'Read-only until you press Edit', task: 'Change the display name to "Summit Seeker" and save it.', check: 'auto', needs: ['click', 'type'], level: 1,
    body: h`<form id="ro"><label for="ro-name">Display name</label><input id="ro-name" value="Trail Fan" readonly>
      <button type="button" class="secondary" id="ro-edit">Edit</button><button type="submit" id="ro-save" hidden>Save</button></form><p class="muted" id="ro-state"></p>`,
  },
  {
    slug: 'clears-on-focus', title: 'Prefilled hint text', task: 'Apply the coupon WINTER25.', check: 'auto', needs: ['type', 'click'], level: 1,
    note: 'The field holds "Enter coupon" as its value (not a placeholder), clears it on focus and restores it on blur when empty.',
    body: h`<form id="coupon"><label for="coupon-code">Coupon</label><input id="coupon-code" value="Enter coupon" class="hinted"><button type="submit">Apply</button></form><p class="muted" id="coupon-state"></p>`,
  },
  {
    slug: 'unicode', title: 'Accents, CJK, emoji and Arabic', check: 'auto', needs: ['type', 'click'], level: 2,
    task: 'Fill in: name "Zoë Ångström", city "東京", greeting "Hi 👋" and nickname "مرحبا". Then save.',
    body: h`<form id="uni" class="stack-form">${field('u-name', 'Name')}${field('u-city', 'City')}${field('u-greet', 'Greeting')}${field('u-nick', 'Nickname', 'dir="auto"')}
      <div class="form-actions"><button type="submit">Save</button></div></form><p class="muted" id="uni-state"></p>`,
  },
  {
    slug: 'otp', title: 'Six boxes, one code', task: 'Enter the code shown on this page into the six boxes and press Verify.', check: 'auto', needs: ['type', 'click'], level: 2,
    note: 'Each box holds one digit and focus jumps to the next box as you type.',
    body: h`<p>Your code is <strong class="code">381904</strong>.</p>
      <form id="otp-form"><div class="otp" role="group" aria-label="Verification code">${[1, 2, 3, 4, 5, 6].map((i) => h`<input inputmode="numeric" maxlength="1" aria-label="Digit ${i}">`)}</div>
      <div class="form-actions"><button type="submit">Verify</button></div></form><p class="muted" id="otp-state"></p>`,
  },
  {
    slug: 'multiline', title: 'A three-line address', task: 'Enter this address with each part on its own line: "12 Pine St", "Toronto ON", "M5V 2T6". Then save.', check: 'auto', needs: ['type', 'click'], level: 1,
    body: h`<form id="addr"><label for="addr-text">Mailing address</label><textarea id="addr-text" rows="4"></textarea><button type="submit">Save</button></form>`,
  },
  {
    slug: 'datalist', title: 'Input with a datalist', task: 'Choose the peak "Mount Robson" and press Go.', check: 'auto', needs: ['type', 'click'], level: 1,
    body: h`<form id="peak"><label for="peak-input">Peak</label><input id="peak-input" list="peaks" autocomplete="off">
      <datalist id="peaks">${['Mount Assiniboine', 'Mount Edith Cavell', 'Mount Robson', 'Mount Temple', 'Mount Rundle'].map((p) => h`<option value="${p}">`)}</datalist>
      <button type="submit">Go</button></form>`,
  },
]);
