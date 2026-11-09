import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { hostedConfiguration } from '../../scripts/lib/hosted-config.mjs';
import { startHosted } from '../../scripts/start-hosted.mjs';
const previousExitCode = process.exitCode;
const fixture = () => ({
  RENDER_EXTERNAL_URL: 'https://rent2go-example.onrender.com',
  DATABASE_URL: 'postgresql://rent2go_app:fixture@ep-dawn-rain-aowtcdg5.example.neon.tech/rent2go?sslmode=require',
  NEON_PROJECT_ID: 'floral-flower-08375841', NEON_AUTH_BASE_URL: 'https://auth.example.test', NEON_AUTH_COOKIE_SECRET: 'x'.repeat(40),
  STORAGE_DRIVER: 's3', AWS_ENDPOINT_URL_S3: 'https://storage.example.test', AWS_REGION: 'ap-southeast-1', AWS_ACCESS_KEY_ID: 'fixture', AWS_SECRET_ACCESS_KEY: 'fixture', STORAGE_BUCKET: 'private',
  PAYMONGO_ENABLED: 'true', PAYMONGO_MODE: 'test', PAYMONGO_LIVE_ENABLED: 'false', PAYMONGO_SECRET_KEY: 'sk_test_hostingfixture123', EMAIL_SEND_ENABLED: 'false',
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); process.exitCode = previousExitCode; });
it('uses the hosted HTTPS origin and dynamic port while stripping owner/test credentials', () => {
  const input = { ...fixture(), PORT: '10001', MIGRATION_DATABASE_URL: 'private-owner', TEST_DATABASE_URL: 'private-test' };
  const env = hostedConfiguration(input);
  expect(env).toMatchObject({ APP_ORIGIN: input.RENDER_EXTERNAL_URL, PORT: '10001', NODE_ENV: 'production', LOCAL_DEMO_LOOPBACK_ALIASES: 'false', BOOKING_HOLD_WORKER_ENABLED: 'true' });
  expect(env).not.toHaveProperty('MIGRATION_DATABASE_URL'); expect(env).not.toHaveProperty('TEST_DATABASE_URL');
  expect(input).toHaveProperty('MIGRATION_DATABASE_URL');
});
it('rejects unsafe public origins, ephemeral storage, elevated database roles and real-payment activation', () => {
  for (const change of [{ APP_ORIGIN: 'http://localhost:3100' }, { APP_ORIGIN: 'https://example.test/path' }, { APP_ORIGIN: 'https://private@example.test' }, { STORAGE_DRIVER: 'local' }, { DATABASE_URL: fixture().DATABASE_URL.replace('rent2go_app', 'rent2go_owner') }, { DATABASE_URL: fixture().DATABASE_URL.replace('/rent2go?', '/rent2go_test?') }, { PAYMONGO_MODE: 'live' }, { PAYMONGO_LIVE_ENABLED: 'true' }, { EMAIL_SEND_ENABLED: 'true' }, { PORT: '65536' }])
    expect(() => hostedConfiguration({ ...fixture(), ...change })).toThrow();
});
it('restarts an exited leased worker once, then stops every child when the web process exits', () => {
  vi.useFakeTimers(); vi.spyOn(console, 'error').mockImplementation(() => {});
  const spawned = [], launch = vi.fn(() => { const child = new EventEmitter(); child.kill = vi.fn(); spawned.push(child); return child; });
  const service = startHosted(hostedConfiguration(fixture()), { spawn: launch });
  expect(launch).toHaveBeenCalledTimes(3);
  spawned[1].emit('error', Error('fixture')); spawned[1].emit('exit', 1);
  vi.advanceTimersByTime(15000); expect(launch).toHaveBeenCalledTimes(4);
  expect(launch.mock.calls[3][1]).toContain('scripts/expire-booking-holds.ts');
  spawned[0].emit('exit', 1); expect(process.exitCode).toBe(1);
  expect(spawned[2].kill).toHaveBeenCalledWith('SIGTERM'); expect(spawned[3].kill).toHaveBeenCalledWith('SIGTERM');
  vi.advanceTimersByTime(30000); expect(launch).toHaveBeenCalledTimes(4);
  service.stop(); vi.clearAllTimers();
});
