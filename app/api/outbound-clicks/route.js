import { hasSupabaseConfig, supabase } from "@/lib/supabase";

const PROVIDERS = new Set(["mercari", "yahoo", "rakuten", "amazon", "official"]);

export async function POST(request) {
  if (!hasSupabaseConfig || !process.env.SUPABASE_SERVICE_ROLE_KEY) return new Response(null, { status: 204 });
  const body = await request.json().catch(() => ({}));
  const provider = String(body.provider || "");
  const variantId = String(body.variantId || "").slice(0, 220);
  const pagePath = String(body.pagePath || "").slice(0, 500);
  if (!PROVIDERS.has(provider) || !variantId) return Response.json({ error: "Invalid event" }, { status: 400 });

  const { error } = await supabase.from("outbound_clicks").insert({
    variant_id: variantId,
    provider,
    page_path: pagePath,
  });
  if (error) {
    console.warn("[outbound-clicks] event not stored", { code: error.code, message: error.message });
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 201 });
}
