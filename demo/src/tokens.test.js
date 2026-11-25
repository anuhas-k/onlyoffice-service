import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentKey, signDownloadToken, verifyDownloadToken } from './tokens.js';

const SECRET = 'test-secret-0123456789abcdef';

test('document key is deterministic, 20 chars, DS-safe charset', () => {
  const a = documentKey(SECRET, 'file-1', 'v1');
  assert.equal(a, documentKey(SECRET, 'file-1', 'v1'));
  assert.equal(a.length, 20);
  assert.match(a, /^[0-9A-Za-z_-]{20}$/);
});

test('document key differs per file and per version', () => {
  const keys = new Set();
  for (let f = 0; f < 50; f++) for (let v = 0; v < 20; v++) keys.add(documentKey(SECRET, `f${f}`, `v${v}`));
  assert.equal(keys.size, 1000);
});

test('download token round-trips for the bound file + version', () => {
  const t = signDownloadToken(SECRET, { fileId: 'A', versionId: 'v1' });
  assert.deepEqual(verifyDownloadToken(SECRET, t, 'A'), { fileId: 'A', versionId: 'v1' });
});

test('download token for file A is refused on file B', () => {
  const t = signDownloadToken(SECRET, { fileId: 'A', versionId: 'v1' });
  assert.equal(verifyDownloadToken(SECRET, t, 'B'), null);
});

test('expired download token is refused', () => {
  const t = signDownloadToken(SECRET, { fileId: 'A', versionId: 'v1' }, Date.now() - 6 * 60_000);
  assert.equal(verifyDownloadToken(SECRET, t, 'A'), null);
});

test('tampered download token is refused', () => {
  const t = signDownloadToken(SECRET, { fileId: 'A', versionId: 'v1' });
  for (let i = 0; i < t.length; i += 3) {
    const c = t[i] === 'A' ? 'B' : 'A';
    const bad = t.slice(0, i) + c + t.slice(i + 1);
    if (bad !== t) assert.equal(verifyDownloadToken(SECRET, bad, 'A'), null, `index ${i}`);
  }
  assert.equal(verifyDownloadToken(SECRET, 'garbage', 'A'), null);
  assert.equal(verifyDownloadToken(SECRET, undefined, 'A'), null);
});
