import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signAccessToken, verifyAccessToken, ACCESS_TOKEN_TTL_MS } from './wopi-tokens.js';
import { signDownloadToken } from './tokens.js';

const SECRET = 'app-secret-0123456789abcdef0123';

test('round trip returns the bound claims', () => {
  const { token, expiresAt } = signAccessToken(SECRET, { fileId: 'f1', user: 'alice', canWrite: true }, 1000);
  assert.equal(expiresAt, 1000 + ACCESS_TOKEN_TTL_MS);
  assert.deepEqual(verifyAccessToken(SECRET, token, 'f1', 2000), { fileId: 'f1', user: 'alice', canWrite: true });
});

test('rejects a token for another file, an expired token, a wrong secret and garbage', () => {
  const { token } = signAccessToken(SECRET, { fileId: 'f1', user: 'alice', canWrite: true }, 1000);
  assert.equal(verifyAccessToken(SECRET, token, 'f2', 2000), null);
  assert.equal(verifyAccessToken(SECRET, token, 'f1', 1000 + ACCESS_TOKEN_TTL_MS + 1), null);
  assert.equal(verifyAccessToken('other-secret-0123456789abcdef01', token, 'f1', 2000), null);
  assert.equal(verifyAccessToken(SECRET, 'nope', 'f1'), null);
  assert.equal(verifyAccessToken(SECRET, undefined, 'f1'), null);
});

test('a download token is not accepted as a WOPI access token', () => {
  const download = signDownloadToken(SECRET, { fileId: 'f1', versionId: 'v1' });
  assert.equal(verifyAccessToken(SECRET, download, 'f1'), null);
});

test('canWrite is false unless explicitly true', () => {
  const { token } = signAccessToken(SECRET, { fileId: 'f1', user: 'bob', canWrite: false });
  assert.equal(verifyAccessToken(SECRET, token, 'f1').canWrite, false);
});
