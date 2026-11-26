// WOPI access tokens (HMAC-SHA256): bound to one file + one user + a write flag, with an expiry.
// Domain-separated from the download tokens in tokens.js so one kind can never be replayed as the other.
import crypto from 'node:crypto';

// The Document Server keeps one token for the whole editing session, so this outlives the 5-minute download link.
// shortcut: no token renewal while an editor stays open past the TTL, demo only — add a refresh path before real use.
export const ACCESS_TOKEN_TTL_MS = 60 * 60_000;

const mac = (secret, body) => crypto.createHmac('sha256', secret).update(`wopi-access:${body}`).digest('base64url');

export function signAccessToken(secret, { fileId, user, canWrite }, now = Date.now()) {
  const expiresAt = now + ACCESS_TOKEN_TTL_MS;
  const body = Buffer.from(JSON.stringify({ f: fileId, u: user, w: Boolean(canWrite), e: expiresAt })).toString('base64url');
  return { token: `${body}.${mac(secret, body)}`, expiresAt };
}

/** Returns {fileId, user, canWrite} when valid, unexpired and bound to expectedFileId; otherwise null. */
export function verifyAccessToken(secret, token, expectedFileId, now = Date.now()) {
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
    return null;
  }
  if (typeof claims?.e !== 'number' || claims.e < now) return null;
  if (claims.f !== expectedFileId || typeof claims.u !== 'string') return null;
  return { fileId: claims.f, user: claims.u, canWrite: claims.w === true };
}
