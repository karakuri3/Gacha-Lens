import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;
