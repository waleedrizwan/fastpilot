// Lab · Dialogs: native alert/confirm/prompt/beforeunload, custom and nested
// modals, focus traps, sticky modals, <dialog>, the Popover API, undo toasts and drawers.

import { h } from '../lib/html.ts';
import { lab } from './kit.ts';

lab('dialogs', [
  {
    slug: 'alert', title: 'A native alert', task: 'Press Save and acknowledge the message that pops up.', check: 'auto', needs: ['click', 'dialog'], level: 2,
    note: 'window.alert() blocks the page until it is dismissed.',
    body: h`<button type="button" id="alert-btn">Save</button><p class="muted" id="alert-state"></p>`,
  },
  {
    slug: 'confirm-accept', title: 'Confirm to continue', task: 'Delete the draft. Confirm when the browser asks.', check: 'auto', needs: ['click', 'dialog'], level: 2,
    body: h`<p>Draft: “Notes from the ridge”</p><button type="button" class="danger" id="del-draft">Delete draft</button><p class="muted" id="del-state"></p>`,
  },
  {
    slug: 'confirm-dismiss', title: 'Cancel when asked', task: 'Press "Reset everything", but cancel when the browser asks you to confirm.', check: 'auto', needs: ['click', 'dialog'], level: 2,
    body: h`<button type="button" class="danger" id="reset-all">Reset everything</button><p class="muted" id="reset-state">All settings intact.</p>`,
  },
  {
    slug: 'prompt', title: 'Answer a prompt', task: 'Rename the board to "Summit" when the page asks for a name.', check: 'auto', needs: ['click', 'dialog'], level: 2,
    body: h`<h2 id="board-name">Untitled board</h2><button type="button" id="rename">Rename board</button>`,
  },
  {
    slug: 'beforeunload', title: 'Leave with unsaved changes', task: 'Type anything in the notes, then leave this page for the Lab index without saving. Confirm leaving when the browser asks.', check: 'auto', needs: ['type', 'click', 'dialog'], level: 2,
    body: h`<label for="bu-notes">Notes</label><textarea id="bu-notes"></textarea><p class="muted">Changes are not saved automatically.</p><p><a href="/lab">Go to the Lab index</a></p>`,
  },
  {
    slug: 'custom-modal', title: 'Edit in a modal', task: 'Open "Edit profile", change the name to Kai and save.', check: 'auto', needs: ['click', 'type'], level: 1,
    body: h`<p>Name: <strong id="cm-name">Rowan</strong></p><button type="button" data-open-modal="cm">Edit profile</button>
      <div class="modal-backdrop" id="cm" hidden><div class="modal" role="dialog" aria-modal="true" aria-labelledby="cm-h"><h2 id="cm-h">Edit profile</h2>
        <form id="cm-form"><label for="cm-input">Name</label><input id="cm-input" value="Rowan"><div class="actions"><button type="button" class="secondary" data-close-modal>Cancel</button><button type="submit">Save</button></div></form></div></div>`,
  },
  {
    slug: 'nested-modals', title: 'A modal on a modal', task: 'In Share settings, open Advanced, turn on "Allow comments", close Advanced, then press Save in Share settings.', check: 'auto', needs: ['click'], level: 2,
    body: h`<button type="button" data-open-modal="share">Share settings</button>
      <div class="modal-backdrop" id="share" hidden><div class="modal" role="dialog" aria-modal="true" aria-labelledby="share-h"><h2 id="share-h">Share settings</h2>
        <label class="inline"><input type="checkbox" checked> Anyone with the link can view</label><p><button type="button" class="secondary small" data-open-modal="adv">Advanced…</button></p>
        <p class="muted small" id="adv-summary">Comments: off</p><div class="actions"><button type="button" class="secondary" data-close-modal>Cancel</button><button type="button" id="share-save">Save</button></div></div></div>
      <div class="modal-backdrop" id="adv" hidden><div class="modal" role="dialog" aria-modal="true" aria-labelledby="adv-h"><h2 id="adv-h">Advanced</h2>
        <label class="inline"><input type="checkbox" id="allow-comments"> Allow comments</label><label class="inline"><input type="checkbox"> Allow downloads</label>
        <div class="actions"><button type="button" data-close-modal>Close</button></div></div></div>`,
  },
  {
    slug: 'focus-trap', title: 'A focus-trapped dialog', task: 'Send feedback rating the trail 5 with the comment "Great views".', check: 'auto', needs: ['click', 'type', 'select'], level: 1,
    body: h`<button type="button" data-open-modal="fb">Give feedback</button>
      <div class="modal-backdrop" id="fb" hidden data-trap><div class="modal" role="dialog" aria-modal="true" aria-labelledby="fb-h"><h2 id="fb-h">Feedback</h2>
        <form id="fb-form"><label for="fb-rating">Rating</label><select id="fb-rating"><option value="">Choose…</option>${[1, 2, 3, 4, 5].map((n) => h`<option>${n}</option>`)}</select>
        <label for="fb-text">Comment</label><textarea id="fb-text"></textarea><div class="actions"><button type="button" class="secondary" data-close-modal>Cancel</button><button type="submit">Send</button></div></form></div></div>`,
  },
  {
    slug: 'sticky-modal', title: 'A modal you must acknowledge', task: 'Get past the safety notice.', check: 'auto', needs: ['click'], level: 1,
    note: 'Escape and backdrop clicks are ignored; the Continue button stays disabled until the checkbox is ticked.',
    body: h`<p>Trail conditions for this week.</p><div class="modal-backdrop" id="safety" data-static><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="safety-h">
      <h2 id="safety-h">Safety notice</h2><p>Bears are active near Larch Lake. Carry bear spray and travel in groups.</p>
      <label class="inline"><input type="checkbox" id="understand"> I understand</label><div class="actions"><button type="button" id="safety-go" disabled>Continue</button></div></div></div>`,
  },
  {
    slug: 'dialog-element', title: 'A <dialog> element', task: 'Press "Discard draft?" and choose Keep in the dialog.', check: 'auto', needs: ['click'], level: 1,
    body: h`<button type="button" id="dlg-open">Discard draft?</button><dialog id="dlg"><form method="dialog"><p>Discard your draft? This cannot be undone.</p>
      <menu class="row"><button value="discard" class="danger">Discard</button><button value="keep">Keep</button></menu></form></dialog><p class="muted" id="dlg-state"></p>`,
  },
  {
    slug: 'popover', title: 'The Popover API', task: 'Open the info popover and press "Got it".', check: 'auto', needs: ['click'], level: 1,
    body: h`<button type="button" popovertarget="pop">What is this?</button><div id="pop" popover class="pop"><p>Waypoints mark water, camps and junctions.</p><button type="button" popovertarget="pop" popovertargetaction="hide" data-pass="dismissed the popover">Got it</button></div>`,
  },
  {
    slug: 'undo-toast', title: 'Undo from a toast', task: 'Delete the photo "Larch Lake", then undo the deletion from the notification.', check: 'auto', needs: ['click', 'wait'], level: 2,
    note: 'The Undo toast stays up for 5 seconds.',
    body: h`<ul class="photos" id="photos">${['Larch Lake', 'Sentinel Pass', 'Paradise Valley'].map((p) => h`<li data-photo="${p}">🖼 ${p} <button type="button" class="small ghost" data-delete>Delete</button></li>`)}</ul>`,
  },
  {
    slug: 'drawer', title: 'A filter drawer', task: 'Open the filters drawer, tick "Dogs allowed" and apply the filters.', check: 'auto', needs: ['click'], level: 1,
    body: h`<button type="button" class="secondary" id="drawer-open" aria-expanded="false" aria-controls="drawer">Filters</button><p class="muted" id="drawer-state">Showing all 42 campsites.</p>
      <aside class="drawer" id="drawer" aria-label="Filters" hidden><h2>Filters</h2>${['Dogs allowed', 'Fire pits', 'Showers', 'Accessible'].map((f) => h`<label class="inline"><input type="checkbox" value="${f}"> ${f}</label><br>`)}
        <div class="form-actions"><button type="button" class="secondary" id="drawer-close">Close</button><button type="button" id="drawer-apply">Apply</button></div></aside>`,
  },
]);
