// Editor page: ask the service for a signed config, load ONLYOFFICE's api.js, mount the editor.
const params = new URLSearchParams(location.search);
const fileId = params.get('id');
const user = params.get('user');
const CLOSE_WAIT_MS = 15_000; // a bit more than the backend's wait for the Document Server
const engine = params.get('engine') === 'wopi' ? 'wopi' : 'onlyoffice';

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
  const res = await fetch(`/files/${encodeURIComponent(fileId)}/sessions?engine=${engine}`, { method: 'POST', headers: { 'x-demo-user': user } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return fail(body?.error?.message ?? `HTTP ${res.status}`);
  if (body.engine === 'wopi') return mountWopi(body);
  document.getElementById('title').textContent = body.config.document.title;
  document.getElementById('who').textContent = `as ${body.config.editorConfig.user.name} · ${body.mode} · ONLYOFFICE`;
  await loadScript(`${body.documentServerUrl}/web-apps/apps/api/documents/api.js`);
  // eslint-disable-next-line no-undef -- DocsAPI is the global api.js defines
  new DocsAPI.DocEditor('editor', { ...body.config, width: '100%', height: '100%' });
}

// WOPI: no api.js — the host page POSTs the access token into an iframe pointed at the Document Server's WOPI editor.
// The WOPI editor never tells the host it was closed by itself, so this page does (see src/wopi.js "closing a session"):
//   • UI_Close postMessage (the editor's own Close button; enabled by CheckFileInfo ClosePostMessage + PostMessageOrigin)
//   • pagehide beacon (tab or window closed, reload)
//   • a heartbeat, so the backend's sweeper can tell a crashed tab from an open one
function mountWopi(body) {
  document.getElementById('title').textContent = body.title;
  document.getElementById('who').textContent = `as ${body.user.name} · ${body.mode} · WOPI`;
  const dsOrigin = new URL(body.editorUrl).origin;
  const frame = document.createElement('iframe');
  frame.name = 'wopi-frame';
  frame.title = 'Document editor';
  frame.className = 'wopi-frame';
  frame.allow = 'clipboard-read; clipboard-write';
  document.getElementById('editor').replaceChildren(frame);
  const form = document.createElement('form');
  form.method = 'post';
  form.action = body.editorUrl;
  form.target = frame.name;
  form.hidden = true;
  for (const [name, value] of Object.entries(body.formFields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
  wireWopiLifecycle(body, frame, dsOrigin);
}

function wireWopiLifecycle(body, frame, dsOrigin) {
  const base = `/wopi-sessions/${encodeURIComponent(body.fileId)}`;
  const payload = JSON.stringify({ access_token: body.formFields.access_token });
  let left = false;
  const heartbeat = setInterval(() => {
    fetch(`${base}/heartbeat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => { /* next beat retries; the sweeper only acts after the presence TTL */ });
  }, body.heartbeatMs);

  function leave() {
    if (left) return;
    left = true;
    clearInterval(heartbeat);
    // sendBeacon survives page unload; a Blob with a JSON type makes the body parse as JSON server-side.
    navigator.sendBeacon(`${base}/leave`, new Blob([payload], { type: 'application/json' }));
  }

  // The editor's Close button: the tab is still connected, so ask the backend to end the session and wait for it
  // BEFORE navigating away — the Document Server only ends a session for users that are still connected.
  async function closeAndWait() {
    if (left) return;
    left = true;
    clearInterval(heartbeat);
    try {
      await fetch(`${base}/leave`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ access_token: body.formFields.access_token, wait: true }), signal: AbortSignal.timeout(CLOSE_WAIT_MS) });
    } catch { /* the sweeper is the backstop; do not trap the user on this page */ }
    window.location.assign('/');
  }

  frame.addEventListener('load', () => {
    // Host_PostmessageReady: the editor ignores host messages until it has seen this.
    frame.contentWindow.postMessage(JSON.stringify({ MessageId: 'Host_PostmessageReady', SendTime: Date.now(), Values: {} }), dsOrigin);
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== dsOrigin || event.source !== frame.contentWindow) return; // only our editor frame
    let message = event.data;
    if (typeof message === 'string') {
      try { message = JSON.parse(message); } catch { return; /* not a WOPI message */ }
    }
    if (message?.MessageId === 'UI_Close') closeAndWait();
  });
  window.addEventListener('pagehide', leave);
}

open().catch((err) => fail(err.message));
