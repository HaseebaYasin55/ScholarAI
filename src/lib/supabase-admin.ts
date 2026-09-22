import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service-role key. Bypasses RLS so cron
 * jobs (which have no browser auth context) can read and record data across
 * all users. Never import this from client components.
 *
 * Lazily initialized so routes stay import-safe during builds/previews where
 * the service-role secret is not present; the client is only constructed when
 * a cron handler actually runs.
 */
let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase service-role environment variables are missing — cron jobs require them.",
    );
  }
  client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return client;
}