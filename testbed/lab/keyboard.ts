// Lab · Keyboard: shortcuts, key sequences, focus-only controls, grids,
// keyboard-only activation and typing accuracy.

import { h } from '../lib/html.ts';
import { lab } from './kit.ts';

lab('keyboard', [
  {
    slug: 'command-palette', title: 'Command palette', task: 'Open the command palette with Cmd+K (Mac) or Ctrl+K and run "Archive all".', check: 'auto', needs: ['key', 'type'], level: 2,
    body: h`<p>Twelve notifications are waiting. Power users use the palette.</p>
      <div class="modal-backdrop palette-backdrop" id="kp" hidden><div class="modal palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input placeholder="Type a command" id="kp-input" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="kp-list"><ul role="listbox" id="kp-list"></ul></div></div>`,
  },
  {
    slug: 'help-shortcut', title: 'The ? shortcut', task: 'Press ? to open the keyboard shortcuts panel, then submit the secret shortcut code shown in it in the Answer box.', check: 'answer', needs: ['key', 'read', 'type'], level: 1,
    answer: 'K9-HELP',
    body: h`<p>This page has keyboard shortcuts. Press <kbd>?</kbd> to see them.</p><div class="modal-backdrop" id="help-modal" hidden><div class="modal" role="dialog" aria-modal="true" aria-labelledby="help-h">
      <h2 id="help-h">Keyboard shortcuts</h2><table><tbody><tr><td><kbd>?</kbd></td><td>This panel</td></tr><tr><td><kbd>g</kbd> <kbd>i</kbd></td><td>Go to inbox</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Close</td></tr></tbody></table><p>Secret shortcut code: <strong>K9-HELP</strong></p><div class="actions"><button type="button" data-close-modal>Close</button></div></div></div>`,
  },
  {
    slug: 'sequence', title: 'A two-key sequence', task: 'Open the Inbox panel with the shortcut g then i (press g, then i within a second).', check: 'auto', needs: ['key'], level: 2,
    body: h`<p>Panels: <span class="pill" id="seq-panel">Home</span></p><p class="muted">Shortcuts: <kbd>g</kbd> <kbd>h</kbd> Home, <kbd>g</kbd> <kbd>i</kbd> Inbox, <kbd>g</kbd> <kbd>s</kbd> Settings.</p>`,
  },
  {
    slug: 'tab-reveal', title: 'Only visible on focus', task: 'Use Tab to reach the hidden "Skip to results" link and activate it.', check: 'auto', needs: ['key'], level: 2,
    note: 'The link sits off-screen until it has keyboard focus, so it is not in the element snapshot.',
    body: h`<a href="#results" class="skip-demo" id="skip">Skip to results</a>
      <p>Long filter panel:</p><div class="row">${Array.from({ length: 6 }, (_, i) => h`<label class="inline"><input type="checkbox"> Filter ${i + 1}</label>`)}</div>
      <h2 id="results" tabindex="-1">Results</h2><p>14 trails found.</p>`,
  },
  {
    slug: 'grid', title: 'A keyboard grid', task: 'In the spreadsheet, put 42 in cell C3 (column C, row 3) and press Enter.', check: 'auto', needs: ['click', 'type', 'key'], level: 2,
    body: h`<table class="sheet" role="grid" aria-label="Spreadsheet"><thead><tr><th></th>${['A', 'B', 'C', 'D'].map((c) => h`<th scope="col">${c}</th>`)}</tr></thead>
      <tbody>${[1, 2, 3, 4, 5].map((r) => h`<tr><th scope="row">${r}</th>${['A', 'B', 'C', 'D'].map((c) => h`<td role="gridcell" tabindex="${r === 1 && c === 'A' ? 0 : -1}" data-cell="${c}${r}"></td>`)}</tr>`)}</tbody></table>
      <p class="muted">Arrow keys move, Enter or typing edits, Enter saves, Escape cancels.</p>`,
  },
  {
    slug: 'escape-only', title: 'Close with Escape', task: 'Close the announcement dialog.', check: 'auto', needs: ['key'], level: 1,
    note: 'The dialog has no close button and ignores clicks outside it.',
    body: h`<p>Behind the dialog: your dashboard.</p><div class="modal-backdrop" id="esc-modal" data-no-backdrop><div class="modal" role="dialog" aria-modal="true" aria-labelledby="esc-h" tabindex="-1">
      <h2 id="esc-h">What's new</h2><p>We redesigned the trip planner. Press Esc to dismiss.</p></div></div>`,
  },
  {
    slug: 'typing-test', title: 'Type it exactly', task: 'Type the phrase exactly as shown into the box, then press Check.', check: 'auto', needs: ['type', 'click'], level: 1,
    body: h`<blockquote class="phrase">The quick brown fox jumps over the lazy dog, twice!</blockquote><textarea id="tt" spellcheck="false" aria-label="Your typing"></textarea>
      <div class="form-actions"><button type="button" id="tt-check">Check</button></div><p class="muted" id="tt-state"></p>`,
  },
  {
    slug: 'listbox-keys', title: 'Jump to the end', task: 'Select the last option in the list.', check: 'auto', needs: ['click', 'key', 'scroll'], level: 1,
    body: h`<ul class="listbox-inline tall" role="listbox" tabindex="0" aria-label="Waypoints" id="wp">${Array.from({ length: 100 }, (_, i) => h`<li role="option" id="wp-${i}" aria-selected="${i === 0}">Waypoint ${i + 1}</li>`)}</ul>`,
  },
  {
    slug: 'keyboard-only', title: 'Ignores the mouse', task: 'Activate the "Confirm" control. It ignores mouse clicks.', check: 'auto', needs: ['click', 'key'], level: 2,
    body: h`<div role="button" tabindex="0" class="fake-button" id="ko">Confirm</div><p class="muted" id="ko-state">Focus it and press Enter or Space.</p>`,
  },
  {
    slug: 'save-shortcut', title: 'Save with a shortcut', task: 'Write "draft one" in the editor and save it with Cmd+S (Mac) or Ctrl+S.', check: 'auto', needs: ['type', 'key'], level: 1,
    body: h`<textarea id="ss" aria-label="Editor" placeholder="Write here"></textarea><p class="muted" id="ss-state">Not saved.</p>`,
  },
]);
