/** Server-only demonstration configuration. Never log returned environment values. */
export function hostedConfiguration(input) {
  const env = { ...input };
  const required = ['DATABASE_URL', 'NEON_PROJECT_ID', 'NEON_AUTH_BASE_URL', 'NEON_AUTH_COOKIE_SECRET', 'AWS_ENDPOINT_URL_S3', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'STORAGE_BUCKET'];
  for (const key of required) if (!env[key]?.trim()) throw Error(`Configure ${key} before hosting.`);
  const origin = new URL(env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || '');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || origin.port)
    throw Error('Configure an exact HTTPS application origin.');
  const database = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || database.pathname !== '/rent2go' || decodeURIComponent(database.username) !== 'rent2go_app' || !/^ep-dawn-rain-aowtcdg5(-pooler)?\.[a-z0-9.-]+\.neon\.tech$/.test(database.hostname) || env.NEON_PROJECT_ID !== 'floral-flower-08375841')
    throw Error('Use the designated restricted Rent2Go database connection.');
  if (env.STORAGE_DRIVER !== 's3') throw Error('Hosted evidence requires durable S3 storage.');
  if (new URL(env.NEON_AUTH_BASE_URL).protocol !== 'https:' || new URL(env.AWS_ENDPOINT_URL_S3).protocol !== 'https:' || env.NEON_AUTH_COOKIE_SECRET.length < 32)
    throw Error('Configure secure authentication and storage endpoints.');
  if (env.PAYMONGO_ENABLED !== 'true' || env.PAYMONGO_MODE !== 'test' || env.PAYMONGO_LIVE_ENABLED !== 'false' || !/^sk_test_[A-Za-z0-9]{12,}$/.test(env.PAYMONGO_SECRET_KEY || ''))
    throw Error('The public demonstration requires PayMongo test credentials and disabled live payments.');
  if (env.EMAIL_SEND_ENABLED === 'true') throw Error('General notification dispatch needs a separately reviewed hosted sender.');
  const port = env.PORT || '10000';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw Error('Configure a valid HTTP port.');
  // Migration/owner credentials are never needed by the running application.
  for (const key of ['MIGRATION_DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_RUNTIME_DATABASE_URL']) delete env[key];
  return { ...env, NODE_ENV: 'production', APP_ORIGIN: origin.origin, PORT: String(Number(port)), LOCAL_DEMO_LOOPBACK_ALIASES: 'false', BOOKING_HOLD_WORKER_ENABLED: 'true', PAYMONGO_WORKER_ENABLED: 'true' };
}
