// Demo slice HTTP app: upload, list, open in ONLYOFFICE, callback-driven versions. SPIKE — never merged.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { SignJWT, jwtVerify } from 'jose';
import { openStore } from './store.js';
import { documentKey, signDownloadToken, verifyDownloadToken } from './tokens.js';
import { HttpError, MAX_UPLOAD_BYTES } from './common.js';
import { FORMAT_LIST, formatOf, hasSignature, extensionOf } from './formats.js';
import { createSamples } from './samples.js';
import { createWopi } from './wopi.js';
import { diffVersions } from './version-diff.js';

const DOWNLOAD_TIMEOUT_MS = 30_000;
// shortcut: fixed demo users chosen by header, no real auth, demo only — replace with JWT users (TASK-004) before any shared deployment.
const DEMO_USERS = new Set(['alice', 'bob', 'carol']);
const STATUS = { EDITING: 1, READY: 2, SAVE_ERROR: 3, CLOSED: 4, FORCE_SAVE: 6, FORCE_SAVE_ERROR: 7 };
const ENGINES = new Set(['onlyoffice', 'wopi']);

const enc = (secret) => new TextEncoder().encode(secret);

function securityHeaders(dsPublicUrl) {
  const ds = new URL(dsPublicUrl).origin;
  return {
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    // The editor page loads ONLYOFFICE's api.js and iframes the editor from the Document Server origin.
    'Content-Security-Policy': `default-src 'self'; script-src 'self' ${ds}; frame-src ${ds}; form-action ${ds}; connect-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

export async function buildApp(opts) {
  const store = await openStore(opts.dataDir);
  const sessions = new Map(); // fileId → { key, versionId, participants:Set }
  const keys = new Map(); // key → fileId (every key ever issued, so retried callbacks still resolve)
  const app = Fastify({ logger: opts.logger ?? loggerOptions(), bodyLimit: 1024 * 1024 });
  const headers = securityHeaders(opts.dsPublicUrl);
  const samples = createSamples({ opts });
  const wopi = createWopi({ store, opts, isOnlyofficeActive: (fileId) => sessions.has(fileId) });

  app.addHook('onSend', async (req, reply) => { reply.headers(headers); });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  await app.register(fastifyStatic, { root: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public') });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: { code: 'FileTooLarge', message: 'Upload exceeds 100 MB' } });
    if (err.validation) return reply.code(400).send({ error: { code: 'ValidationError', message: err.message } });
    // Fastify's own request errors (bad JSON, unsupported content type, body too large) carry a 4xx statusCode: pass it on.
    if (Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 500) {
      const code = { 415: 'UnsupportedMediaType', 413: 'PayloadTooLarge' }[err.statusCode] ?? 'BadRequest';
      return reply.code(err.statusCode).send({ error: { code, message: err.statusCode === 400 ? 'Malformed request' : err.message } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'InternalError', message: 'Internal server error' } });
  });

  const userOf = (req) => {
    const user = req.headers['x-demo-user'];
    if (typeof user !== 'string' || !DEMO_USERS.has(user)) throw new HttpError(401, 'Unauthenticated', 'Pick a demo user');
    return user;
  };
  const fileOf = (id) => {
    const file = store.get(id);
    if (!file) throw new HttpError(404, 'FileNotFound', 'No such file');
    return file;
  };

  await wopi.register(app);
  samples.register(app);

  app.get('/healthz', async () => ({ ok: true }));

  app.post('/files', async (req, reply) => {
    const user = userOf(req);
    const part = await req.file();
    if (!part) throw new HttpError(400, 'ValidationError', 'Missing file field');
    const bytes = await part.toBuffer();
    const ext = extensionOf(part.filename);
    if (!hasSignature(ext, bytes)) {
      throw new HttpError(400, 'UnsupportedFormat', 'Unsupported file type, or the content does not match the extension (GET /formats lists what is accepted)');
    }
    const file = await store.createFile({ name: path.basename(part.filename), ext, bytes, createdBy: user });
    return reply.code(201).send({ file: summary(file) });
  });

  // Every format the demo knows, how it is treated, whether a sample can be generated, and what the Document Server
  // offers for it right now (WOPI discovery). No secrets here, so no user is required.
  app.get('/formats', async () => {
    const actions = await wopi.actionNames();
    return {
      dsReachable: actions !== null,
      formats: FORMAT_LIST.map(({ ext, kind, mode, label }) => ({ ext, kind, mode, label, sample: samples.kindOf(ext), dsActions: actions ? (actions.get(ext) ?? []) : null })),
    };
  });

  app.post('/samples/:ext', async (req, reply) => {
    const user = userOf(req);
    const { ext } = req.params;
    if (!formatOf(ext)) throw new HttpError(404, 'UnknownFormat', 'No such format');
    const bytes = await samples.build(ext);
    const file = await store.createFile({ name: `sample.${ext}`, ext, bytes, createdBy: user });
    return reply.code(201).send({ file: summary(file) });
  });

  app.get('/files', async (req) => {
    userOf(req);
    return { files: store.list().map(summary) };
  });

  app.get('/files/:id/versions', async (req) => {
    userOf(req);
    return { versions: [...fileOf(req.params.id).versions].reverse() };
  });

  // "View changes": text diff between two stored versions of a .docx (see version-diff.js).
  app.get('/files/:id/versions/:versionId/diff', async (req) => {
    userOf(req);
    const file = fileOf(req.params.id);
    if (file.ext !== 'docx') throw new HttpError(415, 'DiffUnsupported', 'Changes can only be shown for .docx files');
    const index = file.versions.findIndex((v) => v.id === req.params.versionId);
    if (index === -1) throw new HttpError(404, 'VersionNotFound', 'No such version');
    const { against } = req.query;
    if (against !== undefined && typeof against !== 'string') throw new HttpError(400, 'ValidationError', 'against must be a single version id');
    const fromIndex = against === undefined ? index - 1 : file.versions.findIndex((v) => v.id === against);
    if (against !== undefined && fromIndex === -1) throw new HttpError(404, 'VersionNotFound', 'No such version to compare with');
    if (fromIndex >= index) throw new HttpError(400, 'ValidationError', 'Compare with an earlier version');
    return diffVersions(store, file, file.versions[index], fromIndex >= 0 ? file.versions[fromIndex] : null);
  });

  app.post('/files/:id/sessions', async (req) => {
    const user = userOf(req);
    const file = fileOf(req.params.id);
    const engine = req.query.engine ?? 'onlyoffice';
    if (!ENGINES.has(engine)) throw new HttpError(400, 'ValidationError', 'engine must be onlyoffice or wopi');
    if (engine === 'wopi') return wopi.openSession(file, user);
    const session = joinSession(file, user);
    const config = editorConfig(file, session, user);
    config.token = await new SignJWT({ ...config }).setProtectedHeader({ alg: 'HS256' }).sign(enc(opts.dsJwtSecret));
    return { engine, documentServerUrl: opts.dsPublicUrl, mode: config.editorConfig.mode, config };
  });

  // Recovery / manual close for a WOPI session the Document Server left open (see wopi.js "closing a session").
  app.post('/files/:id/wopi/end', async (req) => {
    userOf(req);
    return wopi.endSession(fileOf(req.params.id).id);
  });

  app.get('/files/:id/content', async (req, reply) => {
    const claims = verifyDownloadToken(opts.appSecret, req.query.t, req.params.id);
    if (!claims) throw new HttpError(401, 'InvalidToken', 'Download token invalid or expired');
    const bytes = await store.readVersion(claims.fileId, claims.versionId);
    return reply.type('application/octet-stream').send(bytes);
  });

  app.post('/onlyoffice/callback', async (req) => {
    const body = await verifyCallback(req);
    const fileId = keys.get(body.key);
    if (!fileId || !store.get(fileId)) throw new HttpError(404, 'UnknownDocumentKey', 'Unknown document key');
    await handleStatus(fileId, body, req.log);
    return { error: 0 };
  });

  function summary(file) {
    const session = sessions.get(file.id);
    return { id: file.id, name: file.name, ext: file.ext, versionCount: file.versions.length, editors: [...new Set([...(session ? session.participants : []), ...wopi.editors(file.id)])] };
  }

  function joinSession(file, user) {
    let session = sessions.get(file.id);
    if (!session) {
      if (wopi.isActive(file.id)) throw new HttpError(409, 'EngineBusy', 'This file is open in a WOPI session');
      const head = file.versions.at(-1);
      // participants = connected now; everyone = all who joined this session (credited on save)
      session = { key: documentKey(opts.appSecret, file.id, head.id), versionId: head.id, participants: new Set(), everyone: new Set() };
      sessions.set(file.id, session);
      keys.set(session.key, file.id);
    }
    session.participants.add(user);
    session.everyone.add(user);
    return session;
  }

  function editorConfig(file, session, user) {
    const format = formatOf(file.ext);
    const mode = format.mode;
    const t = signDownloadToken(opts.appSecret, { fileId: file.id, versionId: session.versionId });
    return {
      documentType: format.kind,
      document: {
        fileType: file.ext,
        key: session.key,
        title: file.name,
        url: `${opts.appInternalUrl}/files/${file.id}/content?t=${encodeURIComponent(t)}`,
        permissions: { edit: mode === 'edit', download: false, print: false, fillForms: true },
      },
      editorConfig: {
        mode,
        callbackUrl: `${opts.appInternalUrl}/onlyoffice/callback`,
        user: { id: user, name: user[0].toUpperCase() + user.slice(1) },
        coEditing: { mode: 'fast', change: false },
        customization: { forcesave: true },
      },
    };
  }

  async function verifyCallback(req) {
    const header = req.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : req.body?.token;
    if (typeof token !== 'string') throw new HttpError(401, 'InvalidCallbackToken', 'Missing callback token');
    try {
      const { payload } = await jwtVerify(token, enc(opts.dsJwtSecret), { algorithms: ['HS256'] });
      return header ? payload.payload ?? payload : payload; // header tokens wrap the body in `payload`
    } catch {
      throw new HttpError(401, 'InvalidCallbackToken', 'Invalid callback token');
    }
  }

  async function handleStatus(fileId, body, log) {
    const session = sessions.get(fileId);
    const isCurrent = session?.key === body.key;
    switch (body.status) {
      case STATUS.EDITING:
        if (isCurrent && Array.isArray(body.users)) {
          session.participants = new Set(body.users.map(String));
          for (const u of session.participants) session.everyone.add(u);
        }
        return;
      case STATUS.READY:
      case STATUS.FORCE_SAVE: {
        const bytes = await download(body.url);
        const kind = body.status === STATUS.READY ? 'milestone' : 'checkpoint';
        // ONLYOFFICE's status-2/6 `users` names only the last editor, so credit everyone who joined.
        const reported = Array.isArray(body.users) ? body.users.map(String) : [];
        const participants = [...new Set([...(isCurrent ? session.everyone : []), ...reported])];
        const { created } = await store.addVersion(fileId, bytes, { kind, participants, documentKey: body.key });
        log.info({ fileId, kind, created }, 'save committed');
        if (body.status === STATUS.READY && isCurrent) sessions.delete(fileId);
        return;
      }
      case STATUS.CLOSED:
        if (isCurrent) sessions.delete(fileId);
        return;
      default:
        log.error({ fileId, status: body.status }, 'document server reported a save error');
    }
  }

  async function download(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new HttpError(400, 'UntrustedDownloadHost', 'Download url is not a valid URL');
    }
    const trusted = [new URL(opts.dsPublicUrl).host, new URL(opts.dsInternalUrl).host];
    if (!['http:', 'https:'].includes(url.protocol) || !trusted.includes(url.host)) {
      throw new HttpError(400, 'UntrustedDownloadHost', 'Download url is not on the Document Server');
    }
    const internal = new URL(url.pathname + url.search, opts.dsInternalUrl); // the browser-facing host is unreachable from this container
    const res = await (opts.fetchImpl ?? fetch)(internal, { redirect: 'error', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) throw new HttpError(500, 'SaveFailed', `Document Server download failed (${res.status})`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_UPLOAD_BYTES) throw new HttpError(500, 'SaveFailed', 'Saved file too large');
    return bytes;
  }

  return app;
}

function loggerOptions() {
  // Never log tokens, the callback url or query strings (SPEC AC-16).
  return {
    redact: ['req.headers.authorization'],
    serializers: { req: (req) => ({ method: req.method, url: req.url.split('?')[0] }) },
  };
}
