import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const hasPublishableSupabaseConfig = Boolean(supabaseUrl && publishableKey);

let client;

export function getPublishableSupabaseClient() {
  if (!supabaseUrl || !publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required for public database access");
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
