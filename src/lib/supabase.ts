import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Created on first use rather than at module load, so a production build does
 * not require the environment to be configured and a missing variable surfaces
 * as a clear runtime error instead of a prerender failure.
 *
 * Sessions are held in memory only. A vault that reopened after a browser
 * restart without the master password would defeat the point: the tab holding
 * the decryption key is the only place the vault is ever open.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  client = createBrowserClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  return client;
}
