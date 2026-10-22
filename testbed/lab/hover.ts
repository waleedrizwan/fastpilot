// Lab · Hover: tooltips, flyout menus with close delays, hover-only actions,
// hover cards, CSS :hover reveals and hover intent.

import { h } from '../lib/html.ts';
import { lab } from './kit.ts';

lab('hover', [
  {
    slug: 'tooltip', title: 'Answer in a tooltip', task: 'Find the maximum group size (it is in the info tooltip next to "Group size") and submit it in the Answer box.', check: 'answer', needs: ['hover', 'read', 'type'], level: 1,
    answer: 12, note: 'The tooltip element is created on mouseenter and removed on mouseleave.',
    body: h`<p>Group size <button type="button" class="icon-btn info" aria-label="More info about group size" id="tip-btn">ⓘ</button></p>`,
  },
  {
    slug: 'flyout', title: 'A three-level flyout', task: 'Using the hover menu, open Products → Outdoor → Tents → Ultralight.', check: 'auto', needs: ['hover', 'click'], level: 2,
    body: h`<nav class="flyout" aria-label="Products menu"><ul><li class="fly"><button type="button">Products ▸</button>
      <ul><li class="fly"><button type="button">Indoor ▸</button><ul><li><a href="#" data-fail="opened Indoor → Lamps">Lamps</a></li></ul></li>
        <li class="fly"><button type="button">Outdoor ▸</button><ul>
          <li class="fly"><button type="button">Packs ▸</button><ul><li><a href="#" data-fail="opened Packs → Daypacks">Daypacks</a></li></ul></li>
          <li class="fly"><button type="button">Tents ▸</button><ul><li><a href="#" data-fail="opened Tents → Family">Family</a></li><li><a href="#" data-pass="opened Products → Outdoor → Tents → Ultralight">Ultralight</a></li></ul></li>
        </ul></li></ul></li></ul></nav>`,
  },
  {
    slug: 'row-actions', title: 'Actions on hover', task: 'Pin the report "Q3 trail usage" using its row action.', check: 'auto', needs: ['hover', 'click'], level: 2,
    note: 'Row actions have opacity 0 until the row is hovered.',
    body: h`<table class="hover-rows"><tbody>${['Q1 trail usage', 'Q2 trail usage', 'Q3 trail usage', 'Q4 forecast'].map((r) => h`<tr><td>${r}</td><td class="row-actions">
      <button type="button" class="small ghost" ${r.startsWith('Q3') ? h`data-pass="pinned Q3"` : h`data-fail="pinned ${r}"`}>📌 Pin</button><button type="button" class="small ghost" data-fail="deleted ${r}">Delete</button></td></tr>`)}</tbody></table>`,
  },
  {
    slug: 'hover-card', title: 'A hover card', task: 'Hover over @rowan and press Message in the profile card.', check: 'auto', needs: ['hover', 'click'], level: 2,
    body: h`<p>Trip photos shared by <a href="#" class="mention" id="rowan">@rowan</a> and <a href="#" class="mention">@sage</a>.</p>
      <div class="hovercard" id="hc" hidden><strong>Rowan Lee</strong><p class="muted small">Trail crew lead · Banff</p><button type="button" class="small" data-pass="messaged Rowan">Message</button> <button type="button" class="small secondary" data-fail="followed instead">Follow</button></div>`,
  },
  {
    slug: 'css-reveal', title: 'Revealed by :hover', task: 'Find the price of the "Moraine Lake" print and submit it in the Answer box.', check: 'answer', needs: ['hover', 'read', 'type'], level: 2,
    answer: 64, note: 'Captions are display:none until the photo is hovered (pure CSS).',
    body: h`<div class="prints">${[['Moraine Lake', 64], ['Peyto Lake', 58], ['Lake Agnes', 49]].map(([n, p]) => h`<figure class="print" tabindex="0"><div class="print-img">🏔</div><figcaption>${n}: $${p}</figcaption><span class="print-name">${n}</span></figure>`)}</div>`,
  },
  {
    slug: 'hover-intent', title: 'Hover intent', task: 'Open the Help menu and choose Contact.', check: 'auto', needs: ['hover', 'click'], level: 2,
    note: 'The menu opens only after the pointer rests on "Help" for 600 ms.',
    body: h`<nav class="intent-bar"><span class="intent" id="intent">Help ▾<ul class="menu" hidden><li><a href="#" data-fail="chose FAQ">FAQ</a></li><li><a href="#" data-pass="chose Contact">Contact</a></li></ul></span></nav>`,
  },
]);
