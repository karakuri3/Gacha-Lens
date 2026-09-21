import { CategoryDiscoveryLanding } from "@/components/DiscoveryFacetPages";
import { categoryDiscoveryLookupCandidates } from "@/lib/domain/category-discovery";
import { getTargetedPublicCategorySeriesPage } from "@/lib/targeted-category-series-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Category diagnostic | Gacha Lens",
  description: "Category metadata diagnostic",
};

export default async function DiagnosticDynamicCategoryStaticMetaPage({ params }) {
  const names = categoryDiscoveryLookupCandidates((await params).name);
  for (const name of names) {
    const result = await getTargetedPublicCategorySeriesPage(name, { page: 1, pageSize: 60 });
    if (result) return <CategoryDiscoveryLanding facet={result.facet} items={result.items} page={result} />;
  }
  return <main><h1>Dynamic category static metadata diagnostic missing</h1></main>;
}
