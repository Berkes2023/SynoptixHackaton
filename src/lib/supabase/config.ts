/**
 * Supabase is optional. Without these variables DeepTrace runs as a
 * browser-only demo workspace. With them, workspace routes require sign-in and
 * all data lives in Postgres behind row-level security.
 *
 * Only the project URL and the anon (publishable) key are used. Every query
 * runs as the signed-in user, so RLS is always the tenant boundary; no
 * service-role key is needed or read.
 */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export const isSupabaseConfigured = () => supabaseEnv() !== null;

/** Visitors who choose the browser-only demo while Supabase is configured. */
export const LOCAL_MODE_COOKIE = "dt-mode";
/** The organisation a signed-in user is working in. */
export const ACTIVE_ORG_COOKIE = "dt-org";
