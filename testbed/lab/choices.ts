// Lab · Choices: native and custom selects, listboxes, comboboxes, radios,
// checkboxes (styled, ARIA, tri-state), switches, segmented controls, ratings.

import { h } from '../lib/html.ts';
import { get, json } from '../lib/http.ts';
import { lab } from './kit.ts';

const REGIONS = new Intl.DisplayNames(['en'], { type: 'region' });
const COUNTRIES = [...new Set(Array.from({ length: 26 * 26 }, (_, i) => String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)))
  .map((code) => { try { const n = REGIONS.of(code); return n && n !== code ? n : null; } catch { return null; } })
  .filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b));

const PLACES: Record<string, Record<string, string[]>> = {
  'United States': { Utah: ['Moab', 'Springdale', 'Kanab'], Colorado: ['Boulder', 'Estes Park', 'Ouray'], Washington: ['Leavenworth', 'Port Angeles'] },
  Canada: { Alberta: ['Banff', 'Canmore', 'Jasper'], 'British Columbia': ['Squamish', 'Tofino', 'Whistler'] },
};

lab('choices', [
  {
    slug: 'native-select', title: 'A native select', task: 'Set the trip difficulty to Strenuous.', check: 'auto', needs: ['select'], level: 1,
    body: h`<label for="diff">Difficulty</label><select id="diff"><option value="">Choose…</option><option>Easy</option><option>Moderate</option><option>Strenuous</option><option>Expert only</option></select>`,
  },
  {
    slug: 'optgroups', title: 'Same name, different group', task: 'Choose Glacier National Park in the United States group.', check: 'auto', needs: ['select'], level: 2,
    note: 'Both groups have an option labelled "Glacier"; picking by visible text alone gets the Canadian one.',
    body: h`<label for="park">Park</label><select id="park"><option value="">Choose a park…</option>
      <optgroup label="Canada"><option value="ca-banff">Banff</option><option value="ca-glacier">Glacier</option><option value="ca-jasper">Jasper</option></optgroup>
      <optgroup label="United States"><option value="us-yosemite">Yosemite</option><option value="us-glacier">Glacier</option><option value="us-zion">Zion</option></optgroup></select>`,
  },
  {
    slug: 'long-select', title: 'A very long select', task: 'Set the country to Kyrgyzstan.', check: 'auto', needs: ['select'], level: 1,
    note: `${COUNTRIES.length} options.`,
    body: h`<label for="country">Country</label><select id="country"><option value="">Choose a country…</option>${COUNTRIES.map((c) => h`<option>${c}</option>`)}</select>`,
  },
  {
    slug: 'multi-select', title: 'Choose several', task: 'Select Tents, Stoves and Lanterns in the gear list (and nothing else), then press Save.', check: 'auto', needs: ['multiselect', 'modclick'], level: 2,
    body: h`<label for="gear">Gear categories (hold Cmd or Ctrl to pick several)</label>
      <select id="gear" multiple size="7">${['Tents', 'Packs', 'Stoves', 'Sleeping bags', 'Lanterns', 'Filters', 'Maps'].map((g) => h`<option>${g}</option>`)}</select>
      <div class="form-actions"><button type="button" id="gear-save">Save</button></div>`,
  },
  {
    slug: 'dependent', title: 'Dependent selects', task: 'Choose United States, then Utah, then Moab, and press Go.', check: 'auto', needs: ['select', 'wait', 'click'], level: 2,
    note: 'Each list loads from the server after the previous one changes.',
    body: h`<div class="row"><select id="d-country" aria-label="Country"><option value="">Country…</option>${Object.keys(PLACES).map((c) => h`<option>${c}</option>`)}</select>
      <select id="d-state" aria-label="State or province" disabled><option value="">State or province…</option></select>
      <select id="d-city" aria-label="City" disabled><option value="">City…</option></select><button type="button" id="d-go">Go</button></div>`,
  },
  {
    slug: 'listbox', title: 'A custom listbox', task: 'Choose campsite "Site 14" and press Reserve.', check: 'auto', needs: ['click'], level: 1,
    body: h`<span id="site-label" class="label">Campsite</span>
      <ul class="listbox-inline" role="listbox" tabindex="0" aria-labelledby="site-label" id="sites">${[3, 7, 9, 14, 18, 21].map((n) => h`<li role="option" id="site-${n}" aria-selected="false">Site ${n}</li>`)}</ul>
      <button type="button" id="reserve">Reserve</button>`,
  },
  {
    slug: 'combobox', title: 'Searchable picker', task: 'Pick "Lake Louise Campground" in the campground picker and press Book.', check: 'auto', needs: ['click', 'type'], level: 2,
    body: h`<label for="cg-input">Campground</label><div class="ac-wrap"><button type="button" class="select-btn" id="cg-btn" aria-haspopup="listbox" aria-expanded="false">Choose a campground ▾</button>
      <div class="menu cg-pop" id="cg-pop" hidden><input id="cg-input" placeholder="Search campgrounds" role="combobox" aria-controls="cg-list" aria-expanded="true" autocomplete="off"><ul role="listbox" id="cg-list"></ul></div></div>
      <button type="button" id="cg-book">Book</button>`,
  },
  {
    slug: 'aria-radios', title: 'ARIA radio group', task: 'Choose the "Overnight" trip length.', check: 'auto', needs: ['click'], level: 1,
    body: h`<span id="len-label" class="label">Trip length</span><div role="radiogroup" aria-labelledby="len-label" class="radio-pills" id="len">
      ${['Half day', 'Full day', 'Overnight', 'Multi-day'].map((l, i) => h`<div role="radio" aria-checked="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${l}</div>`)}</div>`,
  },
  {
    slug: 'native-radios', title: 'Native radio buttons', task: 'Set the skill level to Intermediate and continue.', check: 'auto', needs: ['click'], level: 1,
    body: h`<form id="skill"><fieldset><legend>Skill level</legend>${['Beginner', 'Intermediate', 'Advanced'].map((s) => h`<label class="inline"><input type="radio" name="skill" value="${s}"> ${s}</label>`)}</fieldset><button type="submit">Continue</button></form>`,
  },
  {
    slug: 'styled-checkboxes', title: 'Styled checkboxes', task: 'Tick "Bring a stove" and "Bring a map", leave the rest unticked, and press Save list.', check: 'auto', needs: ['click'], level: 1,
    note: 'The real inputs are hidden behind decorated labels.',
    body: h`<form id="pack" class="fancy-list">${['Bring a stove', 'Bring a tent', 'Bring a map', 'Bring a dog'].map((t, i) => h`<label class="fancy-check"><input type="checkbox" value="${t}" ${i === 1 ? h`checked` : ''}><span>${t}</span></label>`)}
      <button type="submit">Save list</button></form>`,
  },
  {
    slug: 'aria-checkboxes', title: 'ARIA checkboxes', task: 'Turn on "Email me" and make sure "Text me" is off.', check: 'auto', needs: ['click'], level: 1,
    body: h`<div class="aria-checks">${[['Email me', false], ['Text me', true], ['Call me', false]].map(([l, on]) => h`<div role="checkbox" tabindex="0" aria-checked="${on}" class="aria-check">${l}</div>`)}</div>`,
  },
  {
    slug: 'tristate', title: 'Select all, except one', task: 'Select every item except "Batteries".', check: 'auto', needs: ['click'], level: 2,
    body: h`<label class="inline"><input type="checkbox" id="all"> <strong>Select all</strong></label>
      <ul class="plain">${['Headlamp', 'Batteries', 'First-aid kit', 'Whistle', 'Knife'].map((t) => h`<li><label class="inline"><input type="checkbox" class="item" value="${t}"> ${t}</label></li>`)}</ul>`,
  },
  {
    slug: 'switches', title: 'Switches', task: 'Turn Wi-Fi off and Bluetooth on. Leave Location as it is.', check: 'auto', needs: ['click'], level: 1,
    body: h`${[['wifi', 'Wi-Fi', true], ['bt', 'Bluetooth', false], ['loc', 'Location', true]].map(([k, l, on]) => h`<div class="switch-line"><span id="sw-${k}">${l}</span>
      <button type="button" role="switch" class="switch" aria-checked="${on}" aria-labelledby="sw-${k}" data-key="${k}"><span></span></button></div>`)}`,
  },
  {
    slug: 'segmented', title: 'Segmented control', task: 'Set units to Metric.', check: 'auto', needs: ['click'], level: 1,
    body: h`<span class="label" id="units-label">Units</span><div class="seg-buttons" role="group" aria-labelledby="units-label">
      <button type="button" aria-pressed="true">Imperial</button><button type="button" aria-pressed="false">Metric</button></div>`,
  },
  {
    slug: 'stars', title: 'Star rating', task: 'Rate the hike 4 stars.', check: 'auto', needs: ['click'], level: 1,
    body: h`<div class="stars-input" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => h`<button type="button" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? 's' : ''}" data-n="${n}">★</button>`)}</div><p class="muted" id="stars-state">Not rated.</p>`,
  },
]);

get('/api/lab/places', (req) => {
  const country = req.query.get('country') ?? '', state = req.query.get('state');
  const list = state ? PLACES[country]?.[state] ?? [] : Object.keys(PLACES[country] ?? {});
  setTimeout(() => json(req, list), 500);
});

get('/api/lab/campgrounds', (req) => {
  const q = (req.query.get('q') ?? '').toLowerCase();
  const all = ['Lake Louise Campground', 'Lake Louise Hard-sided', 'Two Jack Lakeside', 'Tunnel Mountain Village', 'Johnston Canyon', 'Mosquito Creek', 'Rampart Creek', 'Waterfowl Lakes', 'Whistlers Campground', 'Wapiti'];
  setTimeout(() => json(req, all.filter((c) => c.toLowerCase().includes(q))), 300);
});
