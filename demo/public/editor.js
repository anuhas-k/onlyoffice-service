// Editor page: ask the service for a signed config, load ONLYOFFICE's api.js, mount the editor.
const params = new URLSearchParams(location.search);
const fileId = params.get('id');
const user = params.get('user');

function fail(message) {
  const el = document.getElementById('error');
  el.textContent = message;
  el.hidden = false;
  document.getElementById('title').textContent = 'Could not open the file';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load the editor from ${new URL(src).origin} — is the Document Server running?`));
    document.head.append(s);
  });
}

async function open() {
  if (!fileId || !user) return fail('Missing file or user — open files from the list page.');
  const res = await fetch(`/files/${encodeURIComponent(fileId)}/sessions`, { method: 'POST', headers: { 'x-demo-user': user } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return fail(body?.error?.message ?? `HTTP ${res.status}`);
  document.getElementById('title').textContent = body.config.document.title;
  document.getElementById('who').textContent = `as ${body.config.editorConfig.user.name} · ${body.mode}`;
  await loadScript(`${body.documentServerUrl}/web-apps/apps/api/documents/api.js`);
  // eslint-disable-next-line no-undef -- DocsAPI is the global api.js defines
  new DocsAPI.DocEditor('editor', { ...body.config, width: '100%', height: '100%' });
}

open().catch((err) => fail(err.message));
