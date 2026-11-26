import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMAT_LIST, formatOf, hasSignature, extensionOf } from './formats.js';

const bytes = (s) => Buffer.from(s, 'latin1');
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);

test('the registry covers the 57 extensions the Document Server publishes, each exactly once', () => {
  const exts = FORMAT_LIST.map((f) => f.ext);
  assert.equal(new Set(exts).size, exts.length, 'no duplicates');
  assert.equal(exts.length, 57);
  for (const must of ['docx', 'xlsx', 'pptx', 'pdf', 'odt', 'ods', 'odp', 'txt', 'csv', 'rtf', 'doc', 'xls', 'ppt', 'djvu', 'xps', 'epub', 'html']) assert.ok(exts.includes(must), must);
});

test('every entry has a kind, a mode and a signature rule', () => {
  for (const f of FORMAT_LIST) {
    assert.ok(['word', 'cell', 'slide', 'pdf'].includes(f.kind), `${f.ext} kind`);
    assert.ok(['edit', 'view'].includes(f.mode), `${f.ext} mode`);
    assert.ok(['zip', 'ole', 'pdf', 'rtf', 'djvu', 'text', 'xml', 'any'].includes(f.signature), `${f.ext} signature`);
    assert.ok(f.label.length > 0, `${f.ext} label`);
  }
});

test('modes match the Document Server discovery: pptx/potx/odp are now editable, legacy binaries are view-only', () => {
  const edit = FORMAT_LIST.filter((f) => f.mode === 'edit').map((f) => f.ext).sort();
  assert.deepEqual(edit, ['csv', 'docm', 'docx', 'dotx', 'odp', 'ods', 'odt', 'pdf', 'potx', 'pptm', 'pptx', 'txt', 'xlsm', 'xlsx', 'xltx']);
  for (const ext of ['doc', 'xls', 'ppt', 'rtf', 'epub', 'djvu', 'xps']) assert.equal(formatOf(ext).mode, 'view', ext);
});

test('kind follows the editor family', () => {
  assert.equal(formatOf('docx').kind, 'word');
  assert.equal(formatOf('xlsx').kind, 'cell');
  assert.equal(formatOf('pptx').kind, 'slide');
  assert.equal(formatOf('pdf').kind, 'pdf');
  assert.equal(formatOf('csv').kind, 'cell');
  assert.equal(formatOf('txt').kind, 'word');
});

test('extensionOf lowercases, takes the last dot, and refuses names without one', () => {
  assert.equal(extensionOf('Report.DOCX'), 'docx');
  assert.equal(extensionOf('a.tar.gz'), 'gz');
  assert.equal(extensionOf('noext'), '');
  assert.equal(extensionOf('.hidden'), 'hidden');
  assert.equal(extensionOf('trailing.'), '');
});

test('formatOf is undefined for anything outside the registry (and for prototype keys)', () => {
  assert.equal(formatOf('exe'), undefined);
  assert.equal(formatOf('constructor'), undefined);
  assert.equal(formatOf('__proto__'), undefined);
  assert.equal(formatOf(''), undefined);
});

test('signature rules accept the right bytes and reject the wrong ones', () => {
  assert.equal(hasSignature('docx', bytes('PK\x03\x04rest')), true);
  assert.equal(hasSignature('docx', bytes('%PDF-1.7')), false);
  assert.equal(hasSignature('pdf', bytes('%PDF-1.7')), true);
  assert.equal(hasSignature('doc', OLE), true);
  assert.equal(hasSignature('doc', bytes('PK\x03\x04')), false);
  assert.equal(hasSignature('rtf', bytes('{\\rtf1\\ansi hello}')), true);
  assert.equal(hasSignature('rtf', bytes('plain text')), false);
  assert.equal(hasSignature('djvu', bytes('AT&TFORM\x00\x00')), true);
  assert.equal(hasSignature('txt', bytes('hello\nworld')), true);
  assert.equal(hasSignature('txt', Buffer.from([0x68, 0x00, 0x69])), false, 'NUL byte = binary, not text');
  assert.equal(hasSignature('csv', bytes('a,b\n1,2')), true);
  assert.equal(hasSignature('html', bytes('<!doctype html><p>x')), true);
  assert.equal(hasSignature('fods', Buffer.from([0xef, 0xbb, 0xbf, 0x20, 0x20, ...Buffer.from('<?xml version="1.0"?><x/>')])), true, 'UTF-8 BOM, spaces, then <');
  assert.equal(hasSignature('fods', bytes('not xml')), false);
  assert.equal(hasSignature('xml', Buffer.from('\xef\xbb\xbf<a/>', 'latin1')), true, 'UTF-8 BOM then <');
  assert.equal(hasSignature('wps', bytes('anything non-empty')), true);
});

test('an empty file never passes any signature rule', () => {
  for (const f of FORMAT_LIST) assert.equal(hasSignature(f.ext, Buffer.alloc(0)), false, f.ext);
});

test('unknown extensions never pass', () => {
  assert.equal(hasSignature('exe', bytes('MZ')), false);
});
