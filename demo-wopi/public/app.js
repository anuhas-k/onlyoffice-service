// security-headers-ack: browser script, not a server — all five headers are set server-side in demo/src/server.js securityHeaders()
// File list page: pick a user, upload, see who is editing, open the editor, view history.
import { groupVersions } from './history-groups.js';
import { renderDiff, showDiffError, hideDiff } from './diff-view.js';
import { renderFormats, acceptList } from './formats-view.js';

const POLL_MS = 3000;
const HISTORY_POLL_MS = 1000; // faster while a history panel is open, so a new version shows up soon after the save
const userSelect = document.getElementById('user');
const savedUser = (() => { try { return sessionStorage.getItem('demo-user'); } catch { return null; } })();
if (savedUser) userSelect.value = savedUser;
userSelect.addEventListener('change', () => {
  try { sessionStorage.setItem('demo-user', userSelect.value); } catch { /* storage blocked: selection still works on this page */ }
  refresh();
});

const api = (url, init = {}) =>
  fetch(url, { ...init, headers: { ...(init.headers ?? {}), 'x-demo-user': userSelect.value } }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    return body;
  });

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

let modeByExt = new Map(); // ext → 'edit' | 'view', from GET /formats

function renderFiles(files) {
  const tbody = document.getElementById('files');
  tbody.replaceChildren();
  if (files.length === 0) {
    const tr = document.createElement('tr');
    const td = cell('No files yet — upload a .docx to start.', 'muted');
    td.colSpan = 4;
    tr.append(td);
    tbody.append(tr);
    return;
  }
  for (const f of files) {
    const tr = document.createElement('tr');
    tr.append(cell(`${f.name}${modeByExt.get(f.ext) === 'view' ? '  (view only)' : ''}`), cell(f.editors.length ? f.editors.join(', ') : '—'), cell(String(f.versionCount)));
    const actions = document.createElement('td');
    const open = document.createElement('a');
    open.href = `/editor.html?id=${encodeURIComponent(f.id)}&user=${encodeURIComponent(userSelect.value)}`;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Open';
    const openWopi = open.cloneNode();
    openWopi.href = `${open.href}&engine=wopi`;
    openWopi.textContent = 'Open (WOPI)';
    const hist = document.createElement('button');
    hist.type = 'button';
    hist.textContent = 'History';
    hist.addEventListener('click', () => showHistory(f));
    actions.append(open, ' ', openWopi, ' ', hist);
    tr.append(actions);
    tbody.append(tr);
  }
}

// History panel: checkpoints are collapsed under the milestone that closed them (ADR-001), and the panel follows the
// same poll as the file list, so a checkpoint saved while it is open shows up without clicking History again.
let historyFile = null; // the file whose history is open
const canDiff = () => historyFile?.ext === 'docx'; // the server only diffs .docx
let renderedHistory = '';

function describe(v) {
  const who = v.participants.length ? ` — ${v.participants.join(', ')}` : '';
  return `${v.kind} · ${new Date(v.createdAt).toLocaleString()} · ${Math.ceil(v.size / 1024)} KB${who}`;
}

function changesButton(version) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'View changes';
  button.addEventListener('click', () => showDiff(version));
  return button;
}

async function showDiff(version) {
  try {
    renderDiff(await api(`/files/${encodeURIComponent(historyFile.id)}/versions/${encodeURIComponent(version.id)}/diff`));
  } catch (err) {
    showDiffError(`Could not show the changes: ${err.message}`);
  }
}

function renderGroup(group, openKeys) {
  const li = document.createElement('li');
  li.textContent = group.head ? describe(group.head) : 'in progress (not closed yet)';
  if (group.head && canDiff()) li.append(changesButton(group.head));
  if (group.checkpoints.length > 0) {
    const details = document.createElement('details');
    const key = group.head?.id ?? 'in-progress';
    details.dataset.key = key;
    details.open = group.inProgress ? !openKeys.has(`closed:${key}`) : openKeys.has(key);
    const summary = document.createElement('summary');
    summary.textContent = `${group.checkpoints.length} checkpoint${group.checkpoints.length === 1 ? '' : 's'}`;
    const list = document.createElement('ul');
    list.replaceChildren(...group.checkpoints.map((c) => {
      const item = document.createElement('li');
      item.textContent = describe(c);
      if (canDiff()) item.append(changesButton(c));
      return item;
    }));
    details.append(summary, list);
    li.append(details);
  }
  return li;
}

async function refreshHistory() {
  if (!historyFile) return;
  const { versions } = await api(`/files/${encodeURIComponent(historyFile.id)}/versions`);
  document.getElementById('history').hidden = false;
  document.getElementById('history-name').textContent = historyFile.name;
  const fingerprint = versions.map((v) => `${v.id}:${v.kind}`).join('|');
  if (fingerprint === renderedHistory) return; // nothing new: leave the DOM (and any open details) alone
  renderedHistory = fingerprint;
  const openKeys = new Set();
  for (const d of document.querySelectorAll('#versions details')) {
    if (d.open) openKeys.add(d.dataset.key);
    else openKeys.add(`closed:${d.dataset.key}`);
  }
  document.getElementById('versions').replaceChildren(...groupVersions(versions).map((g) => renderGroup(g, openKeys)));
}

function showHistory(file) {
  historyFile = file;
  hideDiff();
  renderedHistory = '';
  return refreshHistory();
}

async function refresh() {
  try {
    renderFiles((await api('/files')).files);
    await refreshHistory();
  } catch (err) {
    document.getElementById('upload-status').textContent = `Could not load files: ${err.message}`;
  }
}

document.getElementById('upload').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('file');
  const status = document.getElementById('upload-status');
  if (!input.files[0]) return;
  const form = new FormData();
  form.append('file', input.files[0]);
  status.textContent = 'Uploading…';
  try {
    await api('/files', { method: 'POST', body: form });
    status.textContent = 'Uploaded.';
    input.value = '';
    refresh();
  } catch (err) {
    status.textContent = `Upload failed: ${err.message}`;
  }
});

// self-scheduling poll: the delay depends on whether a history panel is open
async function pollLoop() {
  await refresh();
  setTimeout(pollLoop, historyFile ? HISTORY_POLL_MS : POLL_MS);
}
pollLoop();

document.getElementById('diff-close').addEventListener('click', hideDiff);

// "Supported file types" card + the upload picker's accept list
async function loadFormats() {
  const status = document.getElementById('formats-summary');
  try {
    const data = await api('/formats');
    modeByExt = new Map(data.formats.map((f) => [f.ext, f.mode]));
    document.getElementById('file').accept = acceptList(data);
    renderFormats(data, async (format) => {
      status.textContent = `Creating a .${format.ext} sample…`;
      try {
        await api(`/samples/${encodeURIComponent(format.ext)}`, { method: 'POST' });
        status.textContent = `Created sample.${format.ext} — it is in the Files list below.`;
        refresh();
      } catch (err) {
        status.textContent = `Could not create the .${format.ext} sample: ${err.message}`;
      }
    });
  } catch (err) {
    status.textContent = `Could not load the supported types: ${err.message}`;
  }
}
loadFormats();
