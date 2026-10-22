// Lab · Reading: facts in tables, lists, pseudo-elements, canvas, SVG, images,
// truncated text, lazy "Show more", closed <details>, iframes, PDFs, locale
// formats and arithmetic, plus a hidden decoy that must not be reported.

import { h } from '../lib/html.ts';
import { get, json, send } from '../lib/http.ts';
import { lab } from './kit.ts';

const TRAILS: [string, number, number, string][] = [
  ['Larch Valley', 8.6, 535, 'Moderate'], ['Sentinel Pass', 11.6, 725, 'Hard'], ['Plain of Six Glaciers', 13.8, 587, 'Moderate'],
  ['Johnston Canyon', 5.4, 120, 'Easy'], ['Cory Pass', 13.0, 1000, 'Hard'], ['Sulphur Skyline', 8.2, 700, 'Moderate'],
];
const EXPENSES: [string, number][] = [['Campsite', 112.5], ['Fuel', 64.2], ['Groceries', 187.35], ['Park pass', 72], ['Bear spray', 54.99]];

/** A one-page PDF with a few lines of text, built by hand so no library is needed. */
function pdf(lines: string[]): Buffer {
  const text = lines.map((l, i) => `BT /F1 16 Tf 60 ${740 - i * 28} Td (${l.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

lab('reading', [
  {
    slug: 'table', title: 'Look it up in a table', task: 'Find the elevation gain of the Sentinel Pass trail and submit it, in metres, in the Answer box.', check: 'answer', needs: ['read', 'type'], level: 1,
    answer: 725,
    body: h`<table><thead><tr><th>Trail</th><th class="num">Distance (km)</th><th class="num">Elevation gain (m)</th><th>Difficulty</th></tr></thead>
      <tbody>${TRAILS.map(([n, d, e, l]) => h`<tr><td>${n}</td><td class="num">${d}</td><td class="num">${e}</td><td>${l}</td></tr>`)}</tbody></table>`,
  },
  {
    slug: 'nested-list', title: 'A nested itinerary', task: 'What is planned for Day 2, afternoon? Submit it in the Answer box.', check: 'answer', needs: ['read', 'type'], level: 1,
    answer: 'Swim at Upper Tarn',
    body: h`<ul class="outline">${[['Day 1', [['Morning', 'Drive to trailhead'], ['Afternoon', 'Hike to Larch Lake']]], ['Day 2', [['Morning', 'Summit attempt'], ['Afternoon', 'Swim at Upper Tarn'], ['Evening', 'Campfire stories']]], ['Day 3', [['Morning', 'Hike out']]]].map(([d, parts]) =>
      h`<li><strong>${d}</strong><ul>${(parts as string[][]).map(([p, w]) => h`<li>${p}<ul><li>${w}</li></ul></li>`)}</ul></li>`)}</ul>`,
  },
  {
    slug: 'pseudo-element', title: 'Text in CSS', task: 'What is the monthly price of the Deluxe plan? Submit the number in the Answer box.', check: 'answer', needs: ['screenshot', 'type'], level: 2,
    answer: 49, note: 'Prices are drawn with CSS ::before content, which innerText does not include.',
    body: h`<div class="plans">${[['Basic', 9], ['Standard', 19], ['Deluxe', 49]].map(([n, p]) => h`<div class="plan card"><h2>${n}</h2><p class="css-price" data-price="$${p}/month"></p></div>`)}</div>`,
  },
  {
    slug: 'canvas-text', title: 'Text on a canvas', task: 'Read the gate code drawn on the canvas and submit it (digits only) in the Answer box.', check: 'answer', needs: ['screenshot', 'type'], level: 2,
    answer: '5813', body: h`<canvas id="gate" width="420" height="140" class="framed" role="img" aria-label="A sign with the gate code"></canvas>`,
  },
  {
    slug: 'svg-text', title: 'Labels in an SVG chart', task: 'Which month had the most visitors in the SVG chart? Submit the month in the Answer box.', check: 'answer', needs: ['read', 'screenshot', 'type'], level: 2,
    answer: ['August', 'Aug'],
    body: h`<svg width="420" height="220" viewBox="0 0 420 220" class="framed" role="img" aria-label="Visitors per month">
      ${[['Jun', 120], ['Jul', 160], ['Aug', 185], ['Sep', 140], ['Oct', 90]].map(([m, v], i) => h`<rect x="${30 + i * 75}" y="${200 - (v as number)}" width="50" height="${v}" fill="#2f5d3a"/><text x="${55 + i * 75}" y="215" text-anchor="middle" font-size="12">${m}</text>`)}
    </svg>`,
  },
  {
    slug: 'image-text', title: 'Words in a picture', task: 'What does the trail sign in the picture say is closed? Submit it in the Answer box.', check: 'answer', needs: ['screenshot', 'type'], level: 2,
    answer: 'Wenkchemna Pass', body: h`<img src="/lab/reading/sign.svg" alt="" width="420" height="220" class="framed">`,
  },
  {
    slug: 'truncated', title: 'Truncated names', task: 'What is the full name of the third file? Submit it in the Answer box.', check: 'answer', needs: ['read', 'type'], level: 1,
    answer: 'larch-valley-route-with-alternate-descent-via-sentinel-pass-final-v3.gpx',
    body: h`<ul class="trunc">${['notes.txt', 'packing-list-for-the-autumn-trip-updated.pdf', 'larch-valley-route-with-alternate-descent-via-sentinel-pass-final-v3.gpx', 'photos.zip'].map((f) => h`<li title="${f}">📄 ${f}</li>`)}</ul>`,
  },
  {
    slug: 'show-more', title: 'Behind "Show more"', task: 'Read the full trail description and submit the name of the hut mentioned at the end in the Answer box.', check: 'answer', needs: ['click', 'read', 'type'], level: 1,
    answer: 'Abbot Pass Hut',
    body: h`<p id="desc">The trail climbs steadily through larch forest to a broad valley with views of ten peaks… <button type="button" class="link-btn" id="more">Show more</button></p>`,
  },
  {
    slug: 'closed-details', title: 'Inside a closed details', task: 'What is the emergency radio channel? Submit it in the Answer box.', check: 'answer', needs: ['click', 'read', 'type'], level: 1,
    answer: 16, note: 'Closed <details> content is not rendered, so innerText skips it.',
    body: h`<details><summary>Safety information</summary><p>Emergency radio channel: <strong>16</strong>. Nearest ranger station: Lake Louise.</p></details>`,
  },
  {
    slug: 'iframe-text', title: 'Text in a frame', task: 'What is the campsite fee shown in the embedded notice? Submit the amount in the Answer box.', check: 'answer', needs: ['screenshot', 'type'], level: 2,
    answer: 27.5, note: 'document.body.innerText does not include iframe content.',
    body: h`<iframe class="lab-frame" height="120" title="Notice" srcdoc="${'<body style="font:15px system-ui;padding:12px"><strong>Notice</strong><p>Campsite fee: $27.50 per night.</p></body>'}"></iframe>`,
  },
  {
    slug: 'pdf', title: 'Inside a PDF', task: 'Open the permit PDF and submit the permit holder\'s name in the Answer box.', check: 'answer', needs: ['screenshot', 'type'], level: 3,
    answer: 'Ingrid Halvorsen', note: 'The PDF is shown by the browser viewer; its text is not in the page DOM.',
    body: h`<embed src="/lab/reading/permit.pdf" type="application/pdf" width="560" height="380" class="framed"><p><a href="/lab/reading/permit.pdf">Open the PDF in this tab</a></p>`,
  },
  {
    slug: 'locale-number', title: 'A European number', task: 'What is the invoice total? Submit it as a plain number with a decimal point, like 1234.56.', check: 'answer', needs: ['read', 'type'], level: 2,
    answer: 4318.75, note: 'Shown in German format: 4.318,75 €.',
    body: h`<div class="card invoice" lang="de"><h2>Rechnung 2026-117</h2><p>Hüttenübernachtungen: 3.890,00 €</p><p>Verpflegung: 428,75 €</p><p><strong>Gesamt: 4.318,75 €</strong></p></div>`,
  },
  {
    slug: 'sum', title: 'Add it up', task: 'What is the total of the Amount column? Submit it in the Answer box.', check: 'answer', needs: ['read', 'type'], level: 1,
    answer: Math.round(EXPENSES.reduce((s, [, a]) => s + a, 0) * 100) / 100,
    body: h`<table class="narrow-table"><thead><tr><th>Item</th><th class="num">Amount ($)</th></tr></thead><tbody>${EXPENSES.map(([n, a]) => h`<tr><td>${n}</td><td class="num">${a.toFixed(2)}</td></tr>`)}</tbody></table>`,
  },
  {
    slug: 'decoy', title: 'Ignore the hidden decoy', task: 'Which room is the trip briefing in? Submit it in the Answer box.', check: 'answer', needs: ['read', 'type'], level: 2,
    answer: '4B', reject: ['9Z'], note: 'A display:none paragraph and an off-screen one name a different room.',
    body: h`<p style="display:none">Trip briefing: Room 9Z.</p><p class="offscreen">Trip briefing moved to Room 9Z.</p><div class="card"><h2>Trip briefing</h2><p>Thursday 7 pm in Room 4B.</p></div>`,
  },
  {
    slug: 'aria-only', title: 'Only in an accessible name', task: 'What is the battery level of the GPS unit? Submit the percentage in the Answer box.', check: 'answer', needs: ['read', 'type'], level: 1,
    answer: 64,
    body: h`<p>GPS unit status: <span class="battery" role="img" aria-label="Battery 64%"><span style="width:64%"></span></span></p><button type="button" class="icon-btn" aria-label="Refresh battery level (64%)">↻</button>`,
  },
]);

get('/lab/reading/sign.svg', (req) => send(req, 200, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 220" width="420" height="220">
  <rect width="420" height="220" fill="#cfe0f0"/><rect x="40" y="40" width="340" height="120" rx="8" fill="#6b4a2b"/><rect x="200" y="160" width="20" height="60" fill="#6b4a2b"/>
  <text x="210" y="90" font-family="Georgia,serif" font-size="26" fill="#fff" text-anchor="middle">CLOSED</text>
  <text x="210" y="128" font-family="Georgia,serif" font-size="22" fill="#fff" text-anchor="middle">Wenkchemna Pass</text></svg>`, { 'Content-Type': 'image/svg+xml' }));

get('/lab/reading/permit.pdf', (req) => send(req, 200, pdf(['Backcountry Permit #BP-7781', 'Holder: Ingrid Halvorsen', 'Route: Skoki Loop, 3 nights', 'Valid: 2026-11-02 to 2026-11-05']), { 'Content-Type': 'application/pdf' }));

get('/api/lab/description', (req) => setTimeout(() => json(req, { rest: 'The final stretch crosses scree to a notch between two peaks, where the old stone Abbot Pass Hut once stood. Turn back if the weather turns.' }), 500));
