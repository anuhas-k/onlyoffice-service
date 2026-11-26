// Document Server command service client (https://api.onlyoffice.com — "Command service").
// This is the channel where DS_JWT_SECRET is used on the WOPI path: the app → Document Server direction.
import { SignJWT } from 'jose';

const COMMAND_TIMEOUT_MS = 10_000;

/** Error codes the command service documents in its `error` field. */
export const DS_ERROR = { NONE: 0, KEY_MISSING: 1, CALLBACK_URL: 2, INTERNAL: 3, NO_CHANGES: 4, BAD_COMMAND: 5, BAD_TOKEN: 6 };

export class DsCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DsCommandError';
  }
}

export function createDsCommand({ dsInternalUrl, dsJwtSecret, fetchImpl = fetch }) {
  const secret = new TextEncoder().encode(dsJwtSecret);
  /** Resolves with the parsed reply (callers inspect `error`); rejects only on transport / HTTP failure. */
  return async function send(command, key, extra = {}) {
    const body = { c: command, key, ...extra };
    const token = await new SignJWT({ ...body }).setProtectedHeader({ alg: 'HS256' }).sign(secret);
    let res;
    try {
      res = await fetchImpl(new URL('/command', dsInternalUrl), {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, token }),
        signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
      });
    } catch (err) {
      throw new DsCommandError(`Document Server command ${command} failed: ${err.name}`);
    }
    if (!res.ok) throw new DsCommandError(`Document Server command ${command} answered HTTP ${res.status}`);
    return res.json();
  };
}
