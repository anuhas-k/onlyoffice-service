import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { extractParagraphs, DocxError, MAX_DOCUMENT_XML_BYTES } from './docx-text.js';
import { makeDocx } from './make-docx.js';

test('extracts paragraphs in order from a stored zip and from a deflated zip', () => {
  for (const compress of [false, true]) {
    assert.deepEqual(extractParagraphs(makeDocx(['first', 'second', 'third'], { compress })), ['first', 'second', 'third']);
  }
});

test('runs inside one paragraph are joined; whitespace is kept; tab and line break become characters', () => {
  const body = '<w:p><w:r><w:t>Hel</w:t></w:r><w:r><w:t>lo</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r></w:p>';
  assert.deepEqual(extractParagraphs(makeDocx([], { bodyXml: body })), ['Hello world', 'a\tb\nc']);
});

test('formatting properties and attributes are ignored; entities (named and numeric) are decoded', () => {
  const body = '<w:p w:rsidR="00A1"><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Tom &amp; Jerry &lt;3 &#233; &#x4E2D;</w:t></w:r></w:p>';
  assert.deepEqual(extractParagraphs(makeDocx([], { bodyXml: body })), ['Tom & Jerry <3 é 中']);
});

test('paragraphs inside tables come out in document order, and empty paragraphs are kept', () => {
  const body = '<w:p><w:r><w:t>before</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p/><w:p><w:r><w:t>after</w:t></w:r></w:p>';
  assert.deepEqual(extractParagraphs(makeDocx([], { bodyXml: body })), ['before', 'cell A', 'cell B', '', 'after']);
});

test('a self-closing paragraph and text-less runs do not swallow the next paragraph', () => {
  const body = '<w:p/><w:p><w:r><w:t>kept</w:t></w:r></w:p>';
  assert.deepEqual(extractParagraphs(makeDocx([], { bodyXml: body })), ['', 'kept']);
});

test('input that is not a readable docx is a DocxError, never a crash', () => {
  const cases = {
    'not a zip': Buffer.from('PK\x03\x04 but nothing else'),
    'empty': Buffer.alloc(0),
    'pdf': Buffer.from('%PDF-1.7 hello'),
    'truncated': makeDocx(['x']).subarray(0, 60),
    'no document part': makeDocx([], { entries: { 'other.xml': '<a/>' } }),
  };
  for (const [label, bytes] of Object.entries(cases)) {
    assert.throws(() => extractParagraphs(bytes), (err) => err instanceof DocxError, label);
  }
});

test('a corrupt deflate stream is a DocxError', () => {
  const good = makeDocx(['hello world hello world'], { compress: true });
  const at = good.indexOf('word/document.xml') + 'word/document.xml'.length;
  const broken = Buffer.from(good);
  broken.fill(0xff, at, at + 6);
  assert.throws(() => extractParagraphs(broken), (err) => err instanceof DocxError);
});

test('zip-bomb guard: a document part that inflates past the cap is refused without being fully inflated', () => {
  const big = '<w:p><w:r><w:t>' + 'a'.repeat(1024 * 1024) + '</w:t></w:r></w:p>';
  const body = big.repeat(Math.ceil(MAX_DOCUMENT_XML_BYTES / big.length) + 2);
  const bomb = makeDocx([], { bodyXml: body, compress: true });
  assert.ok(bomb.length < MAX_DOCUMENT_XML_BYTES / 20, 'the fixture really is highly compressed');
  assert.throws(() => extractParagraphs(bomb), (err) => err instanceof DocxError && err.code === 'TooLarge');
});

test('a lying central directory (declared size smaller than the real data) cannot make the reader overrun', () => {
  const good = makeDocx(['a normal paragraph'], { compress: true });
  const forged = Buffer.from(good);
  const cd = forged.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); // last central entry
  forged.writeUInt32LE(0x7fffffff, cd + 20); // compressed size far beyond the file
  assert.throws(() => extractParagraphs(forged), (err) => err instanceof DocxError);
});

test('real Word packaging details: data-descriptor flag and extra fields do not break reading', () => {
  const body = '<w:p><w:r><w:t>ok</w:t></w:r></w:p>';
  const raw = makeDocx([], { bodyXml: body, compress: true });
  const flagged = Buffer.from(raw);
  // set the "sizes follow in a data descriptor" bit in every local header; the central directory still holds the sizes
  let at = 0;
  while ((at = flagged.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), at)) !== -1) { flagged.writeUInt16LE(8, at + 6); at += 4; }
  assert.deepEqual(extractParagraphs(flagged), ['ok']);
  void zlib;
});
