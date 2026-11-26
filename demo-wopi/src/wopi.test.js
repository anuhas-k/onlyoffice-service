// WOPI host tests. The test plays the Document Server: it opens a session, then makes the same
// calls the Document Server made in the verification spike (CheckFileInfo, LOCK, GetFile, PutFile, UNLOCK).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from './server.js';

const DISCOVERY = `<?xml version="1.0" encoding="utf-8"?>
<wopi-discovery><net-zone name="external-http">
<app name="Word"><action name="edit" ext="docx" requires="locks,update" urlsrc="http://documentserver/hosting/wopi/word/edit?&lt;ui=UI_LLCC&amp;&gt;&lt;rs=DC_LLCC&amp;&gt;"/>
<action name="view" ext="docx" urlsrc="http://documentserver/hosting/wopi/word/view?"/></app>
<app name="Excel"><action name="edit" ext="xlsx" requires="locks,update" urlsrc="http://documentserver/hosting/wopi/cell/edit?"/></app>
<app name="PowerPoint"><action name="view" ext="pptx" urlsrc="http://documentserver/hosting/wopi/slide/view?"/></app>
</net-zone></wopi-discovery>`;

const DOCX = Buffer.from('PK\x03\x04original');
const EDITED = Buffer.from('PK\x03\x04edited-in-wopi');
let app, dataDir, discoveryHits = 0, discoveryStatus = 200;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wopi-'));
  const fetchImpl = async (url) => {
    assert.match(String(url), /\/hosting\/discovery$/);
    discoveryHits++;
    return new Response(discoveryStatus === 200 ? DISCOVERY : 'nope', { status: discoveryStatus, headers: { 'content-type': 'text/xml' } });
  };
  app = await buildApp({
    dataDir, dsJwtSecret: 'ds-secret-0123456789abcdef0123', appSecret: 'app-secret-0123456789abcdef0123',
    dsPublicUrl: 'http://localhost:8080', dsInternalUrl: 'http://documentserver', appInternalUrl: 'http://app:3000', appPublicUrl: 'http://localhost:3001',
    logger: false, fetchImpl,
  });
});
after(async () => { await app.close(); await fs.rm(dataDir, { recursive: true, force: true }); });

async function upload(name = 'report.docx', bytes = DOCX) {
  const boundary = 'b0undary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await app.inject({ method: 'POST', url: '/files', headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-demo-user': 'alice' }, payload: body });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().file;
}

const openWopi = (id, user) => app.inject({ method: 'POST', url: `/files/${id}/sessions?engine=wopi`, headers: { 'x-demo-user': user } });
const openOnlyoffice = (id, user) => app.inject({ method: 'POST', url: `/files/${id}/sessions`, headers: { 'x-demo-user': user } });
const tokenOf = (res) => res.json().formFields.access_token;
const wopi = (id, token, { method = 'GET', sub = '', headers = {}, payload } = {}) =>
  app.inject({ method, url: `/wopi/files/${id}${sub}?access_token=${encodeURIComponent(token)}`, headers, payload });
const lockOp = (id, token, override, lock, extra = {}) =>
  wopi(id, token, { method: 'POST', headers: { 'x-wopi-override': override, 'x-wopi-lock': lock, ...extra } });
const putFile = (id, token, bytes, lock) =>
  wopi(id, token, { method: 'POST', sub: '/contents', headers: { 'x-wopi-override': 'PUT', 'content-type': 'application/octet-stream', ...(lock === undefined ? {} : { 'x-wopi-lock': lock }) }, payload: bytes });
const versions = async (id) => (await app.inject({ method: 'GET', url: `/files/${id}/versions`, headers: { 'x-demo-user': 'alice' } })).json().versions;
const listed = async (id) => (await app.inject({ method: 'GET', url: '/files', headers: { 'x-demo-user': 'alice' } })).json().files.find((f) => f.id === id);

test('session: editor url comes from discovery, points at the browser-facing host, and carries WOPISrc + a token', async () => {
  const f = await upload();
  const res = await openWopi(f.id, 'alice');
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.engine, 'wopi');
  assert.equal(body.mode, 'edit');
  const url = new URL(body.editorUrl);
  assert.equal(url.origin, 'http://localhost:8080');
  assert.equal(url.pathname, '/hosting/wopi/word/edit');
  assert.equal(url.searchParams.get('wopisrc'), `http://app:3000/wopi/files/${f.id}`);
  assert.ok(!body.editorUrl.includes('UI_LLCC'), 'discovery placeholders are stripped');
  assert.ok(body.formFields.access_token);
  assert.ok(Number(body.formFields.access_token_ttl) > Date.now());
});

test('session: discovery is fetched once and cached', async () => {
  const f = await upload();
  const before = discoveryHits;
  await openWopi(f.id, 'alice');
  await openWopi(f.id, 'bob');
  assert.ok(discoveryHits - before <= 1);
});

test('session: a format with no WOPI action is refused with 400', async () => {
  const f = await upload('doc.pdf', Buffer.from('%PDF-1.7 x'));
  const res = await openWopi(f.id, 'alice');
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, 'UnsupportedForWopi');
});

test('session: requires a demo user and an existing file', async () => {
  const f = await upload();
  assert.equal((await app.inject({ method: 'POST', url: `/files/${f.id}/sessions?engine=wopi` })).statusCode, 401);
  assert.equal((await openWopi('00000000-0000-0000-0000-000000000000', 'alice')).statusCode, 404);
});

test('session: unknown engine value is a 400', async () => {
  const f = await upload();
  const res = await app.inject({ method: 'POST', url: `/files/${f.id}/sessions?engine=bogus`, headers: { 'x-demo-user': 'alice' } });
  assert.equal(res.statusCode, 400);
});

test('CheckFileInfo: returns identity, size, version and capability flags', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  const res = await wopi(f.id, token);
  assert.equal(res.statusCode, 200, res.body);
  const info = res.json();
  assert.equal(info.BaseFileName, 'report.docx');
  assert.equal(info.UserId, 'alice');
  assert.equal(info.UserFriendlyName, 'Alice');
  assert.equal(info.Size, DOCX.length);
  assert.equal(info.Version, (await versions(f.id))[0].id);
  assert.equal(info.UserCanWrite, true);
  assert.equal(info.SupportsLocks, true);
  assert.equal(info.SupportsUpdate, true);
  assert.equal(info.UserCanNotWriteRelative, true);
  assert.equal(info.DisablePrint, true);
  assert.equal(info.DisableExport, true);
});

test('auth: missing, forged, and other-file tokens are 401 on every operation', async () => {
  const a = await upload();
  const b = await upload();
  const tokenA = tokenOf(await openWopi(a.id, 'alice'));
  for (const token of ['', 'garbage', tokenA.slice(0, -2) + 'xx']) {
    assert.equal((await wopi(a.id, token)).statusCode, 401);
    assert.equal((await wopi(a.id, token, { sub: '/contents' })).statusCode, 401);
    assert.equal((await putFile(a.id, token, EDITED, 'L')).statusCode, 401);
    assert.equal((await lockOp(a.id, token, 'LOCK', 'L')).statusCode, 401);
  }
  assert.equal((await wopi(b.id, tokenA)).statusCode, 401, 'token bound to file A must not open file B');
  assert.equal((await wopi('00000000-0000-0000-0000-000000000000', tokenA)).statusCode, 401);
});

test('auth: the token may also arrive as a Bearer header', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  const res = await app.inject({ method: 'GET', url: `/wopi/files/${f.id}`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
});

test('GetFile: returns the head version bytes', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  const res = await wopi(f.id, token, { sub: '/contents' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.rawPayload, DOCX);
});

test('co-editing flow: lock, save, unlock → one checkpoint promoted to a milestone crediting both users', async () => {
  const f = await upload();
  const alice = tokenOf(await openWopi(f.id, 'alice'));
  const bob = tokenOf(await openWopi(f.id, 'bob'));
  assert.equal((await lockOp(f.id, alice, 'LOCK', 'ds-lock-1')).statusCode, 200);
  assert.equal((await lockOp(f.id, bob, 'LOCK', 'ds-lock-1')).statusCode, 200, 'same lock id from the second editor is a refresh, not a conflict');
  const put = await putFile(f.id, alice, EDITED, 'ds-lock-1');
  assert.equal(put.statusCode, 200, put.body);
  assert.ok(put.headers['x-wopi-itemversion']);
  let vs = await versions(f.id);
  assert.deepEqual(vs.map((v) => v.kind), ['checkpoint', 'initial']);
  assert.equal((await lockOp(f.id, alice, 'UNLOCK', 'ds-lock-1')).statusCode, 200);
  vs = await versions(f.id);
  assert.deepEqual(vs.map((v) => v.kind), ['milestone', 'initial']);
  assert.deepEqual([...vs[0].participants].sort(), ['alice', 'bob']);
  assert.deepEqual((await wopi(f.id, alice, { sub: '/contents' })).rawPayload, EDITED);
});

test('duplicate PutFile of identical bytes creates no extra version', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  await lockOp(f.id, token, 'LOCK', 'L1');
  await putFile(f.id, token, EDITED, 'L1');
  await putFile(f.id, token, EDITED, 'L1');
  assert.equal((await versions(f.id)).length, 2);
});

test('UNLOCK without any save adds no version and promotes nothing', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  await lockOp(f.id, token, 'LOCK', 'L1');
  assert.equal((await lockOp(f.id, token, 'UNLOCK', 'L1')).statusCode, 200);
  assert.deepEqual((await versions(f.id)).map((v) => v.kind), ['initial']);
});

test('a second editing session after UNLOCK starts a fresh epoch (own checkpoint, own milestone)', async () => {
  const f = await upload();
  const alice = tokenOf(await openWopi(f.id, 'alice'));
  await lockOp(f.id, alice, 'LOCK', 'L1');
  await putFile(f.id, alice, EDITED, 'L1');
  await lockOp(f.id, alice, 'UNLOCK', 'L1');
  const bob = tokenOf(await openWopi(f.id, 'bob'));
  await lockOp(f.id, bob, 'LOCK', 'L2');
  await putFile(f.id, bob, Buffer.from('PK\x03\x04second-round'), 'L2');
  await lockOp(f.id, bob, 'UNLOCK', 'L2');
  const vs = await versions(f.id);
  assert.deepEqual(vs.map((v) => v.kind), ['milestone', 'milestone', 'initial']);
  assert.deepEqual(vs[0].participants, ['bob'], 'the second epoch credits only its own editors');
});

test('PutFile with no lock held is 409 with an empty X-WOPI-Lock and creates nothing', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  const res = await putFile(f.id, token, EDITED);
  assert.equal(res.statusCode, 409);
  assert.equal(res.headers['x-wopi-lock'], '');
  assert.equal((await versions(f.id)).length, 1);
});

test('PutFile with the wrong lock is 409 and reports the current lock', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  await lockOp(f.id, token, 'LOCK', 'right');
  const res = await putFile(f.id, token, EDITED, 'wrong');
  assert.equal(res.statusCode, 409);
  assert.equal(res.headers['x-wopi-lock'], 'right');
  assert.equal((await versions(f.id)).length, 1);
});

test('PutFile rejects bytes that do not match the file type', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  await lockOp(f.id, token, 'LOCK', 'L1');
  const res = await putFile(f.id, token, Buffer.from('MZ not a docx'), 'L1');
  assert.equal(res.statusCode, 400);
  assert.equal((await versions(f.id)).length, 1);
});

test('PutFile without X-WOPI-Override: PUT is a 400', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  await lockOp(f.id, token, 'LOCK', 'L1');
  const res = await wopi(f.id, token, { method: 'POST', sub: '/contents', headers: { 'content-type': 'application/octet-stream', 'x-wopi-lock': 'L1' }, payload: EDITED });
  assert.equal(res.statusCode, 400);
});

test('LOCK conflict: another lock id is 409 with the holder in X-WOPI-Lock', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  await lockOp(f.id, token, 'LOCK', 'one');
  const res = await lockOp(f.id, token, 'LOCK', 'two');
  assert.equal(res.statusCode, 409);
  assert.equal(res.headers['x-wopi-lock'], 'one');
});

test('LOCK without an X-WOPI-Lock id is a 400', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  const res = await wopi(f.id, token, { method: 'POST', headers: { 'x-wopi-override': 'LOCK' } });
  assert.equal(res.statusCode, 400);
});

test('UNLOCK with the wrong id is 409 and keeps the lock; with no lock held it is 409 with an empty header', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  const none = await lockOp(f.id, token, 'UNLOCK', 'x');
  assert.equal(none.statusCode, 409);
  assert.equal(none.headers['x-wopi-lock'], '');
  await lockOp(f.id, token, 'LOCK', 'right');
  const wrong = await lockOp(f.id, token, 'UNLOCK', 'wrong');
  assert.equal(wrong.statusCode, 409);
  assert.equal(wrong.headers['x-wopi-lock'], 'right');
  assert.equal((await lockOp(f.id, token, 'GET_LOCK', '')).headers['x-wopi-lock'], 'right');
});

test('GET_LOCK, REFRESH_LOCK and UNLOCK_AND_RELOCK behave per the WOPI contract', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  assert.equal((await lockOp(f.id, token, 'GET_LOCK', '')).headers['x-wopi-lock'], '');
  await lockOp(f.id, token, 'LOCK', 'a');
  assert.equal((await lockOp(f.id, token, 'REFRESH_LOCK', 'a')).statusCode, 200);
  assert.equal((await lockOp(f.id, token, 'REFRESH_LOCK', 'b')).statusCode, 409);
  assert.equal((await lockOp(f.id, token, 'UNLOCK_AND_RELOCK', 'b', { 'x-wopi-oldlock': 'nope' })).statusCode, 409);
  assert.equal((await lockOp(f.id, token, 'UNLOCK_AND_RELOCK', 'b', { 'x-wopi-oldlock': 'a' })).statusCode, 200);
  assert.equal((await lockOp(f.id, token, 'GET_LOCK', '')).headers['x-wopi-lock'], 'b');
});

test('unsupported operations answer 501 and an unknown override is a 400', async () => {
  const f = await upload();
  const token = tokenOf(await openWopi(f.id, 'alice'));
  assert.equal((await lockOp(f.id, token, 'PUT_RELATIVE', '')).statusCode, 501);
  assert.equal((await lockOp(f.id, token, 'RENAME_FILE', '')).statusCode, 501);
  assert.equal((await wopi(f.id, token, { method: 'POST' })).statusCode, 400);
});

test('view-only: a pptx gets a view action, UserCanWrite false, and every write path is refused', async () => {
  const f = await upload('deck.pptx', Buffer.from('PK\x03\x04deck'));
  const res = await openWopi(f.id, 'alice');
  assert.equal(res.json().mode, 'view');
  assert.match(new URL(res.json().editorUrl).pathname, /\/slide\/view$/);
  const token = tokenOf(res);
  const info = (await wopi(f.id, token)).json();
  assert.equal(info.UserCanWrite, false);
  assert.equal(info.ReadOnly, true);
  assert.equal((await lockOp(f.id, token, 'LOCK', 'L')).statusCode, 401);
  assert.equal((await putFile(f.id, token, Buffer.from('PK\x03\x04hacked'), 'L')).statusCode, 401);
  assert.equal((await versions(f.id)).length, 1);
});

test('presence: the file list shows WOPI editors while open, and clears them on UNLOCK', async () => {
  const f = await upload();
  const alice = tokenOf(await openWopi(f.id, 'alice'));
  await openWopi(f.id, 'bob');
  await lockOp(f.id, alice, 'LOCK', 'L1');
  assert.deepEqual([...(await listed(f.id)).editors].sort(), ['alice', 'bob']);
  await lockOp(f.id, alice, 'UNLOCK', 'L1');
  assert.deepEqual((await listed(f.id)).editors, []);
});

test('engines exclude each other: a WOPI session blocks an ONLYOFFICE session, and the reverse', async () => {
  const a = await upload();
  const tokenA = tokenOf(await openWopi(a.id, 'alice'));
  await lockOp(a.id, tokenA, 'LOCK', 'L1');
  const blocked = await openOnlyoffice(a.id, 'bob');
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.json().error.code, 'EngineBusy');
  await lockOp(a.id, tokenA, 'UNLOCK', 'L1');
  assert.equal((await openOnlyoffice(a.id, 'bob')).statusCode, 200, 'free again after UNLOCK');

  const b = await upload();
  assert.equal((await openOnlyoffice(b.id, 'alice')).statusCode, 200);
  const res = await openWopi(b.id, 'bob');
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error.code, 'EngineBusy');
});

test('discovery outage is a 502, not a crash, and a later call recovers', async () => {
  const fresh = await buildApp({
    dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'wopi-d-')), dsJwtSecret: 'ds-secret-0123456789abcdef0123', appSecret: 'app-secret-0123456789abcdef0123',
    dsPublicUrl: 'http://localhost:8080', dsInternalUrl: 'http://documentserver', appInternalUrl: 'http://app:3000', appPublicUrl: 'http://localhost:3001', logger: false,
    fetchImpl: async () => { if (discoveryStatus !== 200) throw new Error('connect ECONNREFUSED'); return new Response(DISCOVERY, { status: 200 }); },
  });
  discoveryStatus = 503;
  try {
    const boundary = 'b';
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.docx"\r\n\r\n`), DOCX, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const up = await fresh.inject({ method: 'POST', url: '/files', headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-demo-user': 'alice' }, payload });
    const id = up.json().file.id;
    const down = await fresh.inject({ method: 'POST', url: `/files/${id}/sessions?engine=wopi`, headers: { 'x-demo-user': 'alice' } });
    assert.equal(down.statusCode, 502);
    assert.equal(down.json().error.code, 'WopiDiscoveryUnavailable');
    discoveryStatus = 200;
    const ok = await fresh.inject({ method: 'POST', url: `/files/${id}/sessions?engine=wopi`, headers: { 'x-demo-user': 'alice' } });
    assert.equal(ok.statusCode, 200);
  } finally {
    discoveryStatus = 200;
    await fresh.close();
  }
});

test('logs never contain the access token', async () => {
  const lines = [];
  const logged = await buildApp({
    dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'wopi-l-')), dsJwtSecret: 'ds-secret-0123456789abcdef0123', appSecret: 'app-secret-0123456789abcdef0123',
    dsPublicUrl: 'http://localhost:8080', dsInternalUrl: 'http://documentserver', appInternalUrl: 'http://app:3000', appPublicUrl: 'http://localhost:3001',
    fetchImpl: async () => new Response(DISCOVERY, { status: 200 }),
    logger: { level: 'info', stream: { write: (l) => lines.push(l) }, serializers: { req: (r) => ({ method: r.method, url: r.url.split('?')[0] }) } },
  });
  try {
    const boundary = 'b';
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.docx"\r\n\r\n`), DOCX, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const up = await logged.inject({ method: 'POST', url: '/files', headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-demo-user': 'alice' }, payload });
    const id = up.json().file.id;
    const token = (await logged.inject({ method: 'POST', url: `/files/${id}/sessions?engine=wopi`, headers: { 'x-demo-user': 'alice' } })).json().formFields.access_token;
    await logged.inject({ method: 'GET', url: `/wopi/files/${id}?access_token=${encodeURIComponent(token)}` });
    assert.ok(lines.length > 0);
    assert.ok(!lines.join('').includes(token), 'token leaked into logs');
  } finally {
    await logged.close();
  }
});
