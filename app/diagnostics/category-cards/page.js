import { CategoryDiscoveryLanding } from "@/components/DiscoveryFacetPages";
import { getTargetedPublicCategorySeriesPage } from "@/lib/targeted-category-series-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DiagnosticCategoryCardsPage() {
  const result = await getTargetedPublicCategorySeriesPage("ガシャポン", { page: 1, pageSize: 60 });
  if (!result) return <main><h1>Category cards diagnostic missing</h1></main>;
  return <CategoryDiscoveryLanding facet={result.facet} items={result.items} page={result} />;
}
