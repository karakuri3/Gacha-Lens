import { CategoryDiscoveryLanding } from "@/components/DiscoveryFacetPages";
import { categoryDiscoveryLookupCandidates } from "@/lib/domain/category-discovery";
import { getTargetedPublicCategorySeriesPage } from "@/lib/targeted-category-series-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DiagnosticDynamicCategoryPage({ params }) {
  const names = categoryDiscoveryLookupCandidates((await params).name);
  for (const name of names) {
    const result = await getTargetedPublicCategorySeriesPage(name, { page: 1, pageSize: 60 });
    if (result) return <CategoryDiscoveryLanding facet={result.facet} items={result.items} page={result} />;
  }
  return <main><h1>Dynamic category diagnostic missing</h1></main>;
}
