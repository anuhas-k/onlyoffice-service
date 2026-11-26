// Paragraph text out of a .docx, using only node:zlib (reuse ladder: stdlib first, no new dependency).
// A .docx is a zip; the body is word/document.xml. We read the zip's central directory (never trusting local headers
// for sizes), inflate with a hard output cap, then walk the paragraph/run tags. Text only: formatting, images and
// most table structure are deliberately out of scope for the history diff.
import zlib from 'node:zlib';

export const MAX_DOCUMENT_XML_BYTES = 20 * 1024 * 1024; // zip-bomb guard: the document part may not inflate past this
const MAX_ENTRIES = 10_000;
const MAX_COMMENT_BYTES = 0xffff;
const DOCUMENT_PART = 'word/document.xml';
const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export class DocxError extends Error {
  /** @param {'NotADocx'|'Corrupt'|'TooLarge'} code */
  constructor(code, message) {
    super(message);
    this.name = 'DocxError';
    this.code = code;
  }
}

function findEndOfCentralDirectory(buf) {
  const lowest = Math.max(0, buf.length - 22 - MAX_COMMENT_BYTES);
  for (let at = buf.length - 22; at >= lowest; at--) {
    if (buf.readUInt32LE(at) === SIG_EOCD) return at;
  }
  throw new DocxError('NotADocx', 'Not a zip archive');
}

function findEntry(buf, name) {
  if (buf.length < 22) throw new DocxError('NotADocx', 'Not a zip archive');
  const end = findEndOfCentralDirectory(buf);
  const count = buf.readUInt16LE(end + 10);
  const size = buf.readUInt32LE(end + 12);
  let at = buf.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES || at + size > buf.length) throw new DocxError('Corrupt', 'Bad central directory');
  for (let i = 0; i < count; i++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== SIG_CENTRAL) throw new DocxError('Corrupt', 'Bad central directory entry');
    const entry = {
      method: buf.readUInt16LE(at + 10),
      compressedSize: buf.readUInt32LE(at + 20),
      uncompressedSize: buf.readUInt32LE(at + 24),
      localOffset: buf.readUInt32LE(at + 42),
    };
    const nameLength = buf.readUInt16LE(at + 28);
    const next = at + 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    if (next > buf.length) throw new DocxError('Corrupt', 'Truncated central directory');
    if (buf.toString('utf8', at + 46, at + 46 + nameLength) === name) return entry;
    at = next;
  }
  throw new DocxError('NotADocx', `Missing ${name}`);
}

function readEntry(buf, entry) {
  const { method, compressedSize, uncompressedSize, localOffset } = entry;
  if (uncompressedSize > MAX_DOCUMENT_XML_BYTES) throw new DocxError('TooLarge', 'Document part is too large');
  if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== SIG_LOCAL) throw new DocxError('Corrupt', 'Bad local header');
  // the local header's own name/extra lengths locate the data; its sizes may be zero (data descriptor), so those come from the central directory
  const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
  if (start + compressedSize > buf.length) throw new DocxError('Corrupt', 'Entry runs past the end of the file');
  const data = buf.subarray(start, start + compressedSize);
  if (method === 0) {
    if (data.length > MAX_DOCUMENT_XML_BYTES) throw new DocxError('TooLarge', 'Document part is too large');
    return data;
  }
  if (method !== 8) throw new DocxError('Corrupt', `Unsupported compression method ${method}`);
  try {
    return zlib.inflateRawSync(data, { maxOutputLength: MAX_DOCUMENT_XML_BYTES });
  } catch (err) {
    if (err.code === 'ERR_BUFFER_TOO_LARGE') throw new DocxError('TooLarge', 'Document part is too large');
    throw new DocxError('Corrupt', 'Document part cannot be inflated');
  }
}

const ENTITY = /&(?:(amp|lt|gt|quot|apos)|#(\d+)|#x([0-9a-fA-F]+));/g;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeEntities(text) {
  return text.replace(ENTITY, (whole, named, dec, hex) => {
    if (named) return NAMED[named];
    const code = dec ? Number(dec) : Number.parseInt(hex, 16);
    return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
  });
}

// paragraph start (maybe self-closing) | paragraph end | text run | self-closing text | tab | line break
const TOKEN = /<w:p\b[^>]*?(\/)?>|<\/w:p>|<w:t\b[^>]*>([^<]*)<\/w:t>|<w:t\b[^>]*\/>|<w:(tab)\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/g;

/** @param {Buffer} bytes a .docx @returns {string[]} one string per paragraph, document order (tables included) */
export function extractParagraphs(bytes) {
  const xml = readEntry(bytes, findEntry(bytes, DOCUMENT_PART)).toString('utf8');
  const paragraphs = [];
  const open = []; // stack: a text box holds paragraphs inside a paragraph
  for (const match of xml.matchAll(TOKEN)) {
    const [token, selfClosing, text, tab] = match;
    if (token.startsWith('<w:p')) {
      if (selfClosing) paragraphs.push('');
      else open.push('');
    } else if (token === '</w:p>') {
      if (open.length > 0) paragraphs.push(open.pop());
    } else if (open.length > 0) {
      const last = open.length - 1;
      if (text !== undefined) open[last] += decodeEntities(text);
      else if (tab) open[last] += '\t';
      else if (token.startsWith('<w:br') || token.startsWith('<w:cr')) open[last] += '\n';
    }
  }
  return paragraphs;
}
