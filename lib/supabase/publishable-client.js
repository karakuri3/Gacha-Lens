import { createClient } from "@supabase/supabase-js";
import { resolveSupabasePublishableKey, resolveSupabaseUrl } from "./public-config.js";

const supabaseUrl = resolveSupabaseUrl();
const publishableKey = resolveSupabasePublishableKey();

export const hasPublishableSupabaseConfig = Boolean(supabaseUrl && publishableKey);

let client;

export function getPublishableSupabaseClient() {
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase URL and publishable key are required for public database access");
  }

  client ??= createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export const publishableSupabase = hasPublishableSupabaseConfig
  ? getPublishableSupabaseClient()
  : null;
