import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, MAX_UPLOAD_BYTES } from './common.js';

test('HttpError carries status and code', () => {
  const err = new HttpError(409, 'Busy', 'busy');
  assert.equal(err.statusCode, 409);
  assert.equal(err.code, 'Busy');
});

test('the upload cap is 100 MB', () => {
  assert.equal(MAX_UPLOAD_BYTES, 100 * 1024 * 1024);
});
