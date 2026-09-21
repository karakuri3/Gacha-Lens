import { serviceRoleSupabase } from "@/lib/supabase/service-role-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PUBLIC_VARIANT_RELATION = "variants!inner(id)";
const SERIES_SELECT = "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,created_at,updated_at";

export async function GET(request) {
  if (!serviceRoleSupabase) {
    return Response.json({ ok: false, error: "supabase_unavailable" }, { status: 503, headers: noStoreHeaders() });
  }

  const url = new URL(request.url);
  const category = String(url.searchParams.get("category") || "ガシャポン").trim().slice(0, 120);
  const startedAt = performance.now();

  const control = await timed(async () => (
    serviceRoleSupabase
      .from("series")
      .select("id")
      .order("id", { ascending: true })
      .limit(1)
  ));

  const count = await timed(async () => (
    applyPublicVariantRelationFilter(
      serviceRoleSupabase
        .from("series")
        .select(`id,${PUBLIC_VARIANT_RELATION}`, { count: "exact", head: true })
        .eq("category", category)
    )
  ));

  const page = await timed(async () => (
    applyPublicVariantRelationFilter(
      serviceRoleSupabase
        .from("series")
        .select(`${SERIES_SELECT},${PUBLIC_VARIANT_RELATION}`)
        .eq("category", category)
    )
      .order("release_date", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(0, 59)
  ));

  return Response.json({
    ok: control.ok && count.ok && page.ok,
    category,
    control_ms: control.ms,
    count_ms: count.ms,
    page_ms: page.ms,
    total_ms: roundMs(performance.now() - startedAt),
    count: count.ok ? (count.value.count ?? null) : null,
    page_rows: page.ok ? (page.value.data?.length ?? 0) : null,
    errors: {
      control: control.error,
      count: count.error,
      page: page.error,
    },
  }, {
    status: control.ok && count.ok && page.ok ? 200 : 503,
    headers: noStoreHeaders(),
  });
}

async function timed(operation) {
  const start = performance.now();
  try {
    const value = await operation();
    if (value?.error) {
      return {
        ok: false,
        ms: roundMs(performance.now() - start),
        value,
        error: safeError(value.error),
      };
    }
    return {
      ok: true,
      ms: roundMs(performance.now() - start),
      value,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      ms: roundMs(performance.now() - start),
      value: null,
      error: safeError(error),
    };
  }
}

function applyPublicVariantRelationFilter(query) {
  return query
    .or("variant_type.is.null,variant_type.neq.provisional", { referencedTable: "variants" })
    .not("variants.series_id", "is", null)
    .not("variants.slug", "is", null)
    .neq("variants.slug", "")
    .not("variants.name", "is", null)
    .neq("variants.name", "");
}

function safeError(error) {
  if (!error) return null;
  return {
    code: String(error.code || ""),
    name: String(error.name || ""),
    message: String(error.message || "").slice(0, 240),
  };
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
  };
}
