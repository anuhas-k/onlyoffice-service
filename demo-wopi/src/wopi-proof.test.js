import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildProofInput, parseProofKeys, verifyProof, ticksFromMs, PROOF_WINDOW_MS } from './wopi-proof.js';

const pair = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (b64url) => Buffer.from(b64url, 'base64url').toString('base64');
function keyAttrs(publicKey, prefix = '') {
  const jwk = publicKey.export({ format: 'jwk' });
  return `${prefix}modulus="${b64(jwk.n)}" ${prefix}exponent="${b64(jwk.e)}"`;
}
const sign = (privateKey, input) => crypto.sign('RSA-SHA256', input, privateKey).toString('base64');

const NOW = 1_800_000_000_000;
const URL = 'http://app:3000/wopi/files/abc?access_token=tok';

function request(privateKey, { token = 'tok', url = URL, ms = NOW } = {}) {
  const ts = ticksFromMs(ms);
  return { accessToken: token, url, timestamp: String(ts), proof: sign(privateKey, buildProofInput(token, url, ts)) };
}

test('buildProofInput: 4-byte big-endian length + token, length + UPPERCASE url, length + 8-byte timestamp', () => {
  const out = buildProofInput('ab', 'http://x/y', 5n);
  const expected = Buffer.concat([
    Buffer.from([0, 0, 0, 2]), Buffer.from('ab'),
    Buffer.from([0, 0, 0, 10]), Buffer.from('HTTP://X/Y'),
    Buffer.from([0, 0, 0, 8]), Buffer.from([0, 0, 0, 0, 0, 0, 0, 5]),
  ]);
  assert.deepEqual(out, expected);
});

test('ticksFromMs converts unix ms to .NET ticks', () => {
  assert.equal(ticksFromMs(0), 621355968000000000n);
  assert.equal(ticksFromMs(1000), 621355968000000000n + 10_000_000n);
});

test('parseProofKeys reads current and old keys from discovery XML, or null when absent', () => {
  const a = pair(); const b = pair();
  const xml = `<wopi-discovery><proof-key value="x" ${keyAttrs(a.publicKey)} oldvalue="y" ${keyAttrs(b.publicKey, 'old')}/></wopi-discovery>`;
  const keys = parseProofKeys(xml);
  assert.ok(keys.current && keys.old);
  assert.equal(parseProofKeys('<wopi-discovery></wopi-discovery>'), null);
});

test('a correctly signed request verifies with the current key', () => {
  const a = pair();
  const keys = parseProofKeys(`<proof-key ${keyAttrs(a.publicKey)}/>`);
  assert.deepEqual(verifyProof({ keys, ...request(a.privateKey), now: NOW }), { ok: true });
});

test('tampering with the url or token fails; so does a signature from another key', () => {
  const a = pair(); const other = pair();
  const keys = parseProofKeys(`<proof-key ${keyAttrs(a.publicKey)}/>`);
  const good = request(a.privateKey);
  assert.equal(verifyProof({ keys, ...good, url: URL + '&x=1', now: NOW }).reason, 'bad-signature');
  assert.equal(verifyProof({ keys, ...good, accessToken: 'other', now: NOW }).reason, 'bad-signature');
  assert.equal(verifyProof({ keys, ...request(other.privateKey), now: NOW }).reason, 'bad-signature');
});

test('a timestamp older than 20 minutes (or in the far future) is stale even with a valid signature', () => {
  const a = pair();
  const keys = parseProofKeys(`<proof-key ${keyAttrs(a.publicKey)}/>`);
  const old = request(a.privateKey, { ms: NOW - PROOF_WINDOW_MS - 1000 });
  assert.equal(verifyProof({ keys, ...old, now: NOW }).reason, 'stale-timestamp');
  const future = request(a.privateKey, { ms: NOW + PROOF_WINDOW_MS + 1000 });
  assert.equal(verifyProof({ keys, ...future, now: NOW }).reason, 'stale-timestamp');
  assert.equal(verifyProof({ keys, ...request(a.privateKey, { ms: NOW - PROOF_WINDOW_MS + 1000 }), now: NOW }).ok, true);
});

test('key rotation: X-WOPI-ProofOld with the current key, and X-WOPI-Proof with the old key, both verify', () => {
  const oldPair = pair(); const newPair = pair();
  const keys = parseProofKeys(`<proof-key ${keyAttrs(newPair.publicKey)} ${keyAttrs(oldPair.publicKey, 'old')}/>`);
  const ts = ticksFromMs(NOW);
  const input = buildProofInput('tok', URL, ts);
  const base = { keys, accessToken: 'tok', url: URL, timestamp: String(ts), now: NOW };
  assert.equal(verifyProof({ ...base, proof: 'garbage', proofOld: sign(newPair.privateKey, input) }).ok, true, 'ProofOld signed with the current key');
  assert.equal(verifyProof({ ...base, proof: sign(oldPair.privateKey, input) }).ok, true, 'Proof signed with the old key');
});

test('missing headers, a non-numeric timestamp and absent keys are reported distinctly', () => {
  const a = pair();
  const keys = parseProofKeys(`<proof-key ${keyAttrs(a.publicKey)}/>`);
  const good = request(a.privateKey);
  assert.equal(verifyProof({ keys, ...good, proof: undefined, now: NOW }).reason, 'missing-headers');
  assert.equal(verifyProof({ keys, ...good, timestamp: undefined, now: NOW }).reason, 'missing-headers');
  assert.equal(verifyProof({ keys, ...good, timestamp: 'abc', now: NOW }).reason, 'stale-timestamp');
  assert.equal(verifyProof({ keys: null, ...good, now: NOW }).reason, 'no-keys');
});
