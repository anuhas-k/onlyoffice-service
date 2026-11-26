// GET /files/:id/versions/:versionId/diff — the endpoint behind "View changes". Protocol-agnostic: it only reads stored versions.
// Versions are created through the WOPI flow (the same saves the Document Server makes).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from './server.js';
import { makeDocx } from './make-docx.js';

const DISCOVERY = `<wopi-discovery><net-zone name="external-http"><app name="Word"><action name="edit" ext="docx" urlsrc="http://documentserver/hosting/wopi/word/edit?"/></app></net-zone></wopi-discovery>`;
let app, dataDir;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vdiff-'));
  app = await buildApp({
    dataDir, dsJwtSecret: 'ds-secret-0123456789abcdef0123', appSecret: 'app-secret-0123456789abcdef0123',
    dsPublicUrl: 'http://localhost:8080', dsInternalUrl: 'http://documentserver', appInternalUrl: 'http://app:3000', appPublicUrl: 'http://localhost:3001',
    sweepMs: 0, autoCheckpointMs: 0, logger: false,
    fetchImpl: async () => new Response(DISCOVERY, { status: 200 }),
  });
});
after(async () => { await app.close(); await fs.rm(dataDir, { recursive: true, force: true }); });

async function upload(name, bytes) {
  const b = 'b0';
  const payload = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n\r\n`), bytes, Buffer.from(`\r\n--${b}--\r\n`)]);
  const res = await app.inject({ method: 'POST', url: '/files', headers: { 'content-type': `multipart/form-data; boundary=${b}`, 'x-demo-user': 'alice' }, payload });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().file;
}

/** Upload the first revision, then save each later revision through WOPI. Returns {file, versions oldest→newest}. */
async function documentWithRevisions(...revisions) {
  const file = await upload('contract.docx', makeDocx(revisions[0]));
  const open = await app.inject({ method: 'POST', url: `/files/${file.id}/sessions?engine=wopi`, headers: { 'x-demo-user': 'alice' } });
  const token = encodeURIComponent(open.json().formFields.access_token);
  await app.inject({ method: 'POST', url: `/wopi/files/${file.id}?access_token=${token}`, headers: { 'x-wopi-override': 'LOCK', 'x-wopi-lock': 'L' } });
  for (const paragraphs of revisions.slice(1)) {
    const res = await app.inject({ method: 'POST', url: `/wopi/files/${file.id}/contents?access_token=${token}`, headers: { 'x-wopi-override': 'PUT', 'x-wopi-lock': 'L', 'content-type': 'application/octet-stream' }, payload: makeDocx(paragraphs) });
    assert.equal(res.statusCode, 200, res.body);
  }
  const versions = (await app.inject({ method: 'GET', url: `/files/${file.id}/versions`, headers: { 'x-demo-user': 'alice' } })).json().versions.reverse();
  return { file, versions };
}

const diff = (fileId, versionId, query = '', user = 'alice') =>
  app.inject({ method: 'GET', url: `/files/${fileId}/versions/${versionId}/diff${query}`, headers: user ? { 'x-demo-user': user } : {} });

const V0 = ['Intro', 'Price is 10 dollars', 'Closing'];
const V1 = ['Intro', 'Price is 20 dollars', 'Closing', 'Appendix'];
const V2 = ['Intro', 'Price is 25 dollars', 'Closing', 'Appendix'];

test('by default a version is compared with the one before it', async () => {
  const { file, versions } = await documentWithRevisions(V0, V1, V2);
  const res = await diff(file.id, versions[2].id);
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.from.id, versions[1].id);
  assert.equal(body.to.id, versions[2].id);
  assert.equal(body.to.kind, 'checkpoint');
  assert.deepEqual(body.stats, { added: 1, removed: 1, unchanged: 3 });
  const del = body.lines.find((l) => l.type === 'del');
  const add = body.lines.find((l) => l.type === 'add');
  assert.equal(del.text, 'Price is 20 dollars');
  assert.equal(add.text, 'Price is 25 dollars');
  assert.deepEqual(del.segments.filter((s) => s.changed).map((s) => s.text), ['20']);
  assert.deepEqual(add.segments.filter((s) => s.changed).map((s) => s.text), ['25']);
});

test('?against= compares with any earlier version of the same file', async () => {
  const { file, versions } = await documentWithRevisions(V0, V1, V2);
  const body = (await diff(file.id, versions[2].id, `?against=${versions[0].id}`)).json();
  assert.equal(body.from.id, versions[0].id);
  assert.deepEqual(body.stats, { added: 2, removed: 1, unchanged: 2 });
});

test('the initial version has nothing before it: every paragraph is an addition and from is null', async () => {
  const { file, versions } = await documentWithRevisions(V0, V1);
  const body = (await diff(file.id, versions[0].id)).json();
  assert.equal(body.from, null);
  assert.deepEqual(body.stats, { added: 3, removed: 0, unchanged: 0 });
});

test('a milestone label does not change the comparison (it is just another stored snapshot)', async () => {
  const { file, versions } = await documentWithRevisions(V0, V1);
  assert.equal((await diff(file.id, versions[1].id)).statusCode, 200);
});

test('authentication and lookups: no user is 401; unknown file or version is 404; another file\'s version is 404', async () => {
  const a = await documentWithRevisions(V0, V1);
  const b = await documentWithRevisions(V0, V2);
  assert.equal((await diff(a.file.id, a.versions[1].id, '', null)).statusCode, 401);
  assert.equal((await diff('00000000-0000-0000-0000-000000000000', a.versions[1].id)).statusCode, 404);
  assert.equal((await diff(a.file.id, 'nope')).statusCode, 404);
  assert.equal((await diff(a.file.id, a.versions[1].id, `?against=${b.versions[0].id}`)).statusCode, 404);
  assert.equal((await diff(a.file.id, a.versions[1].id, '?against=nope')).statusCode, 404);
});

test('against must be a single value', async () => {
  const { file, versions } = await documentWithRevisions(V0, V1);
  const res = await diff(file.id, versions[1].id, `?against=${versions[0].id}&against=${versions[0].id}`);
  assert.equal(res.statusCode, 400);
});

test('comparing a version with itself or with a newer one is refused', async () => {
  const { file, versions } = await documentWithRevisions(V0, V1, V2);
  assert.equal((await diff(file.id, versions[1].id, `?against=${versions[1].id}`)).statusCode, 400);
  assert.equal((await diff(file.id, versions[0].id, `?against=${versions[2].id}`)).statusCode, 400);
});

test('only .docx is supported; other types answer 415 with a clear code', async () => {
  const f = await upload('deck.pptx', Buffer.from('PK\x03\x04deck'));
  const versions = (await app.inject({ method: 'GET', url: `/files/${f.id}/versions`, headers: { 'x-demo-user': 'alice' } })).json().versions;
  const res = await diff(f.id, versions[0].id);
  assert.equal(res.statusCode, 415);
  assert.equal(res.json().error.code, 'DiffUnsupported');
});

test('a .docx that is not a readable zip answers 422, not 500', async () => {
  const f = await upload('broken.docx', Buffer.from('PK\x03\x04this is not really a zip'));
  const versions = (await app.inject({ method: 'GET', url: `/files/${f.id}/versions`, headers: { 'x-demo-user': 'alice' } })).json().versions;
  const res = await diff(f.id, versions[0].id);
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, 'DocxUnreadable');
});

test('two huge unrelated versions answer 422 DiffTooLarge instead of exhausting memory', async () => {
  const many = (prefix) => Array.from({ length: 3000 }, (_, i) => `${prefix} paragraph ${i}`);
  const { file, versions } = await documentWithRevisions(many('old'), many('new'));
  const res = await diff(file.id, versions[1].id);
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, 'DiffTooLarge');
});

test('the response carries paragraph text only: no storage paths, hashes or document bytes', async () => {
  const { file, versions } = await documentWithRevisions(V0, V1);
  const raw = (await diff(file.id, versions[1].id)).body;
  assert.ok(!raw.includes(dataDir));
  assert.ok(!raw.includes('sha256'));
});
