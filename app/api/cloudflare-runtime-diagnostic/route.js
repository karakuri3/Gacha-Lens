import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const dataSource = process.env.GACHA_DATA_SOURCE || "";

  const result = {
    config: {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasPublishableKey: Boolean(publishableKey),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      dataSourceConfigured: Boolean(dataSource),
      dataSourceIsSupabase: dataSource === "supabase",
      nodeEnv: process.env.NODE_ENV || "",
    },
    probe: { attempted: false, ok: false, errorCode: "" },
  };

  if (supabaseUrl && serviceRoleKey) {
    result.probe.attempted = true;
    try {
      const client = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { error } = await client.from("series").select("id").limit(1);
      result.probe.ok = !error;
      result.probe.errorCode = error?.code || "";
    } catch {
      result.probe.errorCode = "runtime_exception";
    }
  }

  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
