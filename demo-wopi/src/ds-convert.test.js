import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jwtVerify } from 'jose';
import { createDsConvert, ConvertError } from './ds-convert.js';

const SECRET = 'ds-secret-0123456789abcdef0123';
const enc = new TextEncoder().encode(SECRET);
const RESULT = Buffer.from('PK\x03\x04converted');

function dsFetch({ convertReplies, download = () => new Response(RESULT, { status: 200 }) }, seen = []) {
  let call = 0;
  return async (url, init) => {
    const u = new URL(String(url));
    seen.push({ path: u.pathname, host: u.host, init });
    if (u.pathname === '/converter') {
      const reply = convertReplies[Math.min(call++, convertReplies.length - 1)];
      return new Response(JSON.stringify(reply), { status: 200 });
    }
    return download(u);
  };
}
const make = (fetchImpl) => createDsConvert({ dsInternalUrl: 'http://documentserver', dsPublicUrl: 'http://localhost:8081', dsJwtSecret: SECRET, fetchImpl, pollMs: 1 });
const job = { fromExt: 'docx', toExt: 'odt', url: 'http://app:3000/sample-src/x?t=1', key: 'k1', title: 'sample.docx' };

test('posts a JWT-signed conversion request and returns the converted bytes', async () => {
  const seen = [];
  const convert = make(dsFetch({ convertReplies: [{ endConvert: true, fileUrl: 'http://localhost:8081/cache/files/out.odt', percent: 100 }] }, seen));
  assert.deepEqual(await convert(job), RESULT);
  const post = seen[0];
  assert.equal(post.path, '/converter');
  const sent = JSON.parse(post.init.body);
  assert.deepEqual({ ...sent, token: undefined }, { async: false, filetype: 'docx', outputtype: 'odt', key: 'k1', title: 'sample.docx', url: job.url, token: undefined });
  const { payload } = await jwtVerify(post.init.headers.authorization.replace('Bearer ', ''), enc);
  assert.equal(payload.outputtype, 'odt');
  assert.equal(sent.token, post.init.headers.authorization.replace('Bearer ', ''));
});

test('the result is downloaded from the internal Document Server host, not the browser-facing one', async () => {
  const seen = [];
  const convert = make(dsFetch({ convertReplies: [{ endConvert: true, fileUrl: 'http://localhost:8081/cache/files/out.odt' }] }, seen));
  await convert(job);
  assert.equal(seen[1].host, 'documentserver');
  assert.equal(seen[1].path, '/cache/files/out.odt');
});

test('a result URL on any other host is refused (SSRF guard)', async () => {
  const convert = make(dsFetch({ convertReplies: [{ endConvert: true, fileUrl: 'http://169.254.169.254/latest/meta-data' }] }));
  await assert.rejects(() => convert(job), (err) => err instanceof ConvertError && err.code === 'UntrustedResultHost');
});

test('while the conversion is still running the request is repeated until it ends', async () => {
  const seen = [];
  const convert = make(dsFetch({ convertReplies: [{ endConvert: false, percent: 20 }, { endConvert: false, percent: 80 }, { endConvert: true, fileUrl: 'http://localhost:8081/o.odt' }] }, seen));
  assert.deepEqual(await convert(job), RESULT);
  assert.equal(seen.filter((s) => s.path === '/converter').length, 3);
});

test('a conversion that never finishes gives up with Timeout', async () => {
  const convert = make(dsFetch({ convertReplies: [{ endConvert: false, percent: 1 }] }));
  await assert.rejects(() => convert(job), (err) => err instanceof ConvertError && err.code === 'Timeout');
});

test('a Document Server error code is surfaced with the code, and the secret never appears in the message', async () => {
  const convert = make(dsFetch({ convertReplies: [{ error: -3 }] }));
  await assert.rejects(() => convert(job), (err) => err instanceof ConvertError && err.code === 'Failed' && /-3/.test(err.message) && !err.message.includes(SECRET));
});

test('transport failures and a failed download are ConvertErrors, not crashes', async () => {
  const down = createDsConvert({ dsInternalUrl: 'http://documentserver', dsPublicUrl: 'http://localhost:8081', dsJwtSecret: SECRET, fetchImpl: async () => { throw new Error('ECONNREFUSED'); }, pollMs: 1 });
  await assert.rejects(() => down(job), (err) => err instanceof ConvertError && err.code === 'Unreachable');
  const bad = make(dsFetch({ convertReplies: [{ endConvert: true, fileUrl: 'http://localhost:8081/o.odt' }], download: () => new Response('no', { status: 404 }) }));
  await assert.rejects(() => bad(job), (err) => err instanceof ConvertError && err.code === 'DownloadFailed');
});

test('an oversized result is refused', async () => {
  const big = make(dsFetch({ convertReplies: [{ endConvert: true, fileUrl: 'http://localhost:8081/o.odt' }], download: () => new Response(Buffer.alloc(30 * 1024 * 1024), { status: 200 }) }));
  await assert.rejects(() => big(job), (err) => err instanceof ConvertError && err.code === 'TooLarge');
});
