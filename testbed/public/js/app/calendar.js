// Month calendar: create events in a modal, drag events to another day, view
// or delete an event from its popover.

App.view('calendar', {
  title: 'Calendar',
  async render(el) {
    const { esc } = App;
    let events = await G.api('/api/app/events');
    const settings = await G.api('/api/app/settings');
    const mondayFirst = settings.weekStart !== 'Sunday';
    let year = 2026, month = 9;
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
    const MONTHS = App.meta.months.map((m, i) => new Date(2026, i, 1).toLocaleString('en-US', { month: 'long' }));
    const today = new Date();
    const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

    el.innerHTML = `<div class="view-head"><h1>Calendar</h1>
        <div class="row"><button type="button" class="icon-btn" data-nav="-1" aria-label="Previous month">‹</button>
          <h2 class="month-label" data-label aria-live="polite"></h2>
          <button type="button" class="icon-btn" data-nav="1" aria-label="Next month">›</button>
          <button type="button" class="small secondary" data-today>Today</button>
          <button type="button" class="small" data-new>New event</button></div></div>
      <div class="cal" data-grid></div>
      <div class="popover-panel event-pop" hidden data-pop></div>
      <div class="modal-backdrop" id="event-modal" hidden>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ev-title-h">
          <h2 id="ev-title-h">New event</h2>
          <form data-ev-form>
            <label for="ev-title">Title</label><input id="ev-title" name="title" required>
            <label for="ev-date">Date</label><input id="ev-date" name="date" type="date" required>
            <label for="ev-time">Start time</label><input id="ev-time" name="time" type="time" value="09:00" required>
            <label for="ev-duration">Duration</label>
            <select id="ev-duration" name="duration">${[[30, '30 minutes'], [60, '1 hour'], [90, '1.5 hours'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours'], [480, 'All day']].map(([v, l]) => `<option value="${v}" ${v === 60 ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <div class="actions"><button type="button" class="secondary" data-close-modal>Cancel</button><button type="submit">Save event</button></div>
          </form>
        </div>
      </div>`;
    const $ = (s) => el.querySelector(s);
    const grid = $('[data-grid]'), pop = $('[data-pop]');

    function paint() {
      $('[data-label]').textContent = `${MONTHS[month]} ${year}`;
      const first = new Date(year, month, 1).getDay();
      const offset = mondayFirst ? (first + 6) % 7 : first;
      const days = new Date(year, month + 1, 0).getDate();
      const names = mondayFirst ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      let html = names.map((n) => `<div class="dow">${n}</div>`).join('') + '<div class="blank"></div>'.repeat(offset);
      for (let d = 1; d <= days; d++) {
        const date = iso(year, month, d);
        const evs = events.filter((e) => e.date === date).sort((a, b) => a.time.localeCompare(b.time));
        html += `<div class="day ${date === todayIso ? 'today' : ''}" data-date="${date}">
          <div class="day-head"><span class="num">${d}</span><button type="button" class="icon-btn small add" aria-label="Add event on ${MONTHS[month]} ${d}" data-add="${date}">+</button></div>
          ${evs.map((e) => `<button type="button" class="event" draggable="true" data-event="${e.id}">${e.time} ${esc(e.title)}</button>`).join('')}</div>`;
      }
      grid.innerHTML = html;
    }
    paint();

    const openNew = (date) => {
      const f = $('[data-ev-form]');
      f.reset();
      f.elements.date.value = date ?? iso(year, month, 1);
      G.openModal('event-modal');
      f.elements.title.focus();
    };
    el.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-pop]') && !e.target.closest('[data-event]')) pop.hidden = true;
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        month += Number(nav.dataset.nav);
        if (month < 0) { month = 11; year--; }
        if (month > 11) { month = 0; year++; }
        paint();
      }
      if (e.target.closest('[data-today]')) { year = today.getFullYear(); month = today.getMonth(); paint(); }
      if (e.target.closest('[data-new]')) openNew();
      const add = e.target.closest('[data-add]');
      if (add) openNew(add.dataset.add);
      const evBtn = e.target.closest('[data-event]');
      if (evBtn) {
        const ev = events.find((x) => x.id === Number(evBtn.dataset.event));
        pop.innerHTML = `<strong>${esc(ev.title)}</strong><p>${ev.date} at ${ev.time} · ${ev.duration} min</p>
          <p class="muted small">Drag the event to another day to reschedule it.</p>
          <button type="button" class="small danger" data-delete="${ev.id}">Delete event</button>`;
        const r = evBtn.getBoundingClientRect(), box = el.getBoundingClientRect();
        pop.style.left = `${r.left - box.left}px`;
        pop.style.top = `${r.bottom - box.top + 4}px`;
        pop.hidden = false;
      }
      const del = e.target.closest('[data-delete]');
      if (del) {
        events = (await G.api(`/api/app/events/${del.dataset.delete}`, { delete: true })).events;
        pop.hidden = true;
        paint();
      }
    });

    $('[data-ev-form]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const out = await G.api('/api/app/events', { title: f.elements.title.value, date: f.elements.date.value, time: f.elements.time.value, duration: Number(f.elements.duration.value) });
        events = out.events;
        G.closeModal($('#event-modal'));
        const [y, m] = f.elements.date.value.split('-').map(Number);
        year = y; month = m - 1;
        paint();
        G.toast('Event saved');
      } catch (err) {
        G.toast(err.message);
      }
    });

    grid.addEventListener('dragstart', (e) => {
      const b = e.target.closest('[data-event]');
      if (!b) return;
      e.dataTransfer.setData('text/plain', b.dataset.event);
      e.dataTransfer.effectAllowed = 'move';
    });
    grid.addEventListener('dragover', (e) => {
      const day = e.target.closest('[data-date]');
      if (!day) return;
      e.preventDefault();
      grid.querySelectorAll('.drop-target').forEach((d) => d.classList.remove('drop-target'));
      day.classList.add('drop-target');
    });
    grid.addEventListener('drop', async (e) => {
      const day = e.target.closest('[data-date]');
      const id = e.dataTransfer.getData('text/plain');
      if (!day || !id) return;
      e.preventDefault();
      events = (await G.api(`/api/app/events/${id}`, { date: day.dataset.date })).events;
      paint();
    });
  },
});
