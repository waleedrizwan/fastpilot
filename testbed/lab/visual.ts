// Lab · Visual: tasks that need eyes on pixels: canvas targets, color-only
// status, unlabeled CSS charts, image maps, SVG shapes and a rotary dial.

import { h } from '../lib/html.ts';
import { get, send } from '../lib/http.ts';
import { lab } from './kit.ts';

lab('visual', [
  {
    slug: 'red-circle', title: 'Click the red circle', task: 'Click the red circle on the canvas.', check: 'auto', needs: ['canvas', 'screenshot'], level: 2,
    body: h`<canvas id="circles" width="520" height="280" class="framed"></canvas><p class="muted" id="circles-state"></p>`,
  },
  {
    slug: 'status-colors', title: 'Which one is red?', task: 'Which server is down? Its status light is red. Submit its name in the Answer box.', check: 'answer', needs: ['screenshot', 'type'], level: 2,
    answer: 'kestrel-03', note: 'Status is shown only by color.',
    body: h`<ul class="servers">${[['falcon-01', '#2e7d4f'], ['heron-02', '#2e7d4f'], ['kestrel-03', '#c62828'], ['osprey-04', '#e0a100'], ['plover-05', '#2e7d4f']].map(([n, c]) => h`<li><span class="light" style="background:${c}"></span>${n}</li>`)}</ul>`,
  },
  {
    slug: 'css-chart', title: 'An unlabeled bar chart', task: 'Which weekday had the tallest bar? Submit it in the Answer box.', check: 'answer', needs: ['screenshot', 'type'], level: 2,
    answer: ['Thursday', 'Thu'], note: 'Bar heights live only in inline styles.',
    body: h`<div class="css-chart">${[['Mon', 40], ['Tue', 55], ['Wed', 35], ['Thu', 90], ['Fri', 70], ['Sat', 85], ['Sun', 60]].map(([d, v]) => h`<div class="cbar"><span style="height:${v}%"></span><small>${d}</small></div>`)}</div>`,
  },
  {
    slug: 'image-map', title: 'An image map', task: 'Click the lake on the map.', check: 'auto', needs: ['click', 'hidden'], level: 2,
    note: '<area> regions of an image map are not ordinary links in the element snapshot.',
    body: h`<img src="/lab/visual/map.svg" usemap="#park" width="480" height="300" alt="Park map" class="framed">
      <map name="park"><area shape="circle" coords="330,170,55" href="#lake" alt="Lake" id="area-lake"><area shape="rect" coords="40,40,180,140" href="#forest" alt="Forest" id="area-forest"><area shape="poly" coords="60,280,140,190,220,280" href="#peak" alt="Peak" id="area-peak"></map>`,
  },
  {
    slug: 'svg-shapes', title: 'Click the triangle', task: 'Click the triangle.', check: 'auto', needs: ['click', 'hidden'], level: 2,
    note: 'The shapes are plain SVG elements with click listeners: no links, roles or labels.',
    body: h`<svg width="460" height="180" viewBox="0 0 460 180" class="framed"><circle cx="80" cy="90" r="50" fill="#1f6fd1" data-shape="circle"/>
      <rect x="180" y="40" width="100" height="100" fill="#e0a100" data-shape="square"/><polygon points="380,40 440,140 320,140" fill="#2e7d4f" data-shape="triangle"/></svg>`,
  },
  {
    slug: 'dial', title: 'Turn the dial', task: 'Rotate the dial to point at 270° (the 9 o\'clock position) and release.', check: 'auto', needs: ['drag'], level: 3,
    body: h`<div class="dial" id="dial"><div class="dial-needle" id="needle"></div></div><p class="muted" id="dial-state">0°</p>`,
  },
]);

get('/lab/visual/map.svg', (req) => send(req, 200, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="480" height="300">
  <rect width="480" height="300" fill="#e7efd9"/><rect x="40" y="40" width="140" height="100" fill="#4f7a3a"/><text x="110" y="95" text-anchor="middle" fill="#fff" font-family="system-ui">Forest</text>
  <circle cx="330" cy="170" r="55" fill="#6fa8dc"/><polygon points="60,280 140,190 220,280" fill="#8d7a6a"/></svg>`, { 'Content-Type': 'image/svg+xml' }));
