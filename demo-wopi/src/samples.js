// Sample files for every format the demo can generate: built by hand when small enough, otherwise converted by the
// Document Server from one of three hand-built sources (docx, xlsx, odp). Formats with no entry here (legacy binaries,
// DjVu, XPS, WPS, ...) cannot be generated; the UI says "upload your own".
import crypto from 'node:crypto';
import { DIRECT_SAMPLES } from './sample-sources.js';
import { createDsConvert, ConvertError } from './ds-convert.js';
import { signDownloadToken, verifyDownloadToken } from './tokens.js';
import { hasSignature } from './formats.js';
import { HttpError } from './common.js';

/** target extension → source extension the Document Server converts from. Only formats the Document Server can WRITE. */
export const CONVERSION_SOURCE = {
  docm: 'docx', dotx: 'docx', dotm: 'docx', odt: 'docx', ott: 'docx', epub: 'docx',
  xlsm: 'xlsx', xltx: 'xlsx', xltm: 'xlsx', ods: 'xlsx', ots: 'xlsx',
  pptx: 'odp', pptm: 'odp', potx: 'odp', potm: 'odp', ppsx: 'odp', ppsm: 'odp', otp: 'odp',
};

export function createSamples({ opts }) {
  const convert = createDsConvert({ dsInternalUrl: opts.dsInternalUrl, dsPublicUrl: opts.dsPublicUrl, dsJwtSecret: opts.dsJwtSecret, fetchImpl: opts.fetchImpl ?? fetch });
  const scratch = new Map(); // id → source bytes, alive only while one conversion runs

  const kindOf = (ext) => {
    if (Object.hasOwn(DIRECT_SAMPLES, ext)) return 'direct';
    return Object.hasOwn(CONVERSION_SOURCE, ext) ? 'convert' : null;
  };

  async function viaConversion(ext) {
    const fromExt = CONVERSION_SOURCE[ext];
    const id = crypto.randomUUID();
    scratch.set(id, DIRECT_SAMPLES[fromExt]());
    const token = signDownloadToken(opts.appSecret, { fileId: id, versionId: 'scratch' });
    try {
      return await convert({ fromExt, toExt: ext, url: `${opts.appInternalUrl}/sample-src/${id}?t=${encodeURIComponent(token)}`, key: `sample-${id}`, title: `sample.${fromExt}` });
    } catch (err) {
      if (err instanceof ConvertError) throw new HttpError(502, 'ConversionFailed', `The Document Server could not convert the sample to .${ext} (${err.code})`);
      throw err;
    } finally {
      scratch.delete(id);
    }
  }

  /** @returns {Promise<Buffer>} bytes that pass the registry signature rule for `ext` */
  async function build(ext) {
    const kind = kindOf(ext);
    if (!kind) throw new HttpError(404, 'NoSample', `There is no built-in sample for .${ext}; upload your own file`);
    const bytes = kind === 'direct' ? DIRECT_SAMPLES[ext]() : await viaConversion(ext);
    if (!hasSignature(ext, bytes)) throw new HttpError(502, 'SampleInvalid', `The generated .${ext} sample is not a valid file`);
    return bytes;
  }

  // Where the Document Server fetches a conversion source from. Same signed, expiring link as the editor download.
  function register(app) {
    app.get('/sample-src/:id', async (req, reply) => {
      if (!verifyDownloadToken(opts.appSecret, req.query.t, req.params.id)) throw new HttpError(401, 'InvalidToken', 'Link invalid or expired');
      const bytes = scratch.get(req.params.id);
      if (!bytes) throw new HttpError(404, 'NotFound', 'No such source');
      return reply.type('application/octet-stream').send(bytes);
    });
  }

  return { kindOf, build, register };
}
