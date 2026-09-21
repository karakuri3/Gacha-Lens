import { notFound } from "next/navigation";
import { CategoryDiscoveryLanding } from "@/components/DiscoveryFacetPages";
import { categoryDiscoveryLookupCandidates } from "@/lib/domain/category-discovery";
import { getTargetedPublicCategorySeriesPage } from "@/lib/targeted-category-series-page";

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default async function DiagnosticIsrCategoryPage({ params }) {
  const names = categoryDiscoveryLookupCandidates((await params).name);
  for (const name of names) {
    const result = await getTargetedPublicCategorySeriesPage(name, { page: 1, pageSize: 60 });
    if (result) {
      return <CategoryDiscoveryLanding facet={result.facet} items={result.items} page={result} />;
    }
  }
  notFound();
}
