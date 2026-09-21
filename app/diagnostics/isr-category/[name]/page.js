import { notFound } from "next/navigation";
import { CategoryDiscoveryLanding } from "@/components/DiscoveryFacetPages";
import { categoryDiscoveryLookupCandidates } from "@/lib/domain/category-discovery";
import { effectiveReleaseState } from "@/lib/domain/release-state";
import { serviceRoleSupabase } from "@/lib/supabase/service-role-client";

export const revalidate = 300;
export const dynamicParams = true;

const SERIES_SELECT = "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,created_at,updated_at";
const PUBLIC_VARIANT_RELATION = "variants!inner(id)";

export function generateStaticParams() {
  return [];
}

export default async function DiagnosticIsrCategoryPage({ params }) {
  const names = categoryDiscoveryLookupCandidates((await params).name);
  for (const name of names) {
    const result = await readUncachedCategoryPage(name);
    if (result) {
      return <CategoryDiscoveryLanding facet={result.facet} items={result.items} page={result} />;
    }
  }
  notFound();
}

async function readUncachedCategoryPage(category) {
  if (!serviceRoleSupabase) throw new Error("Supabase client is required");

  const countResult = await applyPublicVariantRelationFilter(
    serviceRoleSupabase
      .from("series")
      .select(`id,${PUBLIC_VARIANT_RELATION}`, { count: "exact", head: true })
      .eq("category", category)
  );
  if (countResult.error) throw new Error(`Diagnostic category count failed: ${countResult.error.message}`);

  const total = countResult.count ?? 0;
  if (total === 0) return null;

  const pageResult = await applyPublicVariantRelationFilter(
    serviceRoleSupabase
      .from("series")
      .select(`${SERIES_SELECT},${PUBLIC_VARIANT_RELATION}`)
      .eq("category", category)
  )
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(0, 59);

  if (pageResult.error) throw new Error(`Diagnostic category page failed: ${pageResult.error.message}`);

  const items = (pageResult.data ?? []).map(toCategorySeriesSummary);
  return {
    items,
    total,
    page: 1,
    pageSize: 60,
    totalPages: Math.max(1, Math.ceil(total / 60)),
    facet: {
      name: category,
      filter_value: category,
      series_count: total,
      variant_count: items.reduce((count, item) => count + Number(item.variant_count || 0), 0),
    },
  };
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

function toCategorySeriesSummary(row = {}) {
  const { variants = [], ...series } = row;
  const released = effectiveReleaseState(series);
  return {
    ...series,
    series_id: series.id,
    series_slug: series.slug,
    series_name: series.name,
    entity_type: "series",
    variant_type: "series",
    variant_count: variants.length,
    lineup_count: variants.length,
    imageUrl: series.image_url || "",
    image_scope: "series",
    schedule_month: series.release_month,
    schedule_week: series.release_week,
    releaseDate: series.release_date,
    is_released: released,
    isReleased: released,
    officialUrl: series.official_url,
  };
}
