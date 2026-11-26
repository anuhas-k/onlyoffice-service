// GET /formats, POST /samples/:ext, the temporary conversion-source URL, and upload validation across the registry.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from './server.js';
import { FORMAT_LIST } from './formats.js';
import { extractParagraphs } from './docx-text.js';

const DISCOVERY = `<wopi-discovery><net-zone name="external-http">
<app name="Word"><action name="edit" ext="docx" urlsrc="http://documentserver/hosting/wopi/word/edit?"/><action name="view" ext="docx" urlsrc="http://documentserver/hosting/wopi/word/view?"/><action name="view" ext="doc" urlsrc="http://documentserver/hosting/wopi/word/view?"/><action name="view" ext="xml" urlsrc="http://documentserver/hosting/wopi/word/view?"/></app>
<app name="Excel"><action name="view" ext="xml" urlsrc="http://documentserver/hosting/wopi/cell/view?"/></app>
</net-zone></wopi-discovery>`;
const CONVERTED = Buffer.from('PK\x03\x04converted-odt');
let app, dataDir;
const ds = { converterCalls: [], sourceStatus: null, convertReply: null, down: false, resultBytes: CONVERTED, discoveryDown: false };

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'samples-'));
  const fetchImpl = async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname === '/hosting/discovery') return ds.discoveryDown ? new Response('x', { status: 503 }) : new Response(DISCOVERY, { status: 200 });
    if (u.pathname === '/converter') {
      if (ds.down) throw new Error('ECONNREFUSED');
      const body = JSON.parse(init.body);
      ds.converterCalls.push(body);
      const src = new URL(body.url); // play the Document Server: fetch the source from the app
      const got = await app.inject({ method: 'GET', url: src.pathname + src.search });
      ds.sourceStatus = got.statusCode;
      ds.sourceHead = got.rawPayload.subarray(0, 2).toString('latin1');
      return new Response(JSON.stringify(ds.convertReply ?? { endConvert: true, fileUrl: `http://localhost:8080/cache/files/out.${body.outputtype}` }), { status: 200 });
    }
    if (u.pathname.startsWith('/cache/files/')) return new Response(ds.resultBytes, { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  };
  app = await buildApp({
    dataDir, dsJwtSecret: 'ds-secret-0123456789abcdef0123', appSecret: 'app-secret-0123456789abcdef0123',
    dsPublicUrl: 'http://localhost:8080', dsInternalUrl: 'http://documentserver', appInternalUrl: 'http://app:3000', appPublicUrl: 'http://localhost:3001',
    sweepMs: 0, autoCheckpointMs: 0, logger: false, fetchImpl,
  });
});
after(async () => { await app.close(); await fs.rm(dataDir, { recursive: true, force: true }); });

const alice = { 'x-demo-user': 'alice' };
const sample = (ext, headers = alice) => app.inject({ method: 'POST', url: `/samples/${ext}`, headers });
const formats = () => app.inject({ method: 'GET', url: '/formats' });

async function upload(name, bytes) {
  const b = 'b0';
  const payload = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n\r\n`), bytes, Buffer.from(`\r\n--${b}--\r\n`)]);
  return app.inject({ method: 'POST', url: '/files', headers: { 'content-type': `multipart/form-data; boundary=${b}`, ...alice }, payload });
}

test('GET /formats lists every registry format with its mode, kind and sample availability', async () => {
  const res = await formats();
  assert.equal(res.statusCode, 200);
  const { formats: list, dsReachable } = res.json();
  assert.equal(list.length, FORMAT_LIST.length);
  assert.equal(dsReachable, true);
  const by = Object.fromEntries(list.map((f) => [f.ext, f]));
  assert.deepEqual([by.docx.mode, by.docx.kind, by.docx.sample], ['edit', 'word', 'direct']);
  assert.deepEqual([by.odt.mode, by.odt.sample], ['edit', 'convert']);
  assert.deepEqual([by.pptx.mode, by.pptx.kind, by.pptx.sample], ['edit', 'slide', 'convert']);
  assert.deepEqual([by.doc.mode, by.doc.sample], ['view', null]);
  assert.equal(by.csv.sample, 'direct');
  assert.ok(list.every((f) => typeof f.label === 'string' && f.label.length > 0));
});

test('GET /formats annotates each format with what the Document Server offers; unknown to it is an empty list', async () => {
  const { formats: list } = (await formats()).json();
  const by = Object.fromEntries(list.map((f) => [f.ext, f]));
  assert.deepEqual([...by.docx.dsActions].sort(), ['edit', 'view']);
  assert.deepEqual(by.doc.dsActions, ['view']);
  assert.deepEqual(by.xlsx.dsActions, [], 'not in this fake discovery');
});

test('GET /formats still answers when the Document Server is down: dsReachable false, dsActions null', async () => {
  ds.discoveryDown = true;
  try {
    const res = (await formats()).json();
    assert.equal(res.dsReachable, false);
    assert.ok(res.formats.every((f) => f.dsActions === null));
  } finally { ds.discoveryDown = false; }
});

test('POST /samples/docx creates a readable Word file for the demo user', async () => {
  const res = await sample('docx');
  assert.equal(res.statusCode, 201, res.body);
  const file = res.json().file;
  assert.equal(file.name, 'sample.docx');
  assert.equal(file.ext, 'docx');
  const versions = (await app.inject({ method: 'GET', url: `/files/${file.id}/versions`, headers: alice })).json().versions;
  assert.equal(versions.length, 1);
  assert.equal(versions[0].kind, 'initial');
  assert.ok(extractParagraphs(await readVersion(file.id, versions[0].id)).join(' ').includes('Sample'));
});

async function readVersion(fileId, versionId) {
  return fs.readFile(path.join(dataDir, 'blobs', fileId, versionId));
}

test('a text sample (csv) needs no Document Server', async () => {
  ds.converterCalls.length = 0;
  const res = await sample('csv');
  assert.equal(res.statusCode, 201);
  assert.equal(ds.converterCalls.length, 0);
});

test('a converted sample (odt) asks the Document Server to convert a docx, serving the source from a signed URL', async () => {
  ds.converterCalls.length = 0;
  const res = await sample('odt');
  assert.equal(res.statusCode, 201, res.body);
  const call = ds.converterCalls[0];
  assert.equal(call.filetype, 'docx');
  assert.equal(call.outputtype, 'odt');
  assert.match(call.url, /^http:\/\/app:3000\/sample-src\//);
  assert.equal(ds.sourceStatus, 200, 'the Document Server could fetch the source');
  assert.equal(ds.sourceHead, 'PK');
  const stored = await readVersion(res.json().file.id, (await app.inject({ method: 'GET', url: `/files/${res.json().file.id}/versions`, headers: alice })).json().versions[0].id);
  assert.deepEqual(stored, CONVERTED);
});

test('the temporary source is gone after the conversion, and a wrong token never serves it', async () => {
  ds.converterCalls.length = 0;
  await sample('ods');
  const src = new URL(ds.converterCalls[0].url);
  assert.equal((await app.inject({ method: 'GET', url: src.pathname + src.search })).statusCode, 404, 'scratch entry removed');
  assert.equal((await app.inject({ method: 'GET', url: src.pathname + '?t=garbage' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: src.pathname })).statusCode, 401);
});

test('a conversion that returns the wrong kind of bytes is refused and creates no file', async () => {
  const before = (await app.inject({ method: 'GET', url: '/files', headers: alice })).json().files.length;
  ds.resultBytes = Buffer.from('<html>error page</html>');
  try {
    const res = await sample('pptx');
    assert.equal(res.statusCode, 502);
    assert.equal(res.json().error.code, 'SampleInvalid');
  } finally { ds.resultBytes = CONVERTED; }
  assert.equal((await app.inject({ method: 'GET', url: '/files', headers: alice })).json().files.length, before);
});

test('a conversion error or an unreachable converter is a 502 ConversionFailed', async () => {
  ds.convertReply = { error: -3 };
  try { assert.equal((await sample('potx')).json().error.code, 'ConversionFailed'); } finally { ds.convertReply = null; }
  ds.down = true;
  try { assert.equal((await sample('docm')).statusCode, 502); } finally { ds.down = false; }
});

test('sample lookups: no user 401, unknown format 404, a format with no sample 404 NoSample', async () => {
  assert.equal((await sample('docx', {})).statusCode, 401);
  assert.equal((await sample('exe')).statusCode, 404);
  assert.equal((await sample('constructor')).statusCode, 404);
  const none = await sample('doc');
  assert.equal(none.statusCode, 404);
  assert.equal(none.json().error.code, 'NoSample');
});

test('every format with a sample is either direct or convertible from a direct source', async () => {
  const { formats: list } = (await formats()).json();
  for (const f of list.filter((x) => x.sample)) assert.ok(['direct', 'convert'].includes(f.sample), f.ext);
});

// ── upload validation across the registry ──────────────────────────────────

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
test('upload accepts every registry format whose bytes match, including legacy binaries and text', async () => {
  for (const [name, bytes] of [['a.rtf', Buffer.from('{\\rtf1 hi}')], ['b.csv', Buffer.from('a,b\n1,2')], ['c.xls', OLE], ['d.ppt', OLE], ['e.odt', Buffer.from('PK\x03\x04x')], ['f.djvu', Buffer.from('AT&TFORM....')], ['g.wps', Buffer.from('anything')], ['h.TXT', Buffer.from('upper-case extension')]]) {
    assert.equal((await upload(name, bytes)).statusCode, 201, name);
  }
});

test('upload rejects a mismatching signature, an unknown extension, and a name with no extension', async () => {
  for (const [name, bytes] of [['fake.xls', Buffer.from('PK\x03\x04zip pretending to be xls')], ['fake.docx', OLE], ['tool.exe', Buffer.from('MZ')], ['noext', Buffer.from('hello')], ['binary.txt', Buffer.from([0x68, 0, 0x69])]]) {
    const res = await upload(name, bytes);
    assert.equal(res.statusCode, 400, name);
    assert.equal(res.json().error.code, 'UnsupportedFormat', name);
  }
});

test('a request with an unsupported content type is a 415, not a 500 (client errors stay client errors)', async () => {
  const res = await app.inject({ method: 'POST', url: '/samples/docx', headers: { ...alice, 'content-type': 'application/x-www-form-urlencoded' }, payload: 'a=1' });
  assert.equal(res.statusCode, 415);
  assert.equal(res.json().error.code, 'UnsupportedMediaType');
});

test('malformed JSON in a request body is a 400, not a 500', async () => {
  const res = await app.inject({ method: 'POST', url: '/wopi-sessions/abc/leave', headers: { 'content-type': 'application/json' }, payload: '{not json' });
  assert.equal(res.statusCode, 400);
});

test('a format the Document Server lists under two editors opens in the one the registry names (xml → spreadsheet), for WOPI too', async () => {
  const f = (await sample('xml')).json().file;
  const res = await app.inject({ method: 'POST', url: `/files/${f.id}/sessions?engine=wopi`, headers: alice });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(new URL(res.json().editorUrl).pathname, '/hosting/wopi/cell/view');
});
