import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStore } from './store.js';

async function freshStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-'));
  return { dir, store: await openStore(dir) };
}

test('createFile stores an initial version that reads back', async () => {
  const { store } = await freshStore();
  const f = await store.createFile({ name: 'a.docx', ext: 'docx', bytes: Buffer.from('one'), createdBy: 'alice' });
  assert.equal(f.versions.length, 1);
  assert.equal(f.versions[0].kind, 'initial');
  assert.equal((await store.readVersion(f.id, f.versions[0].id)).toString(), 'one');
});

test('same key + same content is stored once', async () => {
  const { store } = await freshStore();
  const f = await store.createFile({ name: 'a.docx', ext: 'docx', bytes: Buffer.from('one'), createdBy: 'alice' });
  const a = await store.addVersion(f.id, Buffer.from('two'), { kind: 'milestone', documentKey: 'K' });
  const b = await store.addVersion(f.id, Buffer.from('two'), { kind: 'milestone', documentKey: 'K' });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(store.get(f.id).versions.length, 2);
});

test('content identical to head creates no version', async () => {
  const { store } = await freshStore();
  const f = await store.createFile({ name: 'a.docx', ext: 'docx', bytes: Buffer.from('one'), createdBy: 'alice' });
  const r = await store.addVersion(f.id, Buffer.from('one'), { kind: 'milestone', documentKey: 'K2' });
  assert.equal(r.created, false);
  assert.equal(store.get(f.id).versions.length, 1);
});

test('metadata survives reopening the store', async () => {
  const { dir, store } = await freshStore();
  const f = await store.createFile({ name: 'a.docx', ext: 'docx', bytes: Buffer.from('one'), createdBy: 'alice' });
  const again = await openStore(dir);
  assert.equal(again.get(f.id).name, 'a.docx');
});

test('promote changes a version kind and survives a reopen', async () => {
  const { dir, store } = await freshStore();
  const f = await store.createFile({ name: 'a.docx', ext: 'docx', bytes: Buffer.from('one'), createdBy: 'alice' });
  const { version } = await store.addVersion(f.id, Buffer.from('two'), { kind: 'checkpoint', documentKey: 'K' });
  await store.promote(f.id, version.id, 'milestone');
  assert.equal(store.get(f.id).versions.at(-1).kind, 'milestone');
  const reopened = await openStore(dir);
  assert.equal(reopened.get(f.id).versions.at(-1).kind, 'milestone');
});

test('promote of an unknown version throws', async () => {
  const { store } = await freshStore();
  const f = await store.createFile({ name: 'a.docx', ext: 'docx', bytes: Buffer.from('one'), createdBy: 'alice' });
  await assert.rejects(() => store.promote(f.id, 'nope', 'milestone'), /unknown version/);
});
