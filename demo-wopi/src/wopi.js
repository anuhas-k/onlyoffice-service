// WOPI host: the same files, versions and demo users as the ONLYOFFICE-protocol routes, behind the WOPI wire format.
// SPIKE — never merged. Operations follow the verification spike in docs/decisions/002-documentserver-verification.md
// and the Microsoft WOPI REST / proof-key / postMessage docs plus the ONLYOFFICE WOPI pages.
import { signAccessToken, verifyAccessToken } from './wopi-tokens.js';
import { FORMATS, HttpError, MAX_UPLOAD_BYTES, hasMagic } from './common.js';
import { createDsCommand, DsCommandError } from './ds-command.js';
import { parseProofKeys, verifyProof } from './wopi-proof.js';

const LOCK_TTL_MS = 30 * 60_000; // the WOPI standard lease
const MAX_LOCK_ID_LENGTH = 1024; // SupportsExtendedLockLength
const DISCOVERY_TTL_MS = 5 * 60_000;
const DISCOVERY_TIMEOUT_MS = 5_000;
const POLL_MS = 20;
const NOT_SUPPORTED = new Set(['PUT_RELATIVE', 'RENAME_FILE', 'DELETE_FILE', 'PUT_USER_INFO', 'GET_RESTRICTED_LINK', 'REVOKE_RESTRICTED_LINK']);
const USER_ID = /^[A-Za-z0-9]+$/;
// Tunables (tests shrink them). appPublicUrl has no default on purpose: config.js always supplies it.
const DEFAULTS = { leaveGraceMs: 3000, closeWaitMs: 8000, presenceTtlMs: 90_000, sweepMs: 15_000, wopiProof: 'log', autoCheckpointMs: 30_000 };

const decodeEntities = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const displayName = (user) => user[0].toUpperCase() + user.slice(1);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Parse WOPI discovery XML into Map("ext:action" → urlsrc). Handles raw '>' inside quoted attribute values. */
export function parseDiscovery(xml) {
  const actions = new Map();
  for (const tag of xml.matchAll(/<action\s+((?:[^>"]|"[^"]*")*?)\/?>/g)) {
    const attrs = Object.fromEntries([...tag[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], decodeEntities(m[2])]));
    const key = `${attrs.ext}:${attrs.name}`;
    if (attrs.ext && attrs.name && attrs.urlsrc && !actions.has(key)) actions.set(key, attrs.urlsrc);
  }
  return actions;
}

export function createWopi({ store, opts: given, isOnlyofficeActive }) {
  const opts = { ...DEFAULTS, ...Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined)) };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const dsCommand = createDsCommand({ dsInternalUrl: opts.dsInternalUrl, dsJwtSecret: opts.dsJwtSecret, fetchImpl });
  // shortcut: per-file state lives in memory, so a restart drops locks and presence, demo only — move to the lock table (TASK-012) for real use.
  const files = new Map(); // fileId → { lock: {id, expiresAt, saved, closeAttempted}|null, everyone: Set, presence: Map(user → expiresAt) }
  const closing = new Set();
  let discovery = null;
  let log = { info() {}, warn() {}, error() {} };
  let proofNoKeysLogged = false;

  const stateOf = (fileId) => {
    if (!files.has(fileId)) files.set(fileId, { lock: null, everyone: new Set(), presence: new Map() });
    return files.get(fileId);
  };

  function liveLock(state) {
    if (state.lock && state.lock.expiresAt < Date.now()) endEpoch(state); // lease ran out: the epoch ends without a milestone
    return state.lock;
  }

  /** Clears the lock and everything scoped to it; returns whether a save happened under that lock. */
  function endEpoch(state) {
    const saved = Boolean(state.lock?.saved);
    state.lock = null;
    state.everyone = new Set();
    state.presence = new Map();
    state.lastCheckpointAt = 0;
    return saved;
  }

  function touchPresence(state, user) {
    state.presence.set(user, Date.now() + opts.presenceTtlMs);
    state.everyone.add(user);
    if (state.lock) state.lock.closeAttempted = false; // someone is back: the sweeper may act again later
  }

  function editors(fileId) {
    const state = files.get(fileId);
    if (!state) return [];
    const now = Date.now();
    return [...state.presence].filter(([, expiresAt]) => expiresAt > now).map(([user]) => user);
  }

  const isActive = (fileId) => editors(fileId).length > 0 || Boolean(files.get(fileId) && liveLock(files.get(fileId)));

  // ── discovery ──────────────────────────────────────────────────────────────

  async function discoveryData() {
    if (discovery && Date.now() - discovery.at < DISCOVERY_TTL_MS) return discovery;
    try {
      const res = await fetchImpl(new URL('/hosting/discovery', opts.dsInternalUrl), { redirect: 'error', signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      discovery = { at: Date.now(), actions: parseDiscovery(xml), proofKeys: parseProofKeys(xml) };
      return discovery;
    } catch {
      throw new HttpError(502, 'WopiDiscoveryUnavailable', 'The Document Server WOPI discovery is not reachable');
    }
  }

  async function openSession(file, user) {
    if (isOnlyofficeActive(file.id)) throw new HttpError(409, 'EngineBusy', 'This file is open in an ONLYOFFICE-protocol session');
    const { actions } = await discoveryData();
    const wantsEdit = FORMATS[file.ext].editable;
    const editSrc = wantsEdit ? actions.get(`${file.ext}:edit`) : undefined;
    const urlsrc = editSrc ?? actions.get(`${file.ext}:view`);
    if (!urlsrc) throw new HttpError(400, 'UnsupportedForWopi', `The Document Server offers no WOPI action for .${file.ext}`);
    const canWrite = Boolean(editSrc);
    const parsed = new URL(urlsrc.replace(/<[^>]*>/g, ''));
    const editorUrl = new URL(parsed.pathname + parsed.search, opts.dsPublicUrl); // the browser-facing host, not the container one
    editorUrl.searchParams.set('wopisrc', `${opts.appInternalUrl}/wopi/files/${file.id}`);
    const { token, expiresAt } = signAccessToken(opts.appSecret, { fileId: file.id, user, canWrite });
    touchPresence(stateOf(file.id), user);
    return {
      engine: 'wopi',
      fileId: file.id,
      mode: canWrite ? 'edit' : 'view',
      editorUrl: editorUrl.toString(),
      formFields: { access_token: token, access_token_ttl: String(expiresAt) },
      heartbeatMs: Math.max(1000, Math.floor(opts.presenceTtlMs / 3)),
      title: file.name,
      user: { id: user, name: displayName(user) },
    };
  }

  // ── auth + proof ───────────────────────────────────────────────────────────

  // WOPI mandates access_token in the query string (api-conventions prefers a header); the Bearer form is accepted too.
  function wopiTokenOf(req) {
    const header = req.headers.authorization;
    return req.query.access_token ?? (typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined);
  }

  // The demo page's own calls carry the token in a JSON body: navigator.sendBeacon cannot set headers, and a body stays out of URLs and logs.
  const bodyTokenOf = (req) => (typeof req.body === 'object' && req.body !== null ? req.body.access_token : undefined);

  function authorize(req, { write = false, tokenOf = wopiTokenOf } = {}) {
    const claims = verifyAccessToken(opts.appSecret, tokenOf(req), req.params.id);
    const file = claims && store.get(req.params.id);
    if (!claims || !file || (write && !claims.canWrite)) throw new HttpError(401, 'InvalidAccessToken', 'Access token invalid, expired or not permitted');
    return { claims, file, state: stateOf(file.id) };
  }

  /** X-WOPI-Proof validation. `log` reports mismatches without rejecting (until a live run confirms the construction). */
  async function checkProof(req) {
    if (opts.wopiProof === 'off') return;
    let keys = null;
    try {
      keys = (await discoveryData()).proofKeys;
    } catch (err) {
      if (!(err instanceof HttpError)) throw err; // discovery outage: handled below by mode
    }
    const result = verifyProof({
      keys,
      accessToken: wopiTokenOf(req),
      url: `${opts.appInternalUrl}${req.url}`, // the URL exactly as the Document Server requested it
      proof: req.headers['x-wopi-proof'],
      proofOld: req.headers['x-wopi-proofold'],
      timestamp: req.headers['x-wopi-timestamp'],
    });
    if (result.ok) return;
    if (opts.wopiProof === 'enforce') {
      log.warn({ reason: result.reason }, 'wopi proof rejected');
      throw new HttpError(500, 'InvalidProof', 'Proof validation failed'); // the spec asks for 500, not 401
    }
    if (result.reason === 'no-keys') {
      if (!proofNoKeysLogged) log.info('wopi proof: discovery published no proof keys; nothing to check');
      proofNoKeysLogged = true;
      return;
    }
    log.warn({ reason: result.reason }, 'wopi proof mismatch (log mode, call allowed)');
  }

  const conflict = (reply, currentLock, reason) =>
    reply.code(409).header('X-WOPI-Lock', currentLock ?? '').header('X-WOPI-LockFailureReason', reason).send();

  // ── WOPI operations ────────────────────────────────────────────────────────

  function checkFileInfo(req) {
    const { claims, file, state } = authorize(req);
    touchPresence(state, claims.user);
    const head = file.versions.at(-1);
    return {
      BaseFileName: file.name,
      BreadcrumbDocName: file.name,
      BreadcrumbBrandName: 'Editing demo',
      FileExtension: `.${file.ext}`,
      OwnerId: file.createdBy,
      Size: head.size,
      UserId: claims.user,
      UserFriendlyName: displayName(claims.user),
      IsAnonymousUser: false,
      Version: head.id,
      LastModifiedTime: head.createdAt,
      UserCanWrite: claims.canWrite,
      ReadOnly: !claims.canWrite,
      UserCanRename: false,
      UserCanNotWriteRelative: true,
      SupportsUpdate: true,
      SupportsLocks: true,
      SupportsGetLock: true,
      SupportsExtendedLockLength: true,
      SupportsRename: false,
      DisablePrint: true,
      HidePrintOption: true,
      DisableExport: true, // not in ONLYOFFICE's documented property list — kept for the Microsoft clients, effect unverified
      // Close detection: the editor posts UI_Close to the host page (PostMessageOrigin) instead of navigating away.
      PostMessageOrigin: new URL(opts.appPublicUrl).origin,
      ClosePostMessage: true,
      CloseUrl: new URL('/', opts.appPublicUrl).toString(),
    };
  }

  async function getFile(req, reply) {
    const { file } = authorize(req);
    const head = file.versions.at(-1);
    const bytes = await store.readVersion(file.id, head.id);
    return reply.type('application/octet-stream').header('X-WOPI-ItemVersion', head.id).send(bytes);
  }

  /** X-WOPI-Editors lists who contributed to this save; fall back to everyone who joined when it is absent or malformed. */
  function contributors(req, state) {
    const listed = String(req.headers['x-wopi-editors'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return listed.length > 0 && listed.every((u) => USER_ID.test(u)) ? listed : [...state.everyone];
  }

  async function putFile(req, reply) {
    const { claims, file, state } = authorize(req, { write: true });
    if (req.headers['x-wopi-override'] !== 'PUT') throw new HttpError(400, 'ValidationError', 'X-WOPI-Override must be PUT');
    const lock = liveLock(state);
    if (!lock) return conflict(reply, '', 'file is not locked');
    if (req.headers['x-wopi-lock'] !== lock.id) return conflict(reply, lock.id, 'lock mismatch');
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!hasMagic(file.ext, bytes)) throw new HttpError(400, 'UnsupportedFormat', `Saved bytes are not a valid .${file.ext}`);
    touchPresence(state, claims.user);
    const { version, created } = await store.addVersion(file.id, bytes, { kind: 'checkpoint', participants: contributors(req, state), documentKey: `wopi:${lock.id}` });
    if (created) lock.saved = true;
    return reply.header('X-WOPI-ItemVersion', version.id).send();
  }

  async function unlock(file, state, reply, lockId) {
    const lock = liveLock(state);
    if (!lock) return conflict(reply, '', 'file is not locked');
    if (lock.id !== lockId) return conflict(reply, lock.id, 'lock mismatch');
    if (endEpoch(state)) await store.promote(file.id, file.versions.at(-1).id, 'milestone');
    return reply.send();
  }

  async function lockOperation(req, reply) {
    const { file, state } = authorize(req, { write: true });
    const override = req.headers['x-wopi-override'];
    const lockId = req.headers['x-wopi-lock'];
    if (NOT_SUPPORTED.has(override)) return reply.code(501).send();
    if (override === 'GET_LOCK') return reply.header('X-WOPI-Lock', liveLock(state)?.id ?? '').send();
    if (!['LOCK', 'UNLOCK', 'REFRESH_LOCK', 'UNLOCK_AND_RELOCK'].includes(override)) throw new HttpError(400, 'ValidationError', 'Unknown X-WOPI-Override');
    if (typeof lockId !== 'string' || lockId === '' || lockId.length > MAX_LOCK_ID_LENGTH) throw new HttpError(400, 'ValidationError', `X-WOPI-Lock is required and at most ${MAX_LOCK_ID_LENGTH} characters`);
    if (override === 'UNLOCK') return unlock(file, state, reply, lockId);
    const lock = liveLock(state);
    if (override === 'UNLOCK_AND_RELOCK') {
      if (!lock || lock.id !== req.headers['x-wopi-oldlock']) return conflict(reply, lock?.id ?? '', 'old lock mismatch');
      lock.id = lockId;
    } else if (!lock) {
      if (override === 'REFRESH_LOCK') return conflict(reply, '', 'file is not locked');
      state.lock = { id: lockId, expiresAt: 0, saved: false, closeAttempted: false };
    } else if (lock.id !== lockId) {
      return conflict(reply, lock.id, 'locked by another session');
    }
    state.lock.expiresAt = Date.now() + LOCK_TTL_MS;
    return reply.header('X-WOPI-ItemVersion', file.versions.at(-1).id).send();
  }

  // ── closing a session ──────────────────────────────────────────────────────
  // WOPI has no "editor left" call: the Document Server keeps the file open (and locked) long after the last
  // tab closes. The demo page therefore reports leave/heartbeat itself, and the backend ends the session with
  // the Document Server's command service: force-save, then drop (the spike saw drop → PutFile + UNLOCK).

  async function attempt(command, key, extra, label = 'close') {
    try {
      return (await dsCommand(command, key, extra)).error;
    } catch (err) {
      if (!(err instanceof DsCommandError)) throw err;
      log.warn({ command, fileId: key }, `${label}: Document Server command failed`);
      return 'unreachable';
    }
  }

  async function waitForUnlock(state, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (state.lock && Date.now() < deadline) await sleep(POLL_MS);
    return !state.lock;
  }

  async function closeSession(fileId) {
    const state = files.get(fileId);
    if (!state || closing.has(fileId)) return { closed: false };
    if (!liveLock(state)) {
      state.presence = new Map(); // opened but never locked: nothing was edited, nothing to save
      return { closed: false };
    }
    closing.add(fileId);
    try {
      const lock = state.lock;
      const users = [...state.everyone];
      const forcesave = await attempt('forcesave', fileId, {});
      const drop = await attempt('drop', fileId, { users });
      const released = await waitForUnlock(state, opts.closeWaitMs);
      let milestone = released; // UNLOCK promoted the last save itself
      if (!released) {
        // The Document Server kept the lock: label the last save the milestone ourselves, once.
        lock.closeAttempted = true;
        state.presence = new Map();
        if (lock.saved) {
          await store.promote(fileId, store.get(fileId).versions.at(-1).id, 'milestone');
          milestone = true;
        }
      }
      return { closed: true, forcesave, drop, milestone };
    } finally {
      closing.delete(fileId);
    }
  }

  function closeInBackground(fileId) {
    closeSession(fileId).catch((err) => log.error({ err: err.message, fileId }, 'close: unexpected failure'));
  }

  async function endSession(fileId) {
    const result = await closeSession(fileId);
    if (result.forcesave === 'unreachable' && result.drop === 'unreachable') {
      throw new HttpError(502, 'DocumentServerUnavailable', 'The Document Server command service is not reachable');
    }
    return result;
  }

  // `wait: true` is for the editor's own Close button: the tab is still connected, which is when the Document
  // Server's drop actually ends the session (drop does nothing for users who already disconnected).
  async function leave(req, reply) {
    const { claims, file, state } = authorize(req, { tokenOf: bodyTokenOf });
    state.presence.delete(claims.user);
    if (req.body.wait === true) {
      if (editors(file.id).length > 0) return reply.send({ closed: false });
      return reply.send(await closeSession(file.id));
    }
    const timer = setTimeout(() => {
      if (editors(file.id).length === 0) closeInBackground(file.id); // a reload re-registers within the grace period
    }, opts.leaveGraceMs);
    timer.unref();
    return reply.code(202).send();
  }

  // This Document Server does not send a PutFile when the user clicks Save (observed on 8.2.2 in WOPI mode; it saves on
  // close or when forced), so the heartbeat drives checkpoints: a throttled force-save while the file is locked.
  // The Document Server answers error 4 ("no changes") when nothing was edited, so idle files create no versions.
  function autoCheckpoint(fileId, state) {
    const lock = state.lock;
    if (opts.autoCheckpointMs <= 0 || !lock || closing.has(fileId)) return; // before LOCK the editor is still loading
    const now = Date.now();
    if (state.lastCheckpointAt && now - state.lastCheckpointAt < opts.autoCheckpointMs) return;
    state.lastCheckpointAt = now;
    attempt('forcesave', fileId, {}, 'auto-checkpoint').catch((err) => log.error({ err: err.message, fileId }, 'auto-checkpoint: unexpected failure'));
  }

  function heartbeat(req, reply) {
    const { claims, file, state } = authorize(req, { tokenOf: bodyTokenOf });
    touchPresence(state, claims.user);
    autoCheckpoint(file.id, state);
    return reply.code(204).send();
  }

  /** Backstop for a crashed tab or lost network: a locked file whose editors all stopped heartbeating gets closed. */
  function sweep() {
    for (const [fileId, state] of files) {
      const lock = liveLock(state);
      if (lock && !lock.closeAttempted && editors(fileId).length === 0 && !closing.has(fileId)) closeInBackground(fileId);
    }
  }

  async function register(app) {
    log = app.log;
    await app.register(async (scope) => {
      scope.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (req, body, done) => done(null, body));
      scope.addHook('preHandler', checkProof);
      scope.get('/wopi/files/:id', async (req) => checkFileInfo(req));
      scope.get('/wopi/files/:id/contents', getFile);
      scope.post('/wopi/files/:id/contents', putFile);
      scope.post('/wopi/files/:id', lockOperation);
    });
    // Demo-page calls, not part of WOPI; the backend wins here because only it holds the Document Server command secret.
    app.post('/wopi-sessions/:id/leave', async (req, reply) => leave(req, reply));
    app.post('/wopi-sessions/:id/heartbeat', async (req, reply) => heartbeat(req, reply));
    if (opts.sweepMs > 0) {
      const timer = setInterval(sweep, opts.sweepMs);
      timer.unref();
      app.addHook('onClose', async () => clearInterval(timer));
    }
  }

  return { register, openSession, editors, isActive, endSession };
}
