// Lab · Scrolling: long pages, infinite and virtual lists, inner scrollers,
// snap carousels, scroll-gated buttons, lazy images, sticky headers, scroll-jacking.

import { h } from '../lib/html.ts';
import { lab } from './kit.ts';

const CANOES = ['Yellow kayak on a dock', 'Two hikers at a cairn', 'Tent under the stars', 'Red canoe at sunrise', 'Fox on a log', 'Fog over the valley'];

lab('scroll', [
  {
    slug: 'long-page', title: 'Way down at the bottom', task: 'Press the "Finish" button at the bottom of this page.', check: 'auto', needs: ['scroll', 'click'], level: 1,
    body: h`${Array.from({ length: 60 }, (_, i) => h`<p>Section ${i + 1}. ${'Keep scrolling, the finish line is further down. '.repeat(4)}</p>`)}
      <button type="button" class="secondary" data-fail="pressed Not yet">Not yet</button> <button type="button" data-pass="reached the bottom">Finish</button>`,
  },
  {
    slug: 'infinite', title: 'Infinite list', task: 'Find item #137 and press its Open button.', check: 'auto', needs: ['scroll', 'wait', 'click'], level: 2,
    note: 'Twenty items load each time you near the end of the list.',
    body: h`<ol class="inf-list" id="inf"></ol><p class="sentinel" id="inf-sentinel"><span class="spinner" aria-hidden="true"></span> Loading…</p>`,
  },
  {
    slug: 'inner-scroller', title: 'A scrolling panel', task: 'Press "Select" on Row 180 in the scrolling panel.', check: 'auto', needs: ['scroll', 'click'], level: 1,
    body: h`<div class="panel-scroll">${Array.from({ length: 200 }, (_, i) => h`<div class="prow">Row ${i + 1} <button type="button" class="small secondary" ${i === 179 ? h`data-pass="selected row 180"` : h`data-fail="selected row ${i + 1}"`}>Select</button></div>`)}</div>`,
  },
  {
    slug: 'carousel', title: 'Snap carousel', task: 'Go to slide 6 of the carousel and submit its caption in the Answer box.', check: 'answer', needs: ['click', 'read', 'type'], level: 1,
    answer: 'Fog over the valley',
    body: h`<div class="snap" id="snap">${CANOES.map((c, i) => h`<figure class="snap-slide" aria-label="Slide ${i + 1} of ${CANOES.length}"><div class="snap-art">${i + 1}</div><figcaption>${c}</figcaption></figure>`)}</div>
      <div class="row"><button type="button" class="secondary" id="snap-prev" aria-label="Previous slide">‹ Prev</button><span id="snap-pos">1 / 6</span><button type="button" class="secondary" id="snap-next" aria-label="Next slide">Next ›</button></div>`,
  },
  {
    slug: 'virtual', title: 'A virtualized list', task: 'Find row 7342 in the list and click it.', check: 'auto', needs: ['scroll', 'click'], level: 3,
    note: 'Only the ~20 visible rows exist in the DOM at any time.',
    body: h`<div class="virt" id="virt" tabindex="0" aria-label="Ten thousand rows"><div class="virt-spacer" id="virt-spacer"></div></div><p class="muted" id="virt-state"></p>`,
  },
  {
    slug: 'scroll-to-accept', title: 'Read to the end', task: 'Accept the license agreement.', check: 'auto', needs: ['scroll', 'click'], level: 2,
    note: 'Accept stays disabled until the agreement box is scrolled to the end.',
    body: h`<div class="terms-box tall" id="lic">${Array.from({ length: 30 }, (_, i) => h`<p>${i + 1}. The licensee agrees to clause ${i + 1}, which is long and important.</p>`)}<p><strong>End of agreement.</strong></p></div>
      <div class="form-actions"><button type="button" class="secondary" data-fail="declined">Decline</button><button type="button" id="lic-accept" disabled data-pass="accepted after reading">Accept</button></div>`,
  },
  {
    slug: 'lazy-images', title: 'Lazy captions', task: 'Scroll through the gallery and submit the caption of the photo showing a canoe.', check: 'answer', needs: ['scroll', 'read', 'type'], level: 2,
    answer: 'Red canoe at sunrise', note: 'Captions are filled in only when a photo scrolls into view.',
    body: h`<div class="lazy-gallery">${CANOES.map((c, i) => h`<figure class="lazy" data-caption="${Buffer.from(c).toString('base64')}"><div class="lazy-art">${i + 1}</div><figcaption>Loading…</figcaption></figure>`)}</div>`,
  },
  {
    slug: 'sticky-header', title: 'Under the sticky header', task: 'Use the contents to jump to Section 7, then press its "Mark as read" button.', check: 'auto', needs: ['click'], level: 2,
    note: 'A 120 px sticky header covers anchors after the jump.',
    body: h`<div class="sticky-demo-head">Sticky header (120 px)</div><nav class="toc card"><strong>Contents</strong><ol>${Array.from({ length: 10 }, (_, i) => h`<li><a href="#s${i + 1}">Section ${i + 1}</a></li>`)}</ol></nav>
      ${Array.from({ length: 10 }, (_, i) => h`<section id="s${i + 1}" class="tall-section"><h2>Section ${i + 1}</h2><button type="button" class="small secondary" ${i === 6 ? h`data-pass="marked section 7"` : h`data-fail="marked section ${i + 1}"`}>Mark as read</button><p>${'Text. '.repeat(80)}</p></section>`)}`,
  },
  {
    slug: 'scroll-jack', title: 'Hijacked scrolling', task: 'Get to section 5 and press Done.', check: 'auto', needs: ['scroll', 'click'], level: 2,
    note: 'Each wheel gesture jumps a whole section with an animation.',
    body: h`<div class="jack" id="jack">${[1, 2, 3, 4, 5].map((n) => h`<section class="jack-sec"><h2>Section ${n}</h2>${n === 5 ? h`<button type="button" data-pass="reached section 5">Done</button>` : h`<p>Scroll to continue.</p>`}</section>`)}</div>`,
  },
  {
    slug: 'checkpoint', title: 'A checkpoint halfway down', task: 'Scroll to the halfway point of this page and press "Checkpoint" while it is showing.', check: 'auto', needs: ['scroll', 'click'], level: 2,
    note: 'The button appears only while the page is scrolled between 40% and 60%.',
    body: h`<div class="scroll-meter" id="meter">0%</div>${Array.from({ length: 50 }, (_, i) => h`<p>Paragraph ${i + 1}. ${'Steady pace. '.repeat(10)}</p>`)}
      <button type="button" class="checkpoint" id="cp" hidden data-pass="checkpoint pressed">Checkpoint</button>`,
  },
]);
