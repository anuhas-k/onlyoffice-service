// Pieces shared by the ONLYOFFICE-protocol routes (server.js) and the WOPI routes (wopi.js).

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const ZIP_MAGIC = Buffer.from('PK\x03\x04', 'latin1');
const PDF_MAGIC = Buffer.from('%PDF', 'latin1');

export const FORMATS = {
  docx: { magic: ZIP_MAGIC, documentType: 'word', editable: true },
  xlsx: { magic: ZIP_MAGIC, documentType: 'cell', editable: true },
  pptx: { magic: ZIP_MAGIC, documentType: 'slide', editable: false },
  pdf: { magic: PDF_MAGIC, documentType: 'pdf', editable: true },
};

export class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function hasMagic(ext, bytes) {
  const format = FORMATS[ext];
  return Boolean(format) && bytes.subarray(0, format.magic.length).equals(format.magic);
}
