// Pieces shared by the ONLYOFFICE-protocol routes (server.js) and the WOPI routes (wopi.js). Formats live in formats.js.

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
