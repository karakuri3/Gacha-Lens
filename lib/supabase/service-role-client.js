import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasServiceRoleSupabaseConfig = Boolean(supabaseUrl && serviceRoleKey);

let client;

export function getServiceRoleSupabaseClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server database access");
  }

  client ??= createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export const serviceRoleSupabase = hasServiceRoleSupabaseConfig
  ? getServiceRoleSupabaseClient()
  : null;
