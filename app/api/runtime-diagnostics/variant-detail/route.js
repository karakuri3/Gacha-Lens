import { getRelatedSeries, getSeriesBySlug } from "@/lib/series";
import {
  buildReleasedCustomerMetrics,
  customerTags,
  formatMarketEvidenceValue,
  formatSchedule,
} from "@/lib/domain/public-display-clean";
import { buildVariantDetailStructuredData } from "@/lib/domain/public-detail-structured-data";
import { absoluteSiteUrl } from "@/lib/site-metadata";
import { hasServiceRoleSupabaseConfig } from "@/lib/supabase/service-role-client";
import { variantHref } from "@/lib/variant-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TARGET_SLUG = "tarts-y901096-ディズニー-マリー";
const TARGET_NAME = "ディズニー マリー";

export async function GET(request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (!hostname.endsWith(".workers.dev")) {
    return new Response(null, { status: 404 });
  }

  const config = {
    supabaseUrlEnvPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
    serviceRoleKeyPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    serviceRoleSupabaseReady: hasServiceRoleSupabaseConfig,
    dataSourcePresent: Boolean(process.env.GACHA_DATA_SOURCE),
  };
  const stages = { config: "checked" };
  let item;

  try {
    item = await getSeriesBySlug(TARGET_SLUG);
    stages.detail = item?.name === TARGET_NAME ? "ok" : item ? "unexpected-item" : "missing";
  } catch (error) {
    return diagnosticResponse(config, stages, "detail", error);
  }

  try {
    const related = await getRelatedSeries(TARGET_SLUG, 8);
    stages.related = Array.isArray(related) ? "ok" : "unexpected-result";
  } catch (error) {
    return diagnosticResponse(config, stages, "related", error);
  }

  try {
    buildReleasedCustomerMetrics(item);
    customerTags(item, Boolean(item.is_released));
    formatMarketEvidenceValue(item.market_evidence);
    formatSchedule(item);
    JSON.stringify(item);
    stages.display = "ok";
  } catch (error) {
    return diagnosticResponse(config, stages, "display", error);
  }

  try {
    const detailUrl = absoluteSiteUrl(variantHref(item));
    buildVariantDetailStructuredData({
      name: item.name,
      description: item.summary || `${item.series_name}のラインナップ商品です。`,
      url: detailUrl,
      image: item.variant_image_url ? absoluteSiteUrl(item.variant_image_url) : undefined,
      siteUrl: absoluteSiteUrl("/"),
      breadcrumbs: [
        { name: "ホーム", url: absoluteSiteUrl("/") },
        { name: "ガチャ一覧", url: absoluteSiteUrl("/series") },
        { name: item.name, url: detailUrl },
      ],
    });
    stages.structuredData = "ok";
  } catch (error) {
    return diagnosticResponse(config, stages, "structured-data", error);
  }

  return Response.json({ status: "ok", config, stages }, { headers: noStoreHeaders() });
}

function diagnosticResponse(config, stages, failedStage, error) {
  const safeError = error && typeof error === "object"
    ? {
        name: String(error.name || "Error").slice(0, 80),
        code: typeof error.code === "string" ? error.code.slice(0, 80) : null,
        operation: typeof error.operation === "string" ? error.operation.slice(0, 80) : null,
      }
    : { name: "Error", code: null, operation: null };
  return Response.json(
    { status: "failed", config, failedStage, stages, error: safeError },
    { status: 200, headers: noStoreHeaders() }
  );
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}
