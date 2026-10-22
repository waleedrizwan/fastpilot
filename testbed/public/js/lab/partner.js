// Partner widget on the second origin: reports to the embedding page with postMessage.

document.getElementById('partner').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('p-email').value.trim();
  document.getElementById('p-msg').textContent = `Thanks, ${email} is on the list.`;
  const target = new URLSearchParams(location.search).get('parent') ?? '*';
  parent.postMessage({ type: 'gauntlet-partner', email, trusted: e.isTrusted }, target);
});
