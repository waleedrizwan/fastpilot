// Lab · Locale & state: right-to-left and Japanese pages, day/month dates,
// currencies, time zones, and flows gated by localStorage, sessionStorage and cookies.

import { h } from '../lib/html.ts';
import { get, setCookie } from '../lib/http.ts';
import { page } from '../lib/layout.ts';
import { lab } from './kit.ts';

lab('locale', [
  {
    slug: 'rtl', title: 'نموذج من اليمين إلى اليسار', task: 'In the right-to-left form, enter "Layla" in the name field (الاسم) and "Dubai" in the city field (المدينة), then press إرسال (Send).', check: 'auto', needs: ['type', 'click'], level: 2,
    htmlAttrs: h`dir="rtl" lang="ar"`,
    body: h`<form id="rtl-form"><label for="ar-name">الاسم</label><input id="ar-name"><label for="ar-city">المدينة</label><input id="ar-city">
      <label for="ar-phone">رقم الهاتف</label><input id="ar-phone" dir="ltr"><div class="form-actions"><button type="button" class="secondary">إلغاء</button><button type="submit">إرسال</button></div></form>`,
  },
  {
    slug: 'japanese', title: '予約', task: 'On the Japanese booking page, choose 札幌 (Sapporo) as the destination (行き先), set 2 travellers (人数), and press 予約する (Book).', check: 'auto', needs: ['select', 'type', 'click'], level: 2,
    htmlAttrs: h`lang="ja"`,
    body: h`<form id="ja-form"><label for="ja-dest">行き先</label><select id="ja-dest"><option value="">選択してください</option><option>東京</option><option>大阪</option><option>札幌</option><option>福岡</option></select>
      <label for="ja-people">人数</label><input id="ja-people" type="number" min="1" max="9" value="1"><div class="form-actions"><button type="button" class="secondary">キャンセル</button><button type="submit">予約する</button></div></form>`,
  },
  {
    slug: 'day-month', title: 'Day before month', task: 'On what date is the second event? Submit it as YYYY-MM-DD in the Answer box.', check: 'answer', needs: ['read', 'type'], level: 2,
    answer: ['2026-04-03', '3 April 2026', 'April 3, 2026'], note: 'Dates are written day/month/year.',
    body: h`<p class="muted">All dates are day/month/year.</p><table class="narrow-table"><thead><tr><th>Event</th><th>Date</th></tr></thead><tbody>
      <tr><td>Spring cleanup</td><td>14/03/2026</td></tr><tr><td>Trail opening</td><td>03/04/2026</td></tr><tr><td>Summer solstice hike</td><td>21/06/2026</td></tr></tbody></table>`,
  },
  {
    slug: 'currency', title: 'Switch currency', task: 'What is the Pro plan price in euros? Submit the number in the Answer box.', check: 'answer', needs: ['select', 'read', 'type'], level: 1,
    answer: 17.5,
    body: h`<label for="cur">Currency</label><select id="cur"><option value="USD">US dollar</option><option value="EUR">Euro</option><option value="GBP">Pound sterling</option><option value="JPY">Japanese yen</option></select>
      <div class="plans">${['Basic', 'Pro', 'Team'].map((p) => h`<div class="plan card"><h2>${p}</h2><p class="price big" data-plan="${p}"></p></div>`)}</div>`,
  },
  {
    slug: 'timezone', title: 'What time in UTC?', task: 'What time does the webinar start in UTC? Submit it in 24-hour HH:MM form in the Answer box.', check: 'answer', needs: ['click', 'read', 'type'], level: 2,
    answer: ['17:00', '5:00 PM', '5 PM'], note: 'The page shows the start in your local time zone until you switch it.',
    body: h`<div class="card"><h2>Webinar: Winter route planning</h2><p>Starts <strong id="tz-time"></strong> <span class="muted" id="tz-zone"></span></p>
      <label class="inline"><input type="checkbox" id="tz-utc"> Show in UTC</label></div>`,
  },
  {
    slug: 'onboarding', title: 'Finish the tour first', task: 'Finish the onboarding tour and create a project named "Base camp".', check: 'auto', needs: ['click', 'type'], level: 2,
    note: 'Tour progress lives in localStorage; the project form appears after the last step.',
    body: h`<div id="tour" class="card tour"></div><form id="proj" hidden><label for="proj-name">Project name</label><input id="proj-name"><button type="submit">Create project</button></form>
      <p><button type="button" class="link-btn small" id="tour-reset">Restart the tour</button></p>`,
  },
  {
    slug: 'session-steps', title: 'A two-page check-in', task: 'Complete both steps of the check-in, using the booking code GT-778.', check: 'auto', needs: ['type', 'click'], level: 2,
    note: 'Step 2 reads a sessionStorage value that step 1 sets.',
    body: h`<form id="ci1"><p>Step 1 of 2</p><label for="ci-code">Booking code</label><input id="ci-code"><button type="submit">Next</button></form>`,
  },
  {
    slug: 'region-gate', title: 'Choose a region', task: 'Choose Canada as your region and submit the price of a day pass in Canadian dollars in the Answer box.', check: 'answer', needs: ['click', 'read', 'type'], level: 1,
    answer: 12, note: 'The region is remembered in a cookie and the page reloads.',
    onStart: (req) => setCookie(req, 'region', '', 'Path=/; Max-Age=0'),
    body: (req) => {
      const region = req.cookies.region;
      const prices: Record<string, string> = { CA: 'CA$12.00', US: 'US$10.00', UK: '£8.00' };
      return region && prices[region]
        ? h`<p>Region: <strong>${region}</strong> <button type="button" class="link-btn small" data-region="">Change</button></p><div class="card"><h2>Day pass</h2><p class="price big">${prices[region]}</p></div>`
        : h`<div class="card"><h2>Where are you visiting from?</h2><div class="row">${[['CA', 'Canada'], ['US', 'United States'], ['UK', 'United Kingdom']].map(([c, n]) => h`<button type="button" class="secondary" data-region="${c}">${n}</button>`)}</div></div>`;
    },
  },
]);

get('/lab/locale/checkin-2', (req) => page({
  req, title: 'Check-in, step 2', shell: 'lab', lab: 'locale/checkin-2', challenges: ['lab/locale/session-steps'],
  crumbs: [['Lab', '/lab'], ['Locale & state', '/lab/locale'], ['Check-in']],
  body: h`<h1>Check-in</h1><div id="ci2"></div>`,
}));
