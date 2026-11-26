import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jwtVerify } from 'jose';
import { createDsCommand, DS_ERROR } from './ds-command.js';

const SECRET = 'ds-secret-0123456789abcdef0123';
const enc = new TextEncoder().encode(SECRET);

function fakeFetch(reply, seen = []) {
  return async (url, init) => {
    seen.push({ url: String(url), init, body: JSON.parse(init.body) });
    return reply instanceof Error ? Promise.reject(reply) : new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
  };
}

test('posts a JWT-signed command to the internal Document Server /command', async () => {
  const seen = [];
  const send = createDsCommand({ dsInternalUrl: 'http://documentserver', dsJwtSecret: SECRET, fetchImpl: fakeFetch({ body: { key: 'k', error: 0 } }, seen) });
  const out = await send('forcesave', 'k');
  assert.deepEqual(out, { key: 'k', error: 0 });
  assert.equal(seen[0].url, 'http://documentserver/command');
  assert.equal(seen[0].init.method, 'POST');
  const bearer = seen[0].init.headers.authorization.replace('Bearer ', '');
  const { payload } = await jwtVerify(bearer, enc, { algorithms: ['HS256'] });
  assert.equal(payload.c, 'forcesave');
  assert.equal(payload.key, 'k');
  assert.equal(seen[0].body.token, bearer, 'the body carries the same token (works with either JWT placement)');
});

test('extra fields such as users are sent and signed', async () => {
  const seen = [];
  const send = createDsCommand({ dsInternalUrl: 'http://documentserver', dsJwtSecret: SECRET, fetchImpl: fakeFetch({}, seen) });
  await send('drop', 'k', { users: ['alice', 'bob'] });
  assert.deepEqual(seen[0].body.users, ['alice', 'bob']);
  const { payload } = await jwtVerify(seen[0].body.token, enc);
  assert.deepEqual(payload.users, ['alice', 'bob']);
});

test('a non-200 answer or a network failure throws a DsCommandError that never contains the secret', async () => {
  const bad = createDsCommand({ dsInternalUrl: 'http://documentserver', dsJwtSecret: SECRET, fetchImpl: fakeFetch({ status: 403 }) });
  await assert.rejects(() => bad('info', 'k'), (err) => err.name === 'DsCommandError' && /403/.test(err.message) && !err.message.includes(SECRET));
  const down = createDsCommand({ dsInternalUrl: 'http://documentserver', dsJwtSecret: SECRET, fetchImpl: fakeFetch(new Error('ECONNREFUSED')) });
  await assert.rejects(() => down('info', 'k'), (err) => err.name === 'DsCommandError');
});

test('DS_ERROR names the documented error codes', () => {
  assert.equal(DS_ERROR.NONE, 0);
  assert.equal(DS_ERROR.KEY_MISSING, 1);
  assert.equal(DS_ERROR.NO_CHANGES, 4);
});
