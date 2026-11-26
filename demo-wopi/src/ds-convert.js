// Document Server conversion service client (POST /converter): turns one stored file into another format.
// Used to build sample files for formats we cannot reasonably hand-write (docx → odt, odp → pptx, ...).
import { SignJWT } from 'jose';

const MAX_RESULT_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_POLLS = 20;

export class ConvertError extends Error {
  /** @param {'Unreachable'|'Failed'|'Timeout'|'UntrustedResultHost'|'DownloadFailed'|'TooLarge'} code */
  constructor(code, message) {
    super(message);
    this.name = 'ConvertError';
    this.code = code;
  }
}

export function createDsConvert({ dsInternalUrl, dsPublicUrl, dsJwtSecret, fetchImpl = fetch, pollMs = 500 }) {
  const secret = new TextEncoder().encode(dsJwtSecret);
  const trustedHosts = [new URL(dsPublicUrl).host, new URL(dsInternalUrl).host];

  async function request(body) {
    const token = await new SignJWT({ ...body }).setProtectedHeader({ alg: 'HS256' }).sign(secret);
    let res;
    try {
      res = await fetchImpl(new URL('/converter', dsInternalUrl), {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, token }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new ConvertError('Unreachable', `Document Server conversion failed: ${err.name}`);
    }
    if (!res.ok) throw new ConvertError('Unreachable', `Document Server conversion answered HTTP ${res.status}`);
    return res.json();
  }

  async function download(rawUrl) {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || !trustedHosts.includes(url.host)) {
      throw new ConvertError('UntrustedResultHost', 'The conversion result is not on the Document Server');
    }
    const internal = new URL(url.pathname + url.search, dsInternalUrl); // the browser-facing host is unreachable from this container
    let res;
    try {
      res = await fetchImpl(internal, { redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new ConvertError('DownloadFailed', `Could not download the converted file: ${err.name}`);
    }
    if (!res.ok) throw new ConvertError('DownloadFailed', `Converted file download answered HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_RESULT_BYTES) throw new ConvertError('TooLarge', 'Converted file is too large');
    return bytes;
  }

  /** @param {{fromExt: string, toExt: string, url: string, key: string, title: string}} job @returns {Promise<Buffer>} */
  return async function convert({ fromExt, toExt, url, key, title }) {
    const body = { async: false, filetype: fromExt, outputtype: toExt, key, title, url };
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      const reply = await request(body);
      if (reply.error !== undefined) throw new ConvertError('Failed', `Document Server conversion error ${reply.error}`);
      if (reply.endConvert === true && typeof reply.fileUrl === 'string') return download(reply.fileUrl);
      await new Promise((resolve) => setTimeout(resolve, pollMs)); // still running: ask again
    }
    throw new ConvertError('Timeout', 'The Document Server did not finish the conversion in time');
  };
}
