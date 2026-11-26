import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECT_SAMPLES } from './sample-sources.js';
import { hasSignature, formatOf } from './formats.js';
import { extractParagraphs } from './docx-text.js';

test('every directly-built sample passes the registry signature rule for its own extension', () => {
  for (const [ext, build] of Object.entries(DIRECT_SAMPLES)) {
    assert.ok(formatOf(ext), `${ext} is in the registry`);
    assert.equal(hasSignature(ext, build()), true, ext);
  }
});

test('the direct samples cover the editable text formats and the three conversion sources', () => {
  for (const ext of ['docx', 'xlsx', 'odp', 'pdf', 'txt', 'csv', 'rtf', 'html', 'htm', 'mht', 'mhtml', 'xml', 'fb2', 'fodt', 'fods', 'fodp']) {
    assert.equal(typeof DIRECT_SAMPLES[ext], 'function', ext);
  }
});

test('docx sample has readable paragraphs (the version diff can read it)', () => {
  const paragraphs = extractParagraphs(DIRECT_SAMPLES.docx());
  assert.ok(paragraphs.length >= 3);
  assert.ok(paragraphs.join(' ').includes('Sample'));
});

test('xlsx sample is a zip with a workbook, a worksheet and inline strings', () => {
  const text = DIRECT_SAMPLES.xlsx().toString('latin1');
  for (const part of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml']) assert.ok(text.includes(part), part);
  assert.ok(text.includes('Apples'));
});

test('odp sample is an ODF package: "mimetype" is the first entry, stored, with the presentation type', () => {
  const bytes = DIRECT_SAMPLES.odp();
  assert.equal(bytes.toString('latin1', 30, 38), 'mimetype');
  assert.equal(bytes.readUInt16LE(8), 0, 'stored, not deflated');
  assert.ok(bytes.toString('latin1').includes('application/vnd.oasis.opendocument.presentation'));
  assert.ok(bytes.toString('latin1').includes('content.xml'));
});

test('pdf sample has a correct xref table: every offset points at its object', () => {
  const pdf = DIRECT_SAMPLES.pdf().toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.'));
  const xrefAt = Number(/startxref\n(\d+)\n%%EOF\n?$/.exec(pdf)[1]);
  assert.ok(pdf.slice(xrefAt).startsWith('xref'));
  const entries = [...pdf.slice(xrefAt).matchAll(/^(\d{10}) \d{5} n ?$/gm)].map((m) => Number(m[1]));
  assert.ok(entries.length >= 5);
  entries.forEach((offset, i) => assert.ok(pdf.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} at ${offset}`));
});

test('the plain-text samples contain what their format needs', () => {
  assert.ok(DIRECT_SAMPLES.csv().toString().split('\n').length >= 3);
  assert.ok(DIRECT_SAMPLES.rtf().toString().startsWith('{\\rtf1'));
  assert.ok(DIRECT_SAMPLES.fb2().toString().includes('<FictionBook'));
  assert.ok(DIRECT_SAMPLES.mht().toString().includes('multipart/related'));
  assert.equal(DIRECT_SAMPLES.html().toString(), DIRECT_SAMPLES.htm().toString());
  assert.ok(DIRECT_SAMPLES.fodt().toString().includes('opendocument.text'));
  assert.ok(DIRECT_SAMPLES.fods().toString().includes('opendocument.spreadsheet'));
  assert.ok(DIRECT_SAMPLES.fodp().toString().includes('opendocument.presentation'));
});
