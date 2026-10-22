// The OAuth-style consent popup on the second origin.

const target = new URLSearchParams(location.search).get('origin');
const reply = (allowed) => (e) => {
  window.opener?.postMessage({ type: 'pinecone-oauth', allowed, trusted: e.isTrusted }, target ?? '*');
  document.body.innerHTML = `<p style="padding:20px;font:15px system-ui">${allowed ? 'Connected. This window will close.' : 'Access denied.'}</p>`;
  setTimeout(() => window.close(), 800);
};
document.getElementById('allow').addEventListener('click', reply(true));
document.getElementById('deny').addEventListener('click', reply(false));
