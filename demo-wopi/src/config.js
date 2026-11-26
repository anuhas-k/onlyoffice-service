// Environment → app options. Fails closed and never echoes a secret value.
const MIN_SECRET_LENGTH = 32;
const DEFAULT_PORT = 3000;
const PROOF_MODES = ['off', 'log', 'enforce'];

function need(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing required setting ${name}`);
  return value;
}

function secret(env, name) {
  const value = need(env, name);
  if (value.length < MIN_SECRET_LENGTH) throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
  return value;
}

export function loadConfig(env) {
  const port = Number.parseInt(env.PORT ?? '', 10) || DEFAULT_PORT;
  const wopiProof = env.WOPI_PROOF || 'log';
  if (!PROOF_MODES.includes(wopiProof)) throw new Error(`WOPI_PROOF must be one of ${PROOF_MODES.join(', ')}`);
  return {
    dsJwtSecret: secret(env, 'DS_JWT_SECRET'),
    appSecret: secret(env, 'APP_SECRET'),
    dsPublicUrl: need(env, 'DS_PUBLIC_URL'),
    dsInternalUrl: need(env, 'DS_INTERNAL_URL'),
    appInternalUrl: need(env, 'APP_INTERNAL_URL'),
    dataDir: env.DATA_DIR || '/data',
    port,
    appPublicUrl: env.APP_PUBLIC_URL || `http://localhost:${port}`, // what the browser uses; WOPI PostMessageOrigin / CloseUrl
    wopiProof, // off | log (default: report mismatches, never reject) | enforce
  };
}
