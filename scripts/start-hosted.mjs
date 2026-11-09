import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { hostedConfiguration } from './lib/hosted-config.mjs';
const require = createRequire(import.meta.url);

/** One free web instance supervises this application's two leased workers.
 * Database leases still prevent concurrent financial processing across hosts. */
export function startHosted(env, options = {}) {
  const launch = options.spawn || spawn, children = new Set(), retries = new Set();
  let stopping = false, deadline;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const timer of retries) clearTimeout(timer);
    for (const child of children) child.kill('SIGTERM');
    deadline = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, 25000);
    deadline.unref();
  };
  const run = (name, args, worker = false) => {
    if (stopping) return;
    const child = launch(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
    children.add(child);
    let ended = false;
    const onEnd = () => {
      if (ended) return;
      ended = true;
      children.delete(child);
      if (stopping) { if (!children.size) clearTimeout(deadline); return; }
      console.error(`${name} stopped.`);
      if (!worker) { stop(1); return; }
      // Covers a stale host's lease during a rolling deploy, without stealing it.
      const timer = setTimeout(() => { retries.delete(timer); run(name, args, true); }, 15000);
      retries.add(timer);
    };
    child.once('error', onEnd);
    child.once('exit', onEnd);
  };
  run('Website', [require.resolve('next/dist/bin/next'), 'start', '--hostname', '0.0.0.0', '--port', env.PORT]);
  run('Booking expiry worker', ['--import', 'tsx', 'scripts/expire-booking-holds.ts', '--enable'], true);
  run('Payment status worker', ['--import', 'tsx', 'scripts/process-paymongo.ts', '--enable'], true);
  return { stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const service = startHosted(hostedConfiguration(process.env));
    process.once('SIGTERM', () => service.stop());
    process.once('SIGINT', () => service.stop());
  } catch {
    console.error('Hosted startup stopped. Review the required server configuration; no credentials were logged.');
    process.exitCode = 1;
  }
}
