// Lab · Shadow DOM & frames page scripts, including the code inside frames.

const shadowStyle = '<style>:host{display:block;margin:12px 0}div{border:1px solid #dcd8cf;border-radius:10px;padding:14px;background:#fff;font:15px system-ui}button{font:inherit;padding:6px 14px;border-radius:8px;border:1px solid #2f5d3a;background:#2f5d3a;color:#fff;cursor:pointer}input{font:inherit;padding:6px 8px;border:1px solid #b9b4a9;border-radius:8px}</style>';

customElements.define('signup-card', class extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `${shadowStyle}<div><strong>Get trail updates</strong><form><label>Email <input type="email" name="email"></label> <button type="submit">Subscribe</button></form><p class="msg"></p></div>`;
    root.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = root.querySelector('input').value.trim();
      root.querySelector('.msg').textContent = `Subscribed ${email}.`;
      G.report('lab/frames/open-shadow', email === 'jo@example.com' ? 'pass' : 'fail', `subscribed ${email}`, e);
    });
  }
});

for (const [tag, child] of [['outer-box', 'middle-box'], ['middle-box', 'inner-box']]) {
  customElements.define(tag, class extends HTMLElement {
    connectedCallback() {
      this.attachShadow({ mode: 'open' }).innerHTML = `${shadowStyle}<div><em>${tag}</em><${child}></${child}></div>`;
    }
  });
}
customElements.define('inner-box', class extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `${shadowStyle}<div><em>inner-box</em> <button type="button">Deep button</button></div>`;
    root.querySelector('button').addEventListener('click', (e) => G.pass('lab/frames/nested-shadow', 'clicked through three shadow roots', e));
  }
});

customElements.define('secret-switch', class extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'closed' });
    root.innerHTML = `${shadowStyle}<div>Private controls: <button type="button">Hidden switch</button></div>`;
    root.querySelector('button').addEventListener('click', (e) => G.pass('lab/frames/closed-shadow', 'clicked inside a closed shadow root', e));
  }
});

customElements.define('code-card', class extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `${shadowStyle}<div><strong>Vault</strong><p>The vault code is 7721.</p></div>`;
  }
});

G.lab('frames/cross-origin-iframe', (id) => {
  const other = G.$('iframe[data-other]').dataset.other;
  addEventListener('message', (e) => {
    if (e.origin !== other || e.data?.type !== 'gauntlet-partner') return;
    G.report(id, e.data.email === 'jo@example.com' ? 'pass' : 'fail', `joined with ${e.data.email}`, { isTrusted: e.data.trusted });
  });
});

// Inside frames.
G.lab('frames/frame-promo', () => {
  G.$('#promo').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = G.$('#code').value.trim().toUpperCase();
    G.$('#promo-msg').textContent = code === 'SPRING' ? 'Code applied: 15% off.' : 'That code is not valid.';
    parent.G.report('lab/frames/same-origin-iframe', code === 'SPRING' ? 'pass' : 'fail', `applied ${code}`, e);
  });
});
G.lab('frames/frame-inner', () => {
  G.$('#innermost').addEventListener('click', (e) => top.G.pass('lab/frames/nested-iframes', 'clicked two frames deep', e));
});
G.lab('frames/frame-loading', () => {
  setTimeout(() => location.replace('/lab/frames/frame/invite'), 2000);
});
G.lab('frames/frame-invite', () => {
  G.$('#accept').addEventListener('click', (e) => parent.G.pass('lab/frames/navigating-iframe', 'accepted after the frame navigated', e));
  G.$('#decline').addEventListener('click', (e) => parent.G.fail('lab/frames/navigating-iframe', 'declined', e));
});
