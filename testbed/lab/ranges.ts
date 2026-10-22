// Lab · Ranges & dates: native and custom sliders, date and time inputs,
// a custom calendar, a date-range picker and a color input.

import { h } from '../lib/html.ts';
import { lab } from './kit.ts';

lab('ranges', [
  {
    slug: 'native-range', title: 'Exactly 37', task: 'Set the temperature slider to exactly 37 and press Set.', check: 'auto', needs: ['click', 'key'], level: 3,
    note: 'A native <input type=range> from 0 to 100. Clicking lands near a value; arrow keys move one step.',
    body: h`<label for="temp">Temperature</label><input type="range" id="temp" min="0" max="100" value="50" style="width:320px"> <output id="temp-out">50</output>
      <div class="form-actions"><button type="button" id="temp-set">Set</button></div>`,
  },
  {
    slug: 'aria-slider', title: 'A custom slider', task: 'Set the volume to 80.', check: 'auto', needs: ['click', 'key'], level: 2,
    note: 'role="slider" with arrow, Page Up/Down, Home and End keys; steps of 5.',
    body: h`<span id="vol-label" class="label">Volume</span><div class="cslider" id="vol"><div class="track"><div class="fill"></div>
      <div class="thumb" role="slider" tabindex="0" aria-labelledby="vol-label" aria-valuemin="0" aria-valuemax="100" aria-valuenow="30" aria-valuetext="30%"></div></div></div><p class="muted" id="vol-out">30%</p>`,
  },
  {
    slug: 'dual-thumb', title: 'Two thumbs', task: 'Set the price range to $100–$300 and press Apply.', check: 'auto', needs: ['click', 'key'], level: 3,
    body: h`<span class="label" id="pr-label">Price range</span><div class="cslider dual" id="pr"><div class="track"><div class="fill"></div>
      <div class="thumb" role="slider" tabindex="0" aria-label="Minimum price" aria-valuemin="0" aria-valuemax="500" aria-valuenow="0" data-which="lo"></div>
      <div class="thumb" role="slider" tabindex="0" aria-label="Maximum price" aria-valuemin="0" aria-valuemax="500" aria-valuenow="500" data-which="hi"></div></div></div>
      <p class="muted" id="pr-out">$0 – $500</p><button type="button" id="pr-apply">Apply</button>`,
  },
  {
    slug: 'date-input', title: 'A native date input', task: 'Set the start date to December 24, 2026 and press Save.', check: 'auto', needs: ['type', 'click'], level: 2,
    note: 'Chrome\'s date field takes typed digits in the browser\'s locale order (MM/DD/YYYY in en-US).',
    body: h`<form id="date-form"><label for="start">Start date</label><input type="date" id="start"><button type="submit">Save</button></form>`,
  },
  {
    slug: 'time-input', title: 'A native time input', task: 'Set the alarm to 6:45 AM and press Save.', check: 'auto', needs: ['type', 'click'], level: 2,
    body: h`<form id="time-form"><label for="alarm">Alarm</label><input type="time" id="alarm"><button type="submit">Save</button></form>`,
  },
  {
    slug: 'datetime-input', title: 'Date and time together', task: 'Schedule the post for November 5, 2026 at 2:30 PM and press Schedule.', check: 'auto', needs: ['type', 'click'], level: 2,
    body: h`<form id="dt-form"><label for="when">Publish at</label><input type="datetime-local" id="when"><button type="submit">Schedule</button></form>`,
  },
  {
    slug: 'month-week', title: 'Month and week inputs', task: 'Set the billing month to March 2027 and the sprint to week 9 of 2027, then save.', check: 'auto', needs: ['type', 'click'], level: 2,
    body: h`<form id="mw-form"><label for="bill">Billing month</label><input type="month" id="bill"><label for="sprint">Sprint week</label><input type="week" id="sprint">
      <div class="form-actions"><button type="submit">Save</button></div></form>`,
  },
  {
    slug: 'calendar', title: 'A custom date picker', task: 'Pick January 15, 2027 in the date picker and press Confirm.', check: 'auto', needs: ['click'], level: 2,
    note: 'The calendar opens on October 2026; you have to page forward.',
    body: h`<label for="cal-input">Arrival</label><div class="ac-wrap"><input id="cal-input" readonly placeholder="Choose a date" aria-haspopup="dialog">
      <div class="datepicker menu" id="cal-pop" role="dialog" aria-label="Choose a date" hidden></div></div> <button type="button" id="cal-confirm">Confirm</button>`,
  },
  {
    slug: 'date-range', title: 'A date-range picker', task: 'Select the stay from November 3 to November 9, 2026, then press Apply.', check: 'auto', needs: ['click'], level: 2,
    body: h`<p class="muted" id="rg-out">Click a start day, then an end day.</p><div class="datepicker inline" id="rg-cal"></div><button type="button" id="rg-apply">Apply</button>`,
  },
  {
    slug: 'color', title: 'A color input', task: 'Set the trail marker color to #2f5d3a and press Save.', check: 'auto', needs: ['click', 'dialog'], level: 2,
    note: 'Native color inputs open an operating-system picker.',
    body: h`<form id="color-form"><label for="marker">Marker color</label><input type="color" id="marker" value="#e0662f"> <span class="swatch-out" id="swatch-out"></span>
      <div class="form-actions"><button type="submit">Save</button></div></form>`,
  },
]);
