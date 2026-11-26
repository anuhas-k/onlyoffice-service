import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { makeDocx } from './make-docx.js';

test('makeDocx builds a zip that starts with the PK signature (so the upload magic-byte check accepts it)', () => {
  const bytes = makeDocx(['one']);
  assert.deepEqual(bytes.subarray(0, 4), Buffer.from('PK\x03\x04', 'latin1'));
});

// walk the local file headers (they come first, back to back) and return {name, method, crc, data}
function localEntries(bytes) {
  const entries = [];
  let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const compressedSize = bytes.readUInt32LE(at + 18);
    const nameLength = bytes.readUInt16LE(at + 26);
    const dataAt = at + 30 + nameLength;
    entries.push({
      name: bytes.toString('utf8', at + 30, dataAt),
      method: bytes.readUInt16LE(at + 8),
      crc: bytes.readUInt32LE(at + 14),
      data: bytes.subarray(dataAt, dataAt + compressedSize),
    });
    at = dataAt + compressedSize;
  }
  return entries;
}

test('stored and deflated variants both contain the document body and a valid CRC-32', () => {
  for (const compress of [false, true]) {
    const entry = localEntries(makeDocx(['alpha', 'beta'], { compress })).find((e) => e.name === 'word/document.xml');
    const xml = entry.method === 8 ? zlib.inflateRawSync(entry.data) : entry.data;
    assert.equal(entry.method, compress ? 8 : 0);
    assert.equal(zlib.crc32(xml), entry.crc);
    assert.match(xml.toString(), /alpha/);
    assert.match(xml.toString(), /beta/);
  }
});

test('paragraph text is XML-escaped', () => {
  const bytes = makeDocx(['a < b & c']);
  assert.ok(bytes.toString('latin1').includes('a &lt; b &amp; c'));
});
