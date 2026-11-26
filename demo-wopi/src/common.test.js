import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, HttpError, hasMagic } from './common.js';

test('hasMagic accepts matching signatures and rejects mismatches', () => {
  assert.equal(hasMagic('docx', Buffer.from('PK\x03\x04rest')), true);
  assert.equal(hasMagic('pdf', Buffer.from('%PDF-1.7')), true);
  assert.equal(hasMagic('docx', Buffer.from('%PDF-1.7')), false);
  assert.equal(hasMagic('exe', Buffer.from('MZ')), false);
  assert.equal(hasMagic('docx', Buffer.alloc(0)), false);
});

test('pptx is view-only, the others are editable', () => {
  assert.equal(FORMATS.pptx.editable, false);
  assert.equal(FORMATS.docx.editable, true);
});

test('HttpError carries status and code', () => {
  const err = new HttpError(409, 'Busy', 'busy');
  assert.equal(err.statusCode, 409);
  assert.equal(err.code, 'Busy');
});
