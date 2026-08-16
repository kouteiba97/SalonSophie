#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

/**
 * Builds and runs the Playwright suite with **no database credentials**, deliberately.
 *
 * This exists because of what happened the first time a Supabase project was provisioned. The
 * credentials landed in `.env.local`, `next build` baked them in, and the next `npm run e2e`
 * booked an appointment — for real — into the salon's live database, under the salon's own phone
 * number. Three appointment rows and a client, written by a test suite, into production.
 *
 * The docs said "delete `.env.local` before running e2e". That was already a trap when the only
 * cost was a confusing failure; once a real database existed, a forgotten step became a write to
 * it. A instruction a human has to remember is not a safeguard, so the safeguard is here instead.
 *
 * Blanking the variables works because `@next/env` will not overwrite a key that is already set
 * in `process.env` — an empty string counts as set. It has to happen before **build**, not before
 * `next start`: `NEXT_PUBLIC_*` values are inlined into the bundles at build time, so clearing
 * them later is far too late.
 *
 * What this costs: the suite exercises the app's honest degraded mode — request-mode booking, the
 * "no database connected" console — rather than the database-backed path. That split is
 * deliberate. The database-backed path is proven in `tests/db/` against real Postgres, where it
 * can be asserted precisely and rolled back; a browser test against a live project can do neither,
 * and pays for the privilege in flakiness and production rows.
 */

const BLANKED = {
  NEXT_PUBLIC_SUPABASE_URL: '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
  // Demo mode signs you in, which would fail every signed-out assertion in staff.spec.ts.
  NEXT_PUBLIC_DEMO_DATA: '',
};

const env = { ...process.env, ...BLANKED };
const passthrough = process.argv.slice(2);

/**
 * `shell: true` is needed for `npx` on Windows, and Node warns when it is combined with a
 * separate args array because the args are concatenated rather than escaped. Passing one already
 * assembled string makes that explicit instead of accidental — everything here is either a
 * literal or an argument the developer typed themselves.
 */
function run(command) {
  const result = spawnSync(command, { stdio: 'inherit', env, shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('[e2e] building without database credentials');
run('npx next build');

console.log('[e2e] running Playwright');
run(['npx playwright test', ...passthrough].join(' '));
