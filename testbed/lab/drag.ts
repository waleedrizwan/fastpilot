// Lab · Drag & drop: HTML5 and pointer-based dragging, handles, splitters,
// canvases and a pannable map. FastPilot has no drag tool yet.

import { h } from '../lib/html.ts';
import { lab } from './kit.ts';

const ITEMS = ['Water filter', 'Stove', 'Tent', 'Sleeping bag', 'Headlamp'];

lab('drag', [
  {
    slug: 'html5-reorder', title: 'Reorder with HTML5 drag', task: 'Drag "Tent" to the top of the packing list.', check: 'auto', needs: ['drag'], level: 2,
    body: h`<ol class="drag-list" id="h5">${ITEMS.map((t) => h`<li draggable="true">${t}</li>`)}</ol>`,
  },
  {
    slug: 'pointer-sortable', title: 'Reorder with pointer events', task: 'Move "Stove" so it sits directly below "Sleeping bag".', check: 'auto', needs: ['drag'], level: 2,
    note: 'Built on pointerdown/pointermove/pointerup, like many sortable libraries.',
    body: h`<ol class="drag-list" id="ps">${ITEMS.map((t) => h`<li><span class="grip" aria-hidden="true">⠿</span> ${t}</li>`)}</ol>`,
  },
  {
    slug: 'drop-target', title: 'Into the box', task: 'Drag the ticket into the scanner.', check: 'auto', needs: ['drag'], level: 1,
    body: h`<div class="row drop-row"><div class="ticket" draggable="true" id="ticket">🎟 Ticket #4417</div><div class="scanner" id="scanner">Scanner</div></div><p class="muted" id="scan-state"></p>`,
  },
  {
    slug: 'handle-only', title: 'A drag-only slider', task: 'Drag the handle to 75% and release.', check: 'auto', needs: ['drag'], level: 2,
    note: 'No keyboard support: the handle only moves by dragging.',
    body: h`<div class="drag-track" id="dt"><div class="drag-fill"></div><div class="drag-handle" aria-label="Handle"></div></div><p class="muted" id="dt-out">0%</p>`,
  },
  {
    slug: 'splitter', title: 'Resize the panes', task: 'Drag the divider so the left pane takes at least 70% of the width.', check: 'auto', needs: ['drag'], level: 2,
    body: h`<div class="split-demo" id="sd"><div class="pane">Left pane</div><div class="gutter" aria-label="Divider"></div><div class="pane">Right pane</div></div><p class="muted" id="sd-out">Left: 50%</p>`,
  },
  {
    slug: 'canvas-draw', title: 'Draw a line', task: 'On the canvas, draw a line from the green box to the blue box without lifting.', check: 'auto', needs: ['drag', 'canvas'], level: 3,
    body: h`<canvas id="draw" width="520" height="240" class="framed"></canvas><p class="muted" id="draw-state"></p><button type="button" class="secondary small" id="draw-clear">Clear</button>`,
  },
  {
    slug: 'map-pan', title: 'Pan the map', task: 'Pan the map to find the "Hidden Lake" marker and click it.', check: 'auto', needs: ['drag', 'click'], level: 3,
    note: 'The marker is outside the visible map area until you drag the map.',
    body: h`<div class="map" id="map"><div class="map-inner" id="map-inner">
      ${[['Trailhead', 120, 140], ['Larch Lake', 380, 210], ['Viewpoint', 260, 60], ['Hidden Lake', 1120, 520]].map(([n, x, y]) => h`<button type="button" class="marker" style="left:${x}px;top:${y}px" ${n === 'Hidden Lake' ? h`data-pass="found Hidden Lake"` : h`data-fail="clicked ${n}"`}>📍 ${n}</button>`)}
      </div></div>`,
  },
]);
