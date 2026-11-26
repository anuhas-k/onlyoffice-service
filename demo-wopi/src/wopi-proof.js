// WOPI proof-key validation (Microsoft "Proof keys" scenario; ONLYOFFICE publishes keys in /hosting/discovery).
// The Document Server signs  len(token) token len(URL) URL len(timestamp) timestamp  with RSA-SHA256.
// Byte order of the 4-byte lengths is not stated in prose by the spec; big-endian matches the reference
// implementations — which is why the app runs this in `log` mode by default until a live run confirms it.
import crypto from 'node:crypto';

export const PROOF_WINDOW_MS = 20 * 60_000;
const TICKS_AT_UNIX_EPOCH = 621355968000000000n; // .NET ticks (100 ns) at 1970-01-01
const TICKS_PER_MS = 10_000n;

export const ticksFromMs = (ms) => TICKS_AT_UNIX_EPOCH + BigInt(Math.trunc(ms)) * TICKS_PER_MS;
const msFromTicks = (ticks) => Number((ticks - TICKS_AT_UNIX_EPOCH) / TICKS_PER_MS);

const lengthPrefixed = (bytes) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(bytes.length);
  return Buffer.concat([len, bytes]);
};

export function buildProofInput(accessToken, url, timestampTicks) {
  const ts = Buffer.alloc(8);
  ts.writeBigInt64BE(BigInt(timestampTicks));
  return Buffer.concat([
    lengthPrefixed(Buffer.from(accessToken, 'utf8')),
    lengthPrefixed(Buffer.from(url.toUpperCase(), 'utf8')),
    lengthPrefixed(ts),
  ]);
}

const toKey = (modulus, exponent) =>
  crypto.createPublicKey({
    key: { kty: 'RSA', n: Buffer.from(modulus, 'base64').toString('base64url'), e: Buffer.from(exponent, 'base64').toString('base64url') },
    format: 'jwk',
  });

/** Reads the <proof-key> element of discovery XML. Returns {current, old} (old may be null) or null when absent. */
export function parseProofKeys(xml) {
  const tag = /<proof-key\s+((?:[^>"]|"[^"]*")*?)\/?>/.exec(xml);
  if (!tag) return null;
  const attrs = Object.fromEntries([...tag[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  try {
    if (!attrs.modulus || !attrs.exponent) return null;
    return {
      current: toKey(attrs.modulus, attrs.exponent),
      old: attrs.oldmodulus && attrs.oldexponent ? toKey(attrs.oldmodulus, attrs.oldexponent) : null,
    };
  } catch {
    return null;
  }
}

const verifies = (key, input, signature) => {
  if (!key || typeof signature !== 'string') return false;
  try {
    return crypto.verify('RSA-SHA256', input, key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
};

/** {ok:true} or {ok:false, reason: 'no-keys'|'missing-headers'|'stale-timestamp'|'bad-signature'}. */
export function verifyProof({ keys, accessToken, url, proof, proofOld, timestamp, now = Date.now() }) {
  if (!keys) return { ok: false, reason: 'no-keys' };
  if (typeof proof !== 'string' || typeof timestamp !== 'string') return { ok: false, reason: 'missing-headers' };
  let ticks;
  try {
    ticks = BigInt(timestamp);
  } catch {
    return { ok: false, reason: 'stale-timestamp' };
  }
  if (Math.abs(now - msFromTicks(ticks)) > PROOF_WINDOW_MS) return { ok: false, reason: 'stale-timestamp' };
  const input = buildProofInput(accessToken ?? '', url, ticks);
  const accepted = verifies(keys.current, input, proof) || verifies(keys.current, input, proofOld) || verifies(keys.old, input, proof);
  return accepted ? { ok: true } : { ok: false, reason: 'bad-signature' };
}
