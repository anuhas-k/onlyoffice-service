import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SignJWT } from 'jose';
import { buildApp } from './server.js';

const DS_SECRET = 'ds-secret-0123456789abcdef0123';
let dsServer, dsUrl, app, dataDir, savedBytes = Buffer.from('PK\x03\x04edited-content');
let dsHits = 0;

before(async () => {
  // fake Document Server: serves the "edited" file
  dsServer = http.createServer((req, res) => { dsHits++; res.end(savedBytes); });
  await new Promise((r) => dsServer.listen(0, '127.0.0.1', r));
  dsUrl = `http://127.0.0.1:${dsServer.address().port}`;
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'demo-'));
  app = await buildApp({
    dataDir, dsJwtSecret: DS_SECRET, appSecret: 'app-secret-0123456789abcdef0123',
    dsPublicUrl: 'http://localhost:8080', dsInternalUrl: dsUrl, appInternalUrl: 'http://app:3000',
    logger: false,
  });
});
after(async () => { await app.close(); dsServer.close(); await fs.rm(dataDir, { recursive: true, force: true }); });

const sign = (payload, secret = DS_SECRET) =>
  new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().sign(new TextEncoder().encode(secret));

async function upload(name = 'report.docx', bytes = Buffer.from('PK\x03\x04original')) {
  const boundary = 'b0undary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await app.inject({ method: 'POST', url: '/files', headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-demo-user': 'alice' }, payload: body });
  return res;
}

async function openSession(id, user) {
  const res = await app.inject({ method: 'POST', url: `/files/${id}/sessions`, headers: { 'x-demo-user': user } });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

async function callback(body, { secret = DS_SECRET, inHeader = true } = {}) {
  const token = await sign(inHeader ? { payload: body } : body, secret);
  const payload = inHeader ? body : { ...body, token };
  return app.inject({ method: 'POST', url: '/onlyoffice/callback', headers: inHeader ? { authorization: `Bearer ${token}` } : {}, payload });
}

async function versions(id) {
  return (await app.inject({ method: 'GET', url: `/files/${id}/versions`, headers: { 'x-demo-user': 'alice' } })).json().versions;
}

test('upload rejects unsupported formats', async () => {
  const res = await upload('tool.exe', Buffer.from('MZ'));
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, 'UnsupportedFormat');
});

test('second user joins the same session key', async () => {
  const f = (await upload()).json().file;
  const a = await openSession(f.id, 'alice');
  const b = await openSession(f.id, 'bob');
  assert.equal(a.config.document.key, b.config.document.key);
  assert.equal(a.config.editorConfig.coEditing.mode, 'fast');
  assert.equal(a.config.document.permissions.download, false);
  assert.ok(a.config.token);
});

test('forged callback is rejected and creates nothing', async () => {
  const f = (await upload()).json().file;
  const s = await openSession(f.id, 'alice');
  const res = await callback({ key: s.config.document.key, status: 2, url: `${dsUrl}/x.docx`, users: ['alice'] }, { secret: 'wrong-secret-0123456789abcdef012' });
  assert.equal(res.statusCode, 401);
  assert.equal((await versions(f.id)).length, 1);
});

test('unknown key is rejected', async () => {
  const res = await callback({ key: 'never-issued-key-123', status: 2, url: `${dsUrl}/x.docx` });
  assert.equal(res.statusCode, 404);
});

test('download url on a foreign host is rejected without contacting it', async () => {
  const f = (await upload()).json().file;
  const s = await openSession(f.id, 'alice');
  const before = dsHits;
  const res = await callback({ key: s.config.document.key, status: 2, url: 'http://evil.example/x.docx', users: ['alice'] });
  assert.equal(res.statusCode, 400);
  assert.equal(dsHits, before);
  assert.equal((await versions(f.id)).length, 1);
});

test('status 6 makes a checkpoint and keeps the key; status 2 makes one milestone, replay is a no-op, key rotates', async () => {
  const f = (await upload()).json().file;
  const s = await openSession(f.id, 'alice');
  await openSession(f.id, 'bob');
  const key = s.config.document.key;

  savedBytes = Buffer.from('PK\x03\x04checkpoint-content');
  let res = await callback({ key, status: 6, url: `http://localhost:8080/cache/files/x.docx`, users: ['alice', 'bob'] });
  assert.deepEqual(res.json(), { error: 0 });
  assert.equal((await openSession(f.id, 'carol')).config.document.key, key, 'force-save keeps the key');

  savedBytes = Buffer.from('PK\x03\x04final-content');
  const body = { key, status: 2, url: `http://localhost:8080/cache/files/y.docx`, users: ['alice', 'bob'] };
  res = await callback(body, { inHeader: false });
  assert.deepEqual(res.json(), { error: 0 });
  res = await callback(body);
  assert.deepEqual(res.json(), { error: 0 }, 'replay acknowledged');

  const v = await versions(f.id);
  assert.deepEqual(v.map((x) => x.kind), ['milestone', 'checkpoint', 'initial']);
  assert.deepEqual(v[0].participants.sort(), ['alice', 'bob', 'carol'], 'carol joined the session too');

  const reopened = await openSession(f.id, 'alice');
  assert.notEqual(reopened.config.document.key, key, 'new key after milestone');
  const t = new URL(reopened.config.document.url).searchParams.get('t');
  const content = await app.inject({ method: 'GET', url: `/files/${f.id}/content?t=${encodeURIComponent(t)}` });
  assert.equal(content.statusCode, 200);
  assert.equal(content.body, 'PK\x03\x04final-content');
});

test('milestone lists everyone who joined the session, not only the last editor ONLYOFFICE reports', async () => {
  const f = (await upload()).json().file;
  const s = await openSession(f.id, 'alice');
  await openSession(f.id, 'bob');
  const key = s.config.document.key;
  await callback({ key, status: 1, users: ['alice', 'bob'] });
  await callback({ key, status: 1, users: ['bob'] }); // alice closed her window first
  savedBytes = Buffer.from('PK\x03\x04both-edited');
  await callback({ key, status: 2, url: `${dsUrl}/w.docx`, users: ['bob'] });
  assert.deepEqual((await versions(f.id))[0].participants.sort(), ['alice', 'bob']);
});

test('save failure answers 500 so the Document Server retries', async () => {
  const f = (await upload()).json().file;
  const s = await openSession(f.id, 'alice');
  const prev = savedBytes;
  dsServer.removeAllListeners('request');
  dsServer.on('request', (req, res) => { res.statusCode = 500; res.end(); });
  const res = await callback({ key: s.config.document.key, status: 2, url: `${dsUrl}/z.docx`, users: ['alice'] });
  assert.equal(res.statusCode, 500);
  assert.equal((await versions(f.id)).length, 1);
  dsServer.removeAllListeners('request');
  dsServer.on('request', (req, res) => { dsHits++; res.end(savedBytes); });
  savedBytes = prev;
});

test('content with a bad token returns 401', async () => {
  const f = (await upload()).json().file;
  const res = await app.inject({ method: 'GET', url: `/files/${f.id}/content?t=nope` });
  assert.equal(res.statusCode, 401);
});
