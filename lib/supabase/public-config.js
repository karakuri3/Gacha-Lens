// These defaults are public deployment coordinates, not credentials. Environment values win so alternate projects and key rotation remain supported.
export const DEFAULT_SUPABASE_URL = "https://vxbrnvfhmzcxehuuzzum.supabase.co";
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_a-KlXpHraDY84j6mh-wQyA_5kxMlQpM";

export function resolveSupabaseUrl(env = process.env) {
  return String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
}

export function resolveSupabasePublishableKey(env = process.env) {
  return String(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY).trim();
}
