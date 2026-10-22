// Checkout: dependent region select, reveal links, billing and gift toggles,
// character counter, card number and expiry formatting.

(() => {
  const { $, $$ } = G;
  const data = $('#countries') ? JSON.parse($('#countries').textContent) : null;
  const country = $('[data-country]'), region = $('[data-region]');
  if (data && country && region) {
    const LABELS = { US: 'State', GB: 'Nation', AU: 'State or territory', CA: 'Province or territory' };
    country.addEventListener('change', () => {
      const c = data[country.value];
      region.innerHTML = '<option value="">Choose…</option>' + c.regions.map((r) => `<option>${r}</option>`).join('');
      $('label[for=f-region]').textContent = LABELS[country.value];
      $('#f-postal').placeholder = c.hint;
    });
  }

  for (const b of $$('[data-reveal]')) {
    b.addEventListener('click', () => {
      b.hidden = true;
      const target = $(`[data-reveal-target="${b.dataset.reveal}"]`);
      target.hidden = false;
      $('input', target)?.focus();
    });
  }

  const billing = $('[data-billing-toggle]');
  billing?.addEventListener('change', () => { $('[data-billing]').hidden = billing.checked; });
  const gift = $('[data-gift-toggle]');
  gift?.addEventListener('change', () => { $('[data-gift]').hidden = !gift.checked; });

  for (const counter of $$('[data-count-for]')) {
    const field = document.getElementById(counter.dataset.countFor);
    field.addEventListener('input', () => { counter.textContent = field.maxLength - field.value.length; });
  }

  const card = $('[data-card]');
  card?.addEventListener('input', () => {
    const digits = card.value.replace(/\D/g, '').slice(0, 16);
    card.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  });
  const exp = $('[data-exp]');
  exp?.addEventListener('input', (e) => {
    const digits = exp.value.replace(/\D/g, '').slice(0, 4);
    exp.value = digits.length > 2 || (digits.length === 2 && e.inputType !== 'deleteContentBackward') ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  });
})();
