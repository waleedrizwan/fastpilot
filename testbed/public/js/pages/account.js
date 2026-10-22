// Account pages: show-password toggles, registration checks and mock CAPTCHA,
// the 6-box code input, settings switches, repeating address rows.

(() => {
  const { $, $$ } = G;

  // Show/hide password.
  for (const b of $$('[data-show-password], [data-show-password-for]')) {
    b.addEventListener('click', () => {
      const input = b.dataset.showPassword ? document.getElementById(b.dataset.showPassword) : $(b.dataset.showPasswordFor);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.setAttribute('aria-pressed', String(show));
      b.textContent = show ? 'Hide' : b.dataset.showPassword ? 'Show' : 'Reveal';
    });
  }

  // Registration.
  const reg = $('#register-form');
  if (reg) {
    const user = $('#r-username'), status = $('#username-status');
    let timer;
    user.addEventListener('input', () => {
      clearTimeout(timer);
      status.textContent = 'Checking…';
      timer = setTimeout(async () => {
        const out = await G.api(`/api/username?u=${encodeURIComponent(user.value)}`);
        status.className = `hint ${out.ok ? 'ok' : 'bad'}`;
        status.innerHTML = '';
        status.append(out.message);
        if (out.suggestions) {
          const ul = document.createElement('ul');
          ul.className = 'suggestions';
          for (const s of out.suggestions) {
            const li = document.createElement('li');
            const b = Object.assign(document.createElement('button'), { type: 'button', className: 'link-btn', textContent: s });
            b.addEventListener('click', () => { user.value = s; user.dispatchEvent(new Event('input')); });
            li.append(b);
            ul.append(li);
          }
          status.append(ul);
        }
      }, 400);
    });

    const pw = $('#r-password'), confirm = $('#r-confirm'), meter = $('#strength');
    let reported = false;
    const check = () => {
      const v = pw.value;
      const reqs = { len: v.length >= 12, case: /[a-z]/.test(v) && /[A-Z]/.test(v), num: /\d/.test(v), sym: /[^\w\s]/.test(v) };
      for (const [k, ok] of Object.entries(reqs)) $(`[data-req=${k}]`).classList.toggle('met', ok);
      const score = Object.values(reqs).filter(Boolean).length + (v.length >= 16 ? 1 : 0);
      const label = !v ? '–' : score <= 1 ? 'Weak' : score <= 3 ? 'Fair' : 'Strong';
      meter.dataset.level = label.toLowerCase();
      $('.label', meter).textContent = `Strength: ${label}`;
      $('.bar span', meter).style.width = `${Math.min(100, score * 22)}%`;
      const match = confirm.value && confirm.value === v;
      $('[data-match]').textContent = confirm.value ? (match ? 'Passwords match' : "Passwords don't match") : '';
      if (label === 'Strong' && match && !reported) {
        reported = true;
        G.api('/api/register-progress', { strong: true, match: true });
      }
    };
    pw.addEventListener('input', check);
    confirm.addEventListener('input', check);

    reg.addEventListener('change', (e) => {
      if (e.target.name === 'heard') $('[data-heard-other]').hidden = e.target.value !== 'Other';
    });

    // Terms: the checkbox unlocks once the box is scrolled to the end.
    const terms = $('[data-terms]'), termsCheck = $('[data-terms-check]');
    terms.addEventListener('scroll', () => {
      if (terms.scrollTop + terms.clientHeight >= terms.scrollHeight - 4) {
        termsCheck.disabled = false;
        $('[data-terms-hint]').textContent = 'Thanks for reading.';
      }
    });

    // Mock CAPTCHA: checking the box opens an image grid instead.
    const box = $('[data-captcha-box]');
    box.addEventListener('click', (e) => {
      if (reg.elements.captcha.value) return;
      e.preventDefault();
      G.openModal('captcha-modal', box);
    });
    for (const t of $$('[data-tile]')) {
      t.addEventListener('click', () => t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true')));
    }
    $('[data-captcha-verify]').addEventListener('click', async () => {
      const tiles = $$('[data-tile][aria-pressed=true]').map((t) => Number(t.dataset.tile));
      const out = await G.api('/api/captcha', { tiles });
      if (!out.ok) {
        $('[data-captcha-error]').hidden = false;
        $$('[data-tile]').forEach((t) => t.setAttribute('aria-pressed', 'false'));
        return;
      }
      reg.elements.captcha.value = out.token;
      box.checked = true;
      G.closeModal($('#captcha-modal'));
    });
  }

  // 6-box code: auto-advance, backspace goes back, paste fills every box.
  const otp = $('.otp');
  if (otp) {
    const boxes = $$('input', otp);
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        b.value = b.value.replace(/\D/g, '').slice(-1);
        if (b.value && boxes[i + 1]) boxes[i + 1].focus();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && boxes[i - 1]) { boxes[i - 1].focus(); boxes[i - 1].value = ''; e.preventDefault(); }
        if (e.key === 'ArrowLeft' && boxes[i - 1]) boxes[i - 1].focus();
        if (e.key === 'ArrowRight' && boxes[i + 1]) boxes[i + 1].focus();
      });
      b.addEventListener('paste', (e) => {
        const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        if (!digits) return;
        e.preventDefault();
        [...digits].forEach((d, k) => { if (boxes[k]) boxes[k].value = d; });
        boxes[Math.min(digits.length, 5)].focus();
      });
    });
    otp.closest('form').addEventListener('submit', (e) => {
      e.target.elements.code.value = boxes.map((b) => b.value).join('');
    });
  }

  // Settings: tabs follow the URL hash.
  const hashTabs = $('[data-hash-tabs]');
  if (hashTabs) {
    const pick = () => $(`#tab-${location.hash.slice(1)}`)?.click();
    pick();
    addEventListener('hashchange', pick);
    hashTabs.addEventListener('tabs:change', (e) => history.replaceState(null, '', `#${e.detail.id.replace('tab-', '')}`));
  }

  for (const s of $$('[data-switch]')) {
    s.addEventListener('click', () => {
      const on = s.getAttribute('aria-checked') !== 'true';
      s.setAttribute('aria-checked', String(on));
      s.parentElement.querySelector(`input[name="${s.dataset.switch}"]`).value = on ? '1' : '0';
    });
  }

  const bio = $('[data-counter]');
  bio?.addEventListener('input', () => { $('[data-count]').textContent = bio.maxLength - bio.value.length; });
  $('#avatar')?.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) $('[data-avatar]').textContent = f.name.slice(0, 2).toUpperCase();
  });

  // Repeating address rows.
  const repeat = $('[data-repeat-form]');
  if (repeat) {
    const list = $('[data-repeat-list]', repeat);
    const renumber = () => $$('[data-repeat-item]', list).forEach((f, i) => { $('legend', f).textContent = `Address ${i + 1}`; });
    $('[data-repeat-add]', repeat).addEventListener('click', () => {
      const n = list.children.length;
      list.insertAdjacentHTML('beforeend', $('[data-repeat-template]', repeat).innerHTML.replaceAll('__i__', `${n}-${Date.now() % 1000}`));
      renumber();
      $('input', list.lastElementChild).focus();
    });
    list.addEventListener('click', (e) => {
      if (!e.target.closest('[data-repeat-remove]')) return;
      e.target.closest('[data-repeat-item]').remove();
      renumber();
    });
  }
})();
