// security-headers-ack: browser script, not a server — all five headers are set server-side in demo/src/server.js securityHeaders()
// File list page: pick a user, upload, see who is editing, open the editor, view history.
const POLL_MS = 3000;
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
    tr.append(cell(f.name), cell(f.editors.length ? f.editors.join(', ') : '—'), cell(String(f.versionCount)));
    const actions = document.createElement('td');
    const open = document.createElement('a');
    open.href = `/editor.html?id=${encodeURIComponent(f.id)}&user=${encodeURIComponent(userSelect.value)}`;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Open';
    const hist = document.createElement('button');
    hist.type = 'button';
    hist.textContent = 'History';
    hist.addEventListener('click', () => showHistory(f));
    actions.append(open, ' ', hist);
    tr.append(actions);
    tbody.append(tr);
  }
}

async function showHistory(file) {
  const { versions } = await api(`/files/${encodeURIComponent(file.id)}/versions`);
  document.getElementById('history').hidden = false;
  document.getElementById('history-name').textContent = file.name;
  document.getElementById('versions').replaceChildren(...versions.map((v) => {
    const li = document.createElement('li');
    const who = v.participants.length ? ` — ${v.participants.join(', ')}` : '';
    li.textContent = `${v.kind} · ${new Date(v.createdAt).toLocaleString()} · ${Math.ceil(v.size / 1024)} KB${who}`;
    return li;
  }));
}

async function refresh() {
  try {
    renderFiles((await api('/files')).files);
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

refresh();
setInterval(refresh, POLL_MS);
