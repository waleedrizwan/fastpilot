// Workspace settings: vertical tabs, a dirty-state guard that asks before you
// leave with unsaved changes, and a single Save button.

App.view('settings', {
  title: 'Settings',
  async render(el) {
    const s = await G.api('/api/app/settings');
    const zones = ['America/Toronto', 'America/Vancouver', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
    el.innerHTML = `<div class="view-head"><h1>Settings</h1><span class="pill" data-dirty hidden>Unsaved changes</span></div>
      <form class="settings-layout" data-form>
        <div role="tablist" aria-orientation="vertical" aria-label="Settings sections">
          ${['General', 'Notifications', 'Integrations', 'Appearance'].map((t, i) => `<button type="button" role="tab" id="st-${t}" aria-controls="sp-${t}" aria-selected="${!i}" ${i ? 'tabindex="-1"' : ''}>${t}</button>`).join('')}
        </div>
        <div>
          <section role="tabpanel" id="sp-General" aria-labelledby="st-General">
            <label for="ws-name">Workspace name</label><input id="ws-name" name="workspaceName" value="${App.esc(s.workspaceName)}">
            <label for="ws-tz">Time zone</label><select id="ws-tz" name="timezone">${zones.map((z) => `<option ${z === s.timezone ? 'selected' : ''}>${z}</option>`).join('')}</select>
            <fieldset><legend>Week starts on</legend>${['Monday', 'Sunday'].map((d) => `<label class="inline"><input type="radio" name="weekStart" value="${d}" ${d === s.weekStart ? 'checked' : ''}> ${d}</label>`).join('')}</fieldset>
          </section>
          <section role="tabpanel" id="sp-Notifications" aria-labelledby="st-Notifications" hidden>
            <label class="inline"><input type="checkbox" name="digest" ${s.digest ? 'checked' : ''}> Weekly digest email</label><br>
            <label class="inline"><input type="checkbox" name="mentions" ${s.mentions ? 'checked' : ''}> Email me when I'm mentioned</label><br>
            <label class="inline"><input type="checkbox" name="assignments" ${s.assignments ? 'checked' : ''}> Email me when I'm assigned a card</label>
          </section>
          <section role="tabpanel" id="sp-Integrations" aria-labelledby="st-Integrations" hidden>
            ${[['slack', 'Slack notifications'], ['calendarSync', 'Calendar sync']].map(([k, l]) => `<div class="switch-line"><span id="sw-${k}">${l}</span>
              <button type="button" role="switch" class="switch" aria-checked="${!!s[k]}" aria-labelledby="sw-${k}" data-switch="${k}"><span></span></button></div>`).join('')}
          </section>
          <section role="tabpanel" id="sp-Appearance" aria-labelledby="st-Appearance" hidden>
            <fieldset><legend>Theme</legend>${['light', 'dark'].map((t) => `<label class="inline"><input type="radio" name="theme" value="${t}" ${t === s.theme ? 'checked' : ''}> ${t[0].toUpperCase() + t.slice(1)}</label>`).join('')}</fieldset>
          </section>
          <div class="form-actions"><button type="submit" data-save disabled>Save changes</button><button type="button" class="secondary" data-reset disabled>Discard</button></div>
        </div>
      </form>`;
    G.wireTabs(el);
    const form = el.querySelector('[data-form]');
    const read = () => {
      const f = form.elements;
      const out = { workspaceName: f.workspaceName.value, timezone: f.timezone.value, weekStart: form.querySelector('[name=weekStart]:checked').value,
        digest: f.digest.checked, mentions: f.mentions.checked, assignments: f.assignments.checked, theme: form.querySelector('[name=theme]:checked').value };
      for (const sw of form.querySelectorAll('[data-switch]')) out[sw.dataset.switch] = sw.getAttribute('aria-checked') === 'true';
      return out;
    };
    let saved = JSON.stringify(read());
    const dirty = () => JSON.stringify(read()) !== saved;
    const sync = () => {
      const d = dirty();
      el.querySelector('[data-dirty]').hidden = !d;
      el.querySelector('[data-save]').disabled = !d;
      el.querySelector('[data-reset]').disabled = !d;
    };
    App.setGuard(dirty);
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    form.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-switch]');
      if (sw) { sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')); sync(); }
      if (e.target.closest('[data-reset]')) { App.setGuard(null); App.refresh(); }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = read();
      const out = await G.api('/api/app/settings', { ...values, via: 'settings' });
      document.body.classList.toggle('app-dark', out.settings.theme === 'dark');
      saved = JSON.stringify(read());
      sync();
      G.toast('Settings saved');
    });
  },
});
