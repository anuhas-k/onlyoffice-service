// Close detection, heartbeat, idle sweeper, proof keys and the spec-driven CheckFileInfo/lock rules.
// A fake Document Server answers discovery and /command; the test plays the DS's WOPI calls itself.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from './server.js';
import { buildProofInput, ticksFromMs } from './wopi-proof.js';

const DISCOVERY = (proofKey = '') => `<wopi-discovery><net-zone name="external-http">
<app name="Word"><action name="edit" ext="docx" requires="locks,update" urlsrc="http://documentserver/hosting/wopi/word/edit?"/></app>
</net-zone>${proofKey}</wopi-discovery>`;
const DOCX = Buffer.from('PK\x03\x04original');
const EDITED = Buffer.from('PK\x03\x04edited');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanups = [];
after(async () => { for (const fn of cleanups) await fn(); });

/** Build an app wired to a fake Document Server. `ds.commands` records every /command call in order. */
async function harness(options = {}) {
  const ds = { commands: [], reply: () => ({ error: 0 }), onCommand: null, proofKey: '' };
  const logLines = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname === '/hosting/discovery') return new Response(DISCOVERY(ds.proofKey), { status: 200 });
    if (u.pathname === '/command') {
      const body = JSON.parse(init.body);
      ds.commands.push({ c: body.c, key: body.key, users: body.users });
      if (ds.reply === 'down') throw new Error('ECONNREFUSED');
      await ds.onCommand?.(body);
      return new Response(JSON.stringify({ key: body.key, ...ds.reply(body) }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wopi-c-'));
  const app = await buildApp({
    dataDir, dsJwtSecret: 'ds-secret-0123456789abcdef0123', appSecret: 'app-secret-0123456789abcdef0123',
    dsPublicUrl: 'http://localhost:8080', dsInternalUrl: 'http://documentserver', appInternalUrl: 'http://app:3000',
    appPublicUrl: 'http://localhost:3001',
    leaveGraceMs: 0, closeWaitMs: 40, presenceTtlMs: 60_000, sweepMs: 0, autoCheckpointMs: 0,
    fetchImpl, logger: { level: 'info', stream: { write: (l) => logLines.push(l) }, serializers: { req: (r) => ({ method: r.method, url: r.url.split('?')[0] }) } }, // same req serializer as the app's loggerOptions()
    ...options,
  });
  cleanups.push(async () => { await app.close(); await fs.rm(dataDir, { recursive: true, force: true }); });

  const h = { app, ds, logLines };
  h.upload = async (name = 'a.docx', bytes = DOCX) => {
    const b = 'b0';
    const payload = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n\r\n`), bytes, Buffer.from(`\r\n--${b}--\r\n`)]);
    const res = await app.inject({ method: 'POST', url: '/files', headers: { 'content-type': `multipart/form-data; boundary=${b}`, 'x-demo-user': 'alice' }, payload });
    return res.json().file;
  };
  h.open = async (id, user) => (await app.inject({ method: 'POST', url: `/files/${id}/sessions?engine=wopi`, headers: { 'x-demo-user': user } })).json().formFields.access_token;
  h.call = (id, token, { method = 'GET', sub = '', headers = {}, payload } = {}) =>
    app.inject({ method, url: `/wopi/files/${id}${sub}?access_token=${encodeURIComponent(token)}`, headers, payload });
  h.lock = (id, token, op, lock, extra = {}) => h.call(id, token, { method: 'POST', headers: { 'x-wopi-override': op, 'x-wopi-lock': lock, ...extra } });
  h.put = (id, token, bytes, lock, extra = {}) =>
    h.call(id, token, { method: 'POST', sub: '/contents', headers: { 'x-wopi-override': 'PUT', 'content-type': 'application/octet-stream', 'x-wopi-lock': lock, ...extra }, payload: bytes });
  h.leave = (id, token) => app.inject({ method: 'POST', url: `/wopi-sessions/${id}/leave`, headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ access_token: token }) });
  h.heartbeat = (id, token) => app.inject({ method: 'POST', url: `/wopi-sessions/${id}/heartbeat`, headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ access_token: token }) });
  h.versions = async (id) => (await app.inject({ method: 'GET', url: `/files/${id}/versions`, headers: { 'x-demo-user': 'alice' } })).json().versions;
  h.editors = async (id) => (await app.inject({ method: 'GET', url: '/files', headers: { 'x-demo-user': 'alice' } })).json().files.find((f) => f.id === id).editors;
  return h;
}

/** Alice opens, DS locks and saves once. Returns ids/tokens. */
async function editedByAlice(h) {
  const f = await h.upload();
  const alice = await h.open(f.id, 'alice');
  await h.lock(f.id, alice, 'LOCK', 'L1');
  await h.put(f.id, alice, EDITED, 'L1');
  return { f, alice };
}

// ── close detection ──────────────────────────────────────────────────────────

test('leave by the last editor: force-save then drop are sent to the Document Server, and its UNLOCK yields the milestone', async () => {
  const h = await harness();
  const { f, alice } = await editedByAlice(h);
  h.ds.onCommand = async (body) => { if (body.c === 'drop') setTimeout(() => h.lock(f.id, alice, 'UNLOCK', 'L1'), 5); };
  const res = await h.leave(f.id, alice);
  assert.equal(res.statusCode, 202);
  await wait(150);
  assert.deepEqual(h.ds.commands.map((c) => c.c), ['forcesave', 'drop']);
  assert.equal(h.ds.commands[0].key, f.id, 'the document key is the WOPI file id');
  assert.ok(h.ds.commands[1].users.includes('alice'));
  assert.deepEqual((await h.versions(f.id)).map((v) => v.kind), ['milestone', 'initial']);
  assert.deepEqual(await h.editors(f.id), []);
});

test('leave with wait: the answer comes after the close finished, while the editor is still connected', async () => {
  const h = await harness({ leaveGraceMs: 60_000 }); // a grace period that would never fire in time proves wait skips it
  const { f, alice } = await editedByAlice(h);
  h.ds.onCommand = async (body) => { if (body.c === 'drop') setTimeout(() => h.lock(f.id, alice, 'UNLOCK', 'L1'), 5); };
  const res = await h.app.inject({ method: 'POST', url: `/wopi-sessions/${f.id}/leave`, headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ access_token: alice, wait: true }) });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(res.json(), { closed: true, forcesave: 0, drop: 0, milestone: true });
  assert.deepEqual(h.ds.commands.map((c) => c.c), ['forcesave', 'drop']);
  assert.deepEqual((await h.versions(f.id)).map((v) => v.kind), ['milestone', 'initial']);
});

test('leave with wait while another editor remains closes nothing and says so', async () => {
  const h = await harness();
  const { f, alice } = await editedByAlice(h);
  await h.open(f.id, 'bob');
  const res = await h.app.inject({ method: 'POST', url: `/wopi-sessions/${f.id}/leave`, headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ access_token: alice, wait: true }) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { closed: false });
  assert.deepEqual(h.ds.commands, []);
});

test('leave with wait when the Document Server is down answers 200 with the unreachable result instead of failing the page', async () => {
  const h = await harness();
  const { f, alice } = await editedByAlice(h);
  h.ds.reply = 'down';
  const res = await h.app.inject({ method: 'POST', url: `/wopi-sessions/${f.id}/leave`, headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ access_token: alice, wait: true }) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().forcesave, 'unreachable');
});

test('the default grace period is 1 second: nothing is sent at once, the close starts right after', async () => {
  const h = await harness({ leaveGraceMs: undefined }); // undefined → the built-in default
  const { f, alice } = await editedByAlice(h);
  await h.leave(f.id, alice);
  await wait(500);
  assert.deepEqual(h.ds.commands, [], 'still inside the grace period at 0.5 s');
  await wait(900);
  assert.deepEqual(h.ds.commands.map((c) => c.c).slice(0, 2), ['forcesave', 'drop'], 'closed shortly after 1 s');
});

test('leave when the Document Server never sends UNLOCK: the last save is still promoted to a milestone', async () => {
  const h = await harness({ closeWaitMs: 40 });
  const { f, alice } = await editedByAlice(h);
  await h.leave(f.id, alice);
  await wait(200);
  assert.deepEqual((await h.versions(f.id)).map((v) => v.kind), ['milestone', 'initial']);
  assert.deepEqual(await h.editors(f.id), []);
});

test('leave while another editor remains sends nothing and keeps the other editor listed', async () => {
  const h = await harness();
  const { f, alice } = await editedByAlice(h);
  await h.open(f.id, 'bob');
  await h.leave(f.id, alice);
  await wait(100);
  assert.deepEqual(h.ds.commands, []);
  assert.deepEqual(await h.editors(f.id), ['bob']);
});

test('reopening within the grace period cancels the close (a page reload is not a close)', async () => {
  const h = await harness({ leaveGraceMs: 120 });
  const { f, alice } = await editedByAlice(h);
  await h.leave(f.id, alice);
  await wait(30);
  await h.open(f.id, 'alice');
  await wait(250);
  assert.deepEqual(h.ds.commands, []);
  assert.deepEqual(await h.editors(f.id), ['alice']);
});

test('leave authentication: bad token, other-file token and an empty body are 401 and send nothing', async () => {
  const h = await harness();
  const a = await h.upload();
  const b = await h.upload();
  const tokenA = await h.open(a.id, 'alice');
  assert.equal((await h.leave(a.id, 'garbage')).statusCode, 401);
  assert.equal((await h.leave(b.id, tokenA)).statusCode, 401);
  assert.equal((await h.app.inject({ method: 'POST', url: `/wopi-sessions/${a.id}/leave` })).statusCode, 401);
  assert.equal((await h.heartbeat(a.id, 'garbage')).statusCode, 401);
  await wait(50);
  assert.deepEqual(h.ds.commands, []);
});

test('a Document Server outage during close does not crash and does not lose the checkpoint', async () => {
  const h = await harness();
  const { f, alice } = await editedByAlice(h);
  h.ds.reply = 'down';
  assert.equal((await h.leave(f.id, alice)).statusCode, 202);
  await wait(200);
  assert.ok(h.ds.commands.length >= 1);
  assert.ok((await h.versions(f.id)).some((v) => v.kind === 'milestone' || v.kind === 'checkpoint'));
  assert.ok(h.logLines.join('').includes('close'), 'the failure is logged');
});

// ── manual end (recovery) ────────────────────────────────────────────────────

test('POST /files/:id/wopi/end closes a stuck session and reports the Document Server answers', async () => {
  const h = await harness();
  const { f } = await editedByAlice(h);
  const res = await h.app.inject({ method: 'POST', url: `/files/${f.id}/wopi/end`, headers: { 'x-demo-user': 'bob' } });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(res.json(), { closed: true, forcesave: 0, drop: 0, milestone: true });
  assert.deepEqual(h.ds.commands.map((c) => c.c), ['forcesave', 'drop']);
});

test('end: needs a demo user, 404 for unknown file, closed:false when nothing is open, 502 when the Document Server is down', async () => {
  const h = await harness();
  const f = await h.upload();
  assert.equal((await h.app.inject({ method: 'POST', url: `/files/${f.id}/wopi/end` })).statusCode, 401);
  assert.equal((await h.app.inject({ method: 'POST', url: '/files/00000000-0000-0000-0000-000000000000/wopi/end', headers: { 'x-demo-user': 'alice' } })).statusCode, 404);
  const idle = await h.app.inject({ method: 'POST', url: `/files/${f.id}/wopi/end`, headers: { 'x-demo-user': 'alice' } });
  assert.deepEqual(idle.json(), { closed: false });
  const { f: busy } = await editedByAlice(h);
  h.ds.reply = 'down';
  const down = await h.app.inject({ method: 'POST', url: `/files/${busy.id}/wopi/end`, headers: { 'x-demo-user': 'alice' } });
  assert.equal(down.statusCode, 502);
  assert.equal(down.json().error.code, 'DocumentServerUnavailable');
});

test('a DS answer of "no changes" (4) or "key not found" (1) is a normal result, not a failure', async () => {
  const h = await harness();
  const { f } = await editedByAlice(h);
  h.ds.reply = (body) => ({ error: body.c === 'forcesave' ? 4 : 1 });
  const res = await h.app.inject({ method: 'POST', url: `/files/${f.id}/wopi/end`, headers: { 'x-demo-user': 'alice' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().forcesave, 4);
  assert.equal(res.json().drop, 1);
});

// ── heartbeat + sweeper ──────────────────────────────────────────────────────

test('heartbeat keeps an editor listed past the presence TTL; without it the editor expires', async () => {
  const h = await harness({ presenceTtlMs: 120 });
  const f = await h.upload();
  const alice = await h.open(f.id, 'alice');
  await h.open(f.id, 'bob'); // never heartbeats
  for (let i = 0; i < 4; i++) { await wait(50); assert.equal((await h.heartbeat(f.id, alice)).statusCode, 204); }
  assert.deepEqual(await h.editors(f.id), ['alice']);
});

test('sweeper: an editor that stopped heartbeating triggers force-save + drop after the presence TTL', async () => {
  const h = await harness({ presenceTtlMs: 60, sweepMs: 25 });
  const { f } = await editedByAlice(h);
  await wait(350);
  assert.deepEqual(h.ds.commands.map((c) => c.c).slice(0, 2), ['forcesave', 'drop']);
  assert.deepEqual((await h.versions(f.id)).map((v) => v.kind), ['milestone', 'initial']);
});

test('sweeper leaves a file alone while a heartbeat keeps its editor alive', async () => {
  const h = await harness({ presenceTtlMs: 100, sweepMs: 20 });
  const { f, alice } = await editedByAlice(h);
  for (let i = 0; i < 8; i++) { await wait(30); await h.heartbeat(f.id, alice); }
  assert.deepEqual(h.ds.commands, []);
});

// ── auto-checkpoint (Save does not reach the host on this Document Server) ──

test('auto-checkpoint: a heartbeat while the file is locked sends a force-save, throttled to one per interval', async () => {
  const h = await harness({ autoCheckpointMs: 100 });
  const f = await h.upload();
  const alice = await h.open(f.id, 'alice');
  await h.lock(f.id, alice, 'LOCK', 'L1');
  await h.heartbeat(f.id, alice);
  await h.heartbeat(f.id, alice); // inside the interval: no second command
  await wait(30);
  assert.deepEqual(h.ds.commands.map((c) => c.c), ['forcesave']);
  assert.equal(h.ds.commands[0].key, f.id);
  await wait(120);
  await h.heartbeat(f.id, alice);
  await wait(30);
  assert.deepEqual(h.ds.commands.map((c) => c.c), ['forcesave', 'forcesave']);
});

test('auto-checkpoint: the saved bytes arrive as a checkpoint (and "no changes" answers are harmless)', async () => {
  const h = await harness({ autoCheckpointMs: 50 });
  const f = await h.upload();
  const alice = await h.open(f.id, 'alice');
  await h.lock(f.id, alice, 'LOCK', 'L1');
  h.ds.onCommand = async (body) => { if (body.c === 'forcesave') setTimeout(() => h.put(f.id, alice, EDITED, 'L1'), 5); };
  assert.equal((await h.heartbeat(f.id, alice)).statusCode, 204);
  await wait(80);
  assert.deepEqual((await h.versions(f.id)).map((v) => v.kind), ['checkpoint', 'initial']);
  h.ds.onCommand = null;
  h.ds.reply = () => ({ error: 4 });
  await wait(60);
  assert.equal((await h.heartbeat(f.id, alice)).statusCode, 204);
  await wait(30);
  assert.equal((await h.versions(f.id)).length, 2, 'error 4 (no changes) creates nothing');
});

test('auto-checkpoint: nothing is sent before the Document Server has locked the file, while closing, or when disabled', async () => {
  const h = await harness({ autoCheckpointMs: 20 });
  const f = await h.upload();
  const alice = await h.open(f.id, 'alice');
  await h.heartbeat(f.id, alice); // no LOCK yet: the editor is still loading
  await wait(40);
  assert.deepEqual(h.ds.commands, []);
  const off = await harness({ autoCheckpointMs: 0 });
  const g = await off.upload();
  const bob = await off.open(g.id, 'bob');
  await off.lock(g.id, bob, 'LOCK', 'L1');
  await off.heartbeat(g.id, bob);
  await wait(40);
  assert.deepEqual(off.ds.commands, []);
});

test('auto-checkpoint: a Document Server outage never fails the heartbeat', async () => {
  const h = await harness({ autoCheckpointMs: 10 });
  const f = await h.upload();
  const alice = await h.open(f.id, 'alice');
  await h.lock(f.id, alice, 'LOCK', 'L1');
  h.ds.reply = 'down';
  assert.equal((await h.heartbeat(f.id, alice)).statusCode, 204);
  await wait(40);
  assert.ok(h.logLines.join('').includes('auto-checkpoint: Document Server command failed'));
});

// ── CheckFileInfo + lock rules from the specs ────────────────────────────────

test('CheckFileInfo carries the close-signalling and capability properties the specs define', async () => {
  const h = await harness();
  const f = await h.upload('Budget.docx');
  const token = await h.open(f.id, 'alice');
  const info = (await h.call(f.id, token)).json();
  assert.equal(info.PostMessageOrigin, 'http://localhost:3001');
  assert.equal(info.ClosePostMessage, true);
  assert.equal(info.CloseUrl, 'http://localhost:3001/');
  assert.equal(info.SupportsExtendedLockLength, true);
  assert.equal(info.IsAnonymousUser, false);
  assert.equal(info.UserCanRename, false);
  assert.equal(info.SupportsRename, false);
  assert.equal(info.FileExtension, '.docx');
  assert.equal(info.BreadcrumbDocName, 'Budget.docx');
  assert.match(info.UserId, /^[A-Za-z0-9]+$/, 'UserId must be alphanumeric');
});

test('lock ids: 1024 ASCII characters are accepted, 1025 is a 400', async () => {
  const h = await harness();
  const f = await h.upload();
  const token = await h.open(f.id, 'alice');
  assert.equal((await h.lock(f.id, token, 'LOCK', 'x'.repeat(1025))).statusCode, 400);
  assert.equal((await h.lock(f.id, token, 'LOCK', 'x'.repeat(1024))).statusCode, 200);
});

test('X-WOPI-Editors credits only the users who contributed to that save; absent header credits everyone who joined', async () => {
  const h = await harness();
  const f = await h.upload();
  const alice = await h.open(f.id, 'alice');
  await h.open(f.id, 'bob');
  await h.lock(f.id, alice, 'LOCK', 'L1');
  await h.put(f.id, alice, EDITED, 'L1', { 'x-wopi-editors': 'alice' });
  assert.deepEqual((await h.versions(f.id))[0].participants, ['alice']);
  await h.put(f.id, alice, Buffer.from('PK\x03\x04more'), 'L1');
  assert.deepEqual([...(await h.versions(f.id))[0].participants].sort(), ['alice', 'bob']);
});

// ── proof keys ───────────────────────────────────────────────────────────────

function proofKeyXml(publicKey) {
  const jwk = publicKey.export({ format: 'jwk' });
  const b64 = (v) => Buffer.from(v, 'base64url').toString('base64');
  return `<proof-key modulus="${b64(jwk.n)}" exponent="${b64(jwk.e)}"/>`;
}
const proofHeaders = (privateKey, token, url, ms = Date.now()) => {
  const ts = ticksFromMs(ms);
  return { 'x-wopi-timestamp': String(ts), 'x-wopi-proof': crypto.sign('RSA-SHA256', buildProofInput(token, url, ts), privateKey).toString('base64') };
};
const checkUrl = (id, token) => `/wopi/files/${id}?access_token=${encodeURIComponent(token)}`;

test('proof enforce: valid signature passes; missing, forged and stale proofs are 500 per the spec; no keys fails closed', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const h = await harness({ wopiProof: 'enforce' });
  h.ds.proofKey = proofKeyXml(publicKey);
  const f = await h.upload();
  const token = await h.open(f.id, 'alice');
  const url = checkUrl(f.id, token);
  const get = (headers) => h.app.inject({ method: 'GET', url, headers });
  assert.equal((await get(proofHeaders(privateKey, token, `http://app:3000${url}`))).statusCode, 200);
  assert.equal((await get({})).statusCode, 500);
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.equal((await get(proofHeaders(other.privateKey, token, `http://app:3000${url}`))).statusCode, 500);
  assert.equal((await get(proofHeaders(privateKey, token, `http://app:3000${url}`, Date.now() - 25 * 60_000))).statusCode, 500);
  assert.equal((await get(proofHeaders(privateKey, token, 'http://app:3000/wopi/files/other?access_token=x'))).statusCode, 500);
  h.ds.proofKey = '';
  const h2 = await harness({ wopiProof: 'enforce' });
  const f2 = await h2.upload();
  const t2 = await h2.open(f2.id, 'alice');
  assert.equal((await h2.call(f2.id, t2)).statusCode, 500, 'enforce with no published keys must not let calls through');
});

test('proof log (the default): a bad proof is reported in the log but the call succeeds; the token is never logged', async () => {
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const h = await harness({ wopiProof: 'log' });
  h.ds.proofKey = proofKeyXml(publicKey);
  const f = await h.upload();
  const token = await h.open(f.id, 'alice');
  assert.equal((await h.call(f.id, token)).statusCode, 200);
  const logs = h.logLines.join('');
  assert.match(logs, /wopi proof/);
  assert.match(logs, /missing-headers/);
  assert.ok(!logs.includes(token));
});

test('proof off: nothing is checked and nothing is logged about proofs', async () => {
  const h = await harness({ wopiProof: 'off' });
  const f = await h.upload();
  const token = await h.open(f.id, 'alice');
  assert.equal((await h.call(f.id, token)).statusCode, 200);
  assert.ok(!h.logLines.join('').includes('wopi proof'));
});
