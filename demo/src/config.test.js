import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';

const full = {
  DS_JWT_SECRET: 'a'.repeat(32), APP_SECRET: 'b'.repeat(32),
  DS_PUBLIC_URL: 'http://localhost:8080', DS_INTERNAL_URL: 'http://documentserver', APP_INTERNAL_URL: 'http://app:3000',
};

test('loads a complete environment', () => {
  const c = loadConfig(full);
  assert.equal(c.port, 3000);
  assert.equal(c.dataDir, '/data');
  assert.equal(c.dsInternalUrl, 'http://documentserver');
});

test('refuses to start without a secret and never prints its value', () => {
  for (const name of ['DS_JWT_SECRET', 'APP_SECRET', 'DS_PUBLIC_URL', 'DS_INTERNAL_URL', 'APP_INTERNAL_URL']) {
    const env = { ...full };
    delete env[name];
    assert.throws(() => loadConfig(env), (err) => err.message.includes(name) && !err.message.includes('aaaa'));
  }
});

test('refuses a short secret', () => {
  assert.throws(() => loadConfig({ ...full, APP_SECRET: 'short' }), /APP_SECRET/);
});
