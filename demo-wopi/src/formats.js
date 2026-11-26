// The format registry: every extension the Document Server publishes in /hosting/discovery (57 on 8.2.2), with how the
// demo treats it. One table drives upload validation, the ONLYOFFICE-protocol config, the WOPI open mode and the UI list.
//   kind       editor family (also the WOPI app path: word | cell | slide | pdf)
//   mode       edit = the Document Server offers an edit action AND the demo allows it; view = view-only
//   signature  what the first bytes must look like (cheap defence against a renamed file; not a malware scanner)
// Modes mirror the real discovery. Deviation from SPEC.md line 79: .pptx is editable here (the spec says view-only) because
// this spike's purpose is to test every format the Document Server offers.
// Legacy binaries (doc, xls, ppt, ...) are view-only: the Document Server only offers `convert` for editing them, and
// convert needs PutRelativeFile, which this demo answers 501.

const row = (ext, kind, mode, signature, label) => ({ ext, kind, mode, signature, label });

export const FORMAT_LIST = [
  // Word processing
  row('docx', 'word', 'edit', 'zip', 'Word document'),
  row('docm', 'word', 'edit', 'zip', 'Word macro-enabled document'),
  row('dotx', 'word', 'edit', 'zip', 'Word template'),
  row('odt', 'word', 'edit', 'zip', 'OpenDocument text'),
  row('txt', 'word', 'edit', 'text', 'Plain text'),
  row('doc', 'word', 'view', 'ole', 'Word 97–2003 document'),
  row('dot', 'word', 'view', 'ole', 'Word 97–2003 template'),
  row('dotm', 'word', 'view', 'zip', 'Word macro-enabled template'),
  row('docxf', 'word', 'view', 'zip', 'ONLYOFFICE form template'),
  row('oform', 'word', 'view', 'zip', 'ONLYOFFICE form'),
  row('ott', 'word', 'view', 'zip', 'OpenDocument text template'),
  row('fodt', 'word', 'view', 'xml', 'Flat OpenDocument text'),
  row('sxw', 'word', 'view', 'zip', 'StarOffice/OpenOffice 1.x text'),
  row('stw', 'word', 'view', 'zip', 'OpenOffice 1.x text template'),
  row('rtf', 'word', 'view', 'rtf', 'Rich text'),
  row('epub', 'word', 'view', 'zip', 'EPUB e-book'),
  row('fb2', 'word', 'view', 'xml', 'FictionBook e-book'),
  row('htm', 'word', 'view', 'text', 'Web page'),
  row('html', 'word', 'view', 'text', 'Web page'),
  row('mht', 'word', 'view', 'text', 'Web archive'),
  row('mhtml', 'word', 'view', 'text', 'Web archive'),
  row('wps', 'word', 'view', 'any', 'WPS Writer document'),
  row('wpt', 'word', 'view', 'any', 'WPS Writer template'),
  // Spreadsheets
  row('xlsx', 'cell', 'edit', 'zip', 'Excel workbook'),
  row('xlsm', 'cell', 'edit', 'zip', 'Excel macro-enabled workbook'),
  row('xltx', 'cell', 'edit', 'zip', 'Excel template'),
  row('ods', 'cell', 'edit', 'zip', 'OpenDocument spreadsheet'),
  row('csv', 'cell', 'edit', 'text', 'Comma-separated values'),
  row('xls', 'cell', 'view', 'ole', 'Excel 97–2003 workbook'),
  row('xlt', 'cell', 'view', 'ole', 'Excel 97–2003 template'),
  row('xltm', 'cell', 'view', 'zip', 'Excel macro-enabled template'),
  row('xlsb', 'cell', 'view', 'zip', 'Excel binary workbook'),
  row('ots', 'cell', 'view', 'zip', 'OpenDocument spreadsheet template'),
  row('fods', 'cell', 'view', 'xml', 'Flat OpenDocument spreadsheet'),
  row('sxc', 'cell', 'view', 'zip', 'StarOffice/OpenOffice 1.x spreadsheet'),
  row('xml', 'cell', 'view', 'xml', 'XML'),
  row('et', 'cell', 'view', 'any', 'WPS Spreadsheets workbook'),
  row('ett', 'cell', 'view', 'any', 'WPS Spreadsheets template'),
  // Presentations
  row('pptx', 'slide', 'edit', 'zip', 'PowerPoint presentation'),
  row('pptm', 'slide', 'edit', 'zip', 'PowerPoint macro-enabled presentation'),
  row('potx', 'slide', 'edit', 'zip', 'PowerPoint template'),
  row('odp', 'slide', 'edit', 'zip', 'OpenDocument presentation'),
  row('ppt', 'slide', 'view', 'ole', 'PowerPoint 97–2003 presentation'),
  row('pot', 'slide', 'view', 'ole', 'PowerPoint 97–2003 template'),
  row('pps', 'slide', 'view', 'ole', 'PowerPoint 97–2003 slide show'),
  row('ppsx', 'slide', 'view', 'zip', 'PowerPoint slide show'),
  row('ppsm', 'slide', 'view', 'zip', 'PowerPoint macro-enabled slide show'),
  row('potm', 'slide', 'view', 'zip', 'PowerPoint macro-enabled template'),
  row('otp', 'slide', 'view', 'zip', 'OpenDocument presentation template'),
  row('fodp', 'slide', 'view', 'xml', 'Flat OpenDocument presentation'),
  row('sxi', 'slide', 'view', 'zip', 'StarOffice/OpenOffice 1.x presentation'),
  row('dps', 'slide', 'view', 'any', 'WPS Presentation'),
  row('dpt', 'slide', 'view', 'any', 'WPS Presentation template'),
  // PDF and page-description formats
  row('pdf', 'pdf', 'edit', 'pdf', 'PDF (form filling)'),
  row('djvu', 'pdf', 'view', 'djvu', 'DjVu'),
  row('xps', 'pdf', 'view', 'zip', 'XPS document'),
  row('oxps', 'pdf', 'view', 'zip', 'OpenXPS document'),
];

const BY_EXT = new Map(FORMAT_LIST.map((f) => [f.ext, f]));

/** The registry entry for an extension, or undefined. A Map, so 'constructor' / '__proto__' are never found. */
export const formatOf = (ext) => BY_EXT.get(ext);

/** Lowercased text after the last dot; '' when there is none (or it is a trailing dot). */
export function extensionOf(fileName) {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

const startsWith = (bytes, ascii) => bytes.length >= ascii.length && bytes.subarray(0, ascii.length).equals(Buffer.from(ascii, 'latin1'));
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const TEXT_SNIFF_BYTES = 8192;

const looksLikeText = (bytes) => bytes.length > 0 && !bytes.subarray(0, TEXT_SNIFF_BYTES).includes(0);

function looksLikeXml(bytes) {
  let at = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0; // UTF-8 BOM
  while (at < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[at])) at++;
  return bytes[at] === 0x3c; // '<'
}

const SIGNATURE_RULES = {
  zip: (b) => startsWith(b, 'PK\x03\x04'),
  ole: (b) => b.length >= OLE_MAGIC.length && b.subarray(0, OLE_MAGIC.length).equals(OLE_MAGIC),
  pdf: (b) => startsWith(b, '%PDF'),
  rtf: (b) => startsWith(b, '{\\rtf'),
  djvu: (b) => startsWith(b, 'AT&TFORM'),
  text: looksLikeText,
  xml: looksLikeXml,
  any: (b) => b.length > 0,
};

export function hasSignature(ext, bytes) {
  const format = formatOf(ext);
  return Boolean(format) && SIGNATURE_RULES[format.signature](bytes);
}
