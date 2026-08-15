import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for public catalogue reads.
 *
 * Uses the anon key deliberately. The public site reads exactly what an anonymous visitor is
 * allowed to read, and RLS decides what that is — so a policy mistake shows up here rather than
 * being masked by a privileged key. The service-role key must never appear in this path
 * (non-negotiable #7: no secrets in client bundles, and a server route that over-fetches is the
 * usual way one leaks).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Whether a database is configured at all. Phase 1 ran without one and must keep working. */
export const isDatabaseConfigured = Boolean(url && anonKey);

let cached: SupabaseClient | null = null;

/**
 * Deliberately untyped for now.
 *
 * `src/lib/supabase/types.ts` is hand-written because no project exists to generate from, and an
 * approximate `Database` generic does not satisfy supabase-js's schema contract — every query
 * and RPC then infers as `never`, which is worse than no typing at all. Result shapes are stated
 * explicitly at each call site instead, using the same row interfaces.
 *
 * Once `supabase gen types typescript` produces the real file, restore the generic here and the
 * explicit `.returns<T>()` calls become redundant. Until then table and function names are not
 * checked at compile time — the schema tests are what catch a rename.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  if (!isDatabaseConfigured) return null;
  if (cached) return cached;

  cached = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export interface RpcResponse<T> {
  data: T | null;
  error: { message: string } | null;
}

/**
 * Calls a Postgres function with an explicit result type.
 *
 * The single place the untyped client is cast. supabase-js infers RPC argument and return types
 * from the `Database` generic, and without a generated one it collapses to `undefined` — so the
 * cast lives here, once, rather than at four call sites. Delete this helper when generated types
 * land; `client.rpc(...)` will type itself.
 */
export async function callRpc<T>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResponse<T>> {
  const untyped = client as unknown as {
    rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResponse<T>>;
  };
  return untyped.rpc(fn, args);
}
