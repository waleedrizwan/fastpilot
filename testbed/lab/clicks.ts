// Lab · Clicks: buttons and links, and every odd way a page can listen for a click.

import { h } from '../lib/html.ts';
import { report } from '../lib/state.ts';
import { lab } from './kit.ts';

lab('clicks', [
  {
    slug: 'basic', title: 'A plain button', task: 'Click the "Launch" button.', check: 'auto', needs: ['click'], level: 1,
    body: h`<p>Mission control is ready when you are.</p>
      <div class="row"><button type="button" data-fail="clicked Abort instead">Abort</button><button type="button" data-pass="launched">Launch</button><button type="button" class="secondary" data-fail="clicked Hold">Hold</button></div>`,
  },
  {
    slug: 'link', title: 'Follow a link', task: 'Follow the "Continue to step two" link.', check: 'auto', needs: ['click'], level: 1,
    body: (req) => {
      const step = req.query.get('step');
      if (step) report(req, 'lab/clicks/link', step === '2' ? 'pass' : 'fail', `followed the link to step ${step}`);
      return step === '2'
        ? h`<p>You reached step two.</p><p><a href="/lab/clicks/link">Start over</a></p>`
        : h`<p>Read the notes, then continue.</p><ul><li><a href="/lab/clicks/link?step=0">Back to step zero</a></li><li><a href="/lab/clicks/link?step=2">Continue to step two</a></li><li><a href="/lab/clicks/link?step=3">Skip to step three</a></li></ul>`;
    },
  },
  {
    slug: 'icon-only', title: 'Icon-only buttons', task: 'Click the Favorite button. It is an icon with no visible text.', check: 'auto', needs: ['click'], level: 1,
    body: h`<p>Photo: <em>Sunrise over Moraine Lake</em></p>
      <div class="row icon-toolbar">
        <button type="button" class="icon-btn" aria-label="Delete" data-fail="clicked Delete">🗑</button>
        <button type="button" class="icon-btn" aria-label="Edit" data-fail="clicked Edit">✎</button>
        <button type="button" class="icon-btn" title="Download" data-fail="clicked Download">⤓</button>
        <button type="button" class="icon-btn" aria-label="Favorite" data-pass="favorited">★</button>
        <button type="button" class="icon-btn" aria-label="Share" data-fail="clicked Share">⇪</button>
      </div>`,
  },
  {
    slug: 'listener-div', title: 'A div that listens', task: 'Click "Open vault".', check: 'auto', needs: ['click', 'hidden'], level: 2,
    note: 'The control is a <div> with only an addEventListener click handler: no role, tabindex or onclick attribute, so element snapshots skip it.',
    body: h`<p>The vault opens with the button below.</p><div class="fake-button" id="vault">Open vault</div><p class="muted" id="vault-state">Vault is closed.</p>`,
  },
  {
    slug: 'pointerdown', title: 'Pointerdown only', task: 'Click the "Start engine" control.', check: 'auto', needs: ['click'], level: 2,
    note: 'Listens only for pointerdown, like many component libraries; element.click() does not fire it.',
    body: h`<div role="button" tabindex="0" class="fake-button" id="engine">Start engine</div><p class="muted" id="engine-state">Engine off.</p>`,
  },
  {
    slug: 'mousedown', title: 'Mousedown only', task: 'Click "Open the gate".', check: 'auto', needs: ['click'], level: 2,
    body: h`<button type="button" id="gate">Open the gate</button><p class="muted" id="gate-state">The gate is shut.</p>`,
  },
  {
    slug: 'trusted', title: 'Trusted clicks only', task: 'Click "Verify I am here".', check: 'auto', needs: ['click'], level: 1,
    note: 'Rejects synthetic events (event.isTrusted is false), such as element.click() from page scripts.',
    body: h`<button type="button" id="trusted">Verify I am here</button><p class="muted" id="trusted-state"></p>`,
  },
  {
    slug: 'covered', title: 'Covered by a popup', task: 'Click the "Download report" button.', check: 'auto', needs: ['click'], level: 2,
    note: 'A newsletter popup sits on top of the button until it is closed.',
    body: h`<p>Your quarterly report is ready.</p>
      <div class="cover-wrap">
        <button type="button" data-pass="downloaded after clearing the popup">Download report</button>
        <div class="cover-pop" id="cover-pop"><strong>Join our newsletter!</strong> <span>Tips every week.</span>
          <button type="button" class="small secondary" data-close-cover aria-label="Close newsletter popup">×</button></div>
      </div>`,
  },
  {
    slug: 'passthrough', title: 'Click through a decoration', task: 'Click "Submit vote".', check: 'auto', needs: ['click'], level: 1,
    note: 'A transparent decorative layer with pointer-events: none lies over the button.',
    body: h`<div class="cover-wrap"><button type="button" data-pass="voted">Submit vote</button><div class="sparkles" aria-hidden="true">✨ ✨ ✨</div></div>`,
  },
  {
    slug: 'moving', title: 'A moving target', task: 'Click the "Catch me" button.', check: 'auto', needs: ['click'], level: 2,
    note: 'The button slides in over 1.5 seconds with a CSS transition, which does not change the DOM.',
    body: h`<div class="runway"><button type="button" class="slider-btn" id="catch" data-pass="caught">Catch me</button></div><button type="button" class="secondary small" id="replay">Replay</button>`,
  },
  {
    slug: 'delayed', title: 'Appears later', task: 'Accept the offer.', check: 'auto', needs: ['wait', 'click'], level: 1,
    body: h`<p id="offer-state"><span class="spinner" aria-hidden="true"></span> Finding your best offer…</p><div id="offer"></div>`,
  },
  {
    slug: 'enabled-when-valid', title: 'Disabled until valid', task: 'Create an account with the name Jo and the email jo@example.com.', check: 'auto', needs: ['type', 'click'], level: 1,
    body: h`<form id="valid-form" novalidate><label for="vf-name">Name</label><input id="vf-name"><label for="vf-email">Email</label><input id="vf-email" type="email">
      <div class="form-actions"><button type="submit" id="vf-create" disabled>Create</button></div></form>`,
  },
  {
    slug: 'tiny', title: 'A tiny target', task: 'Click the tiny dot next to "Settings".', check: 'auto', needs: ['click'], level: 2,
    body: h`<ul class="tiny-list">${['Profile', 'Settings', 'Billing'].map((t) => h`<li>${t} <button type="button" class="dot-btn" aria-label="${t} dot" ${t === 'Settings' ? h`data-pass="hit the 6px dot"` : h`data-fail="hit the ${t} dot"`}></button></li>`)}</ul>`,
  },
  {
    slug: 'nested-scroll', title: 'Nested scroll boxes', task: 'Click "Inner treasure" inside the nested scroll boxes.', check: 'auto', needs: ['scroll', 'click'], level: 2,
    body: h`<div class="scroll-outer">${Array.from({ length: 8 }, (_, i) => h`<p>Outer paragraph ${i + 1}</p>`)}
      <div class="scroll-inner">${Array.from({ length: 12 }, (_, i) => h`<p>Inner paragraph ${i + 1}</p>`)}<button type="button" data-pass="found the inner treasure">Inner treasure</button></div>
      ${Array.from({ length: 6 }, (_, i) => h`<p>More outer text ${i + 1}</p>`)}</div>`,
  },
  {
    slug: 'horizontal', title: 'Off to the right', task: 'Click the "Open" button on Card 27.', check: 'auto', needs: ['scroll', 'click', 'hidden'], level: 2,
    note: 'Cards far right in a horizontal scroller are outside the viewport, and there is no horizontal scroll tool.',
    body: h`<div class="h-scroller">${Array.from({ length: 30 }, (_, i) => h`<div class="h-card"><strong>Card ${i + 1}</strong><button type="button" class="small" ${i === 26 ? h`data-pass="opened card 27"` : h`data-fail="opened card ${i + 1}"`}>Open</button></div>`)}</div>`,
  },
  {
    slug: 'corner-bubble', title: 'A help bubble', task: 'Open the help bubble in the corner of the page and choose "Talk to sales".', check: 'auto', needs: ['click'], level: 1,
    body: h`<p>Questions? The bubble in the corner can help.</p>
      <div class="bubble-panel" id="bubble-panel" hidden><strong>How can we help?</strong>
        <button type="button" class="secondary small" data-fail="chose Support">Support</button><button type="button" class="secondary small" data-pass="talked to sales">Talk to sales</button></div>
      <button type="button" class="help-bubble" aria-label="Help" aria-expanded="false" id="bubble">?</button>`,
  },
  {
    slug: 'dblclick', title: 'Double-click to open', task: 'Open the "Trip photos" folder. Folders open on double-click.', check: 'auto', needs: ['dblclick'], level: 2,
    body: h`<div class="folders">${['Receipts', 'Trip photos', 'Maps'].map((f) => h`<div class="folder" tabindex="0" data-folder="${f}">📁 ${f}</div>`)}</div><p class="muted" id="folder-state">Nothing open.</p>`,
  },
  {
    slug: 'context-menu', title: 'Right-click menu', task: 'Rename the file "report.pdf" to "summary.pdf" using its right-click menu.', check: 'auto', needs: ['rightclick', 'type', 'key'], level: 2,
    body: h`<ul class="files">${['notes.txt', 'report.pdf', 'route.gpx'].map((f) => h`<li class="file" data-file="${f}">📄 <span>${f}</span></li>`)}</ul>
      <ul class="menu context-menu" role="menu" id="file-menu" hidden><li role="none"><button type="button" role="menuitem" data-act="rename">Rename</button></li><li role="none"><button type="button" role="menuitem" data-act="delete">Delete</button></li></ul>`,
  },
  {
    slug: 'long-press', title: 'Press and hold', task: 'Press and hold the record button for at least one second.', check: 'auto', needs: ['longpress'], level: 2,
    body: h`<button type="button" class="record" id="record" aria-label="Record (hold)">● Hold to record</button><div class="hold-bar"><span id="hold-bar"></span></div><p class="muted" id="record-state"></p>`,
  },
  {
    slug: 'modifier-click', title: 'Cmd/Ctrl-click to multi-select', task: 'Select Apple, Cherry and Elderberry together. Hold Cmd (Mac) or Ctrl while clicking to add to the selection.', check: 'auto', needs: ['modclick'], level: 2,
    body: h`<ul class="selectable" role="listbox" aria-multiselectable="true" aria-label="Fruit">${['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig'].map((f) => h`<li role="option" aria-selected="false" tabindex="-1">${f}</li>`)}</ul>
      <p class="muted" id="sel-state">Nothing selected.</p>`,
  },
  {
    slug: 'middle-click', title: 'Middle-click', task: 'Middle-click the "Open in background" link.', check: 'auto', needs: ['modclick'], level: 2,
    body: h`<p><a href="/lab/clicks/middle-click?opened=1" id="bg-link">Open in background</a></p><p class="muted">A normal click opens it here instead.</p>`,
  },
  {
    slug: 'canvas-spot', title: 'Hit the bullseye', task: 'Click the center of the bullseye drawn on the canvas.', check: 'auto', needs: ['canvas', 'screenshot'], level: 2,
    body: h`<canvas id="target" width="480" height="300" class="framed"></canvas><p class="muted" id="target-state"></p>`,
  },
  {
    slug: 'duplicate-delete', title: 'Which Delete?', task: 'Delete only the row "Beta".', check: 'auto', needs: ['click'], level: 1,
    body: h`<table class="dup-table"><thead><tr><th>Name</th><th>Owner</th><th></th></tr></thead><tbody>
      ${[['Alpha', 'Priya'], ['Beta', 'Marco'], ['Gamma', 'Lena'], ['Delta', 'Sam']].map(([n, o]) => h`<tr data-row="${n}"><td>${n}</td><td>${o}</td><td><button type="button" class="small danger" data-del>Delete</button></td></tr>`)}
      </tbody></table>`,
  },
]);

