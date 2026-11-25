// Environment → app options. Fails closed and never echoes a secret value.
const MIN_SECRET_LENGTH = 32;
const DEFAULT_PORT = 3000;

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
  return {
    dsJwtSecret: secret(env, 'DS_JWT_SECRET'),
    appSecret: secret(env, 'APP_SECRET'),
    dsPublicUrl: need(env, 'DS_PUBLIC_URL'),
    dsInternalUrl: need(env, 'DS_INTERNAL_URL'),
    appInternalUrl: need(env, 'APP_INTERNAL_URL'),
    dataDir: env.DATA_DIR || '/data',
    port: Number.parseInt(env.PORT ?? '', 10) || DEFAULT_PORT,
  };
}
