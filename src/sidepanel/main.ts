import { loadSettings, needsApiKey, saveSettings, type LiveStep, type LogEvent, type PanelMsg, type Settings } from '../shared/types';
import { deleteRecording, listRecordings } from '../shared/recordings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('task-form');
const task = $<HTMLTextAreaElement>('task');
const runBtn = $<HTMLButtonElement>('run');
const stopBtn = $<HTMLButtonElement>('stop');
const log = $<HTMLOListElement>('log');

const port = chrome.runtime.connect({ name: 'panel' });
const send = (m: PanelMsg) => port.postMessage(m);

function setRunning(on: boolean) {
  runBtn.hidden = on;
  stopBtn.hidden = !on;
}

// The live card: the current step as it happens, replaced by each 'live' event.
const now = $<HTMLElement>('now');

function renderLive(l: LiveStep) {
  now.hidden = false;
  now.classList.remove('finished');
  now.classList.toggle('busy', !/finished|complete/.test(l.status));
  $('now-step').textContent = `Step ${l.step}`;
  $('now-status').textContent = l.status;

  const jev = $('now-jev');
  jev.hidden = !l.jev;
  if (l.jev) {
    if (l.jev.error) jev.textContent = `Jev: ${l.jev.error}`;
    else {
      const pick = `${l.jev.next ?? '?'}${l.jev.target ? ` ${l.jev.target}` : ''}`;
      const bar = (p = 0) => { const b = document.createElement('span'); b.className = 'bar'; const f = document.createElement('span'); f.style.width = `${Math.round(p * 100)}%`; b.append(f); return b; };
      jev.replaceChildren(`Jev ${l.jev.ms}ms · would ${pick}`, bar(l.jev.nextP), `${(l.jev.nextP ?? 0).toFixed(2)} · done`, bar(l.jev.done), (l.jev.done ?? 0).toFixed(2));
    }
  }

  $('now-calls').replaceChildren(...l.calls.map((c) => {
    const li = document.createElement('li');
    const what = document.createElement('span');
    what.className = 'what';
    what.dataset.state = c.state;
    what.textContent = `${c.name}${c.target ? ` ${c.target}` : ''}`;
    li.append(what);
    if (c.why) {
      const why = document.createElement('span');
      why.className = 'why';
      why.textContent = `because: ${c.why}`;
      li.append(why);
    }
    return li;
  }));

  const text = $('now-text');
  const said = [l.reasoning, l.text].filter((s) => s.trim()).join('\n').trim();
  text.hidden = !said;
  text.textContent = said.length > 400 ? `…${said.slice(-400)}` : said;
}

function append(e: LogEvent) {
  const li = document.createElement('li');
  li.className = e.kind;
  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = e.kind === 'action' ? `→ ${e.text}` : e.text;
  li.append(text);
  if (e.ms !== undefined) {
    const ms = document.createElement('span');
    ms.className = 'ms';
    ms.textContent = e.ms >= 1000 ? `${(e.ms / 1000).toFixed(1)}s` : `${e.ms}ms`;
    li.append(ms);
  }
  log.append(li);
  li.scrollIntoView({ block: 'end' });
}

port.onMessage.addListener((e: LogEvent) => {
  if (e.kind === 'idle') {
    setRunning(false);
    now.classList.add('finished');
    now.classList.remove('busy');
  } else if (e.kind === 'live') {
    if (e.live) renderLive(e.live);
  } else append(e);
});

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const t = task.value.trim();
  if (!t) return;
  now.hidden = true;
  append({ kind: 'info', text: `▶ ${t}` });
  setRunning(true);
  send({ type: 'run', task: t });
});
task.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    form.requestSubmit();
  }
});
stopBtn.addEventListener('click', () => send({ type: 'stop' }));
$('snap').addEventListener('click', () => send({ type: 'snapshot' }));
$('clear').addEventListener('click', () => log.replaceChildren());

// Settings
const fields = ['baseUrl', 'model', 'apiKey', 'speed', 'maxSteps', 'jev', 'jevModel'] as const;
const preset = $<HTMLSelectElement>('preset');

function syncPreset() {
  const url = $<HTMLInputElement>('baseUrl').value;
  preset.value = Array.from(preset.options).some((o) => o.value === url) ? url : '';
}

async function initSettings() {
  const s = await loadSettings();
  for (const f of fields) $<HTMLInputElement>(f).value = String(s[f]);
  const replay = $<HTMLInputElement>('replay');
  replay.checked = s.replay;
  const showInput = $<HTMLInputElement>('showInput');
  showInput.checked = s.showInput;
  const ownWindow = $<HTMLInputElement>('ownWindow');
  ownWindow.checked = s.ownWindow;
  syncPreset();
  const save = async () => {
    const next = { ...s } as Settings;
    for (const f of fields) {
      const v = $<HTMLInputElement>(f).value.trim();
      (next as any)[f] = f === 'maxSteps' ? Math.max(1, Number(v) || 40) : v;
    }
    next.replay = replay.checked;
    next.showInput = showInput.checked;
    next.ownWindow = ownWindow.checked;
    Object.assign(s, next);
    await saveSettings(next);
  };
  for (const f of fields) $(f).addEventListener('change', () => { syncPreset(); save(); });
  replay.addEventListener('change', save);
  showInput.addEventListener('change', save);
  ownWindow.addEventListener('change', save);
  preset.addEventListener('change', () => {
    if (!preset.value) return;
    $<HTMLInputElement>('baseUrl').value = preset.value;
    save();
  });
  if (!s.model || (!s.apiKey && needsApiKey(s.baseUrl))) $<HTMLDetailsElement>('settings').open = true;
}
initSettings();

// Saved runs
async function renderRuns() {
  const runs = await listRecordings();
  $('runs-count').textContent = String(runs.length);
  $('runs-list').replaceChildren(...runs.map((r) => {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'run';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${r.origin.replace(/^https?:\/\//, '')} · ${r.steps.length} steps · used ${r.uses}×`;
    info.append(r.task, meta);
    const del = document.createElement('button');
    del.className = 'secondary';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteRecording(r.key));
    li.append(info, del);
    return li;
  }));
}
$('clear-runs').addEventListener('click', () => deleteRecording(null));
chrome.storage.onChanged.addListener((changes) => {
  if (changes.recordings) renderRuns();
});
renderRuns();
