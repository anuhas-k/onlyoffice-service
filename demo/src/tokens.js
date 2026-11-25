// Document keys and download tokens (HMAC-SHA256). See ADR-001 D3 and D1.
import crypto from 'node:crypto';

const KEY_LENGTH = 20;
const TOKEN_TTL_MS = 5 * 60_000;

export function documentKey(secret, fileId, versionId) {
  return crypto.createHmac('sha256', secret).update(`${fileId}:${versionId}`).digest('base64url').slice(0, KEY_LENGTH);
}

function mac(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

export function signDownloadToken(secret, { fileId, versionId }, issuedAt = Date.now()) {
  const body = Buffer.from(JSON.stringify({ f: fileId, v: versionId, e: issuedAt + TOKEN_TTL_MS })).toString('base64url');
  return `${body}.${mac(secret, body)}`;
}

/** Returns {fileId, versionId} when the token is valid, unexpired and bound to expectedFileId; otherwise null. */
export function verifyDownloadToken(secret, token, expectedFileId) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = Buffer.from(mac(secret, body));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null; // undecodable body: same answer as a bad signature
  }
  if (typeof claims?.e !== 'number' || claims.e < Date.now()) return null;
  if (claims.f !== expectedFileId) return null;
  return { fileId: claims.f, versionId: claims.v };
}
