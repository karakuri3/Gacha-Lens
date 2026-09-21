import { getTargetedPublicCategorySeriesPage } from "@/lib/targeted-category-series-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DiagnosticCategoryMinimalPage() {
  const result = await getTargetedPublicCategorySeriesPage("ガシャポン", { page: 1, pageSize: 60 });

  return (
    <main>
      <h1>Category minimal diagnostic</h1>
      <p>{result?.facet?.name || "missing"}</p>
      <p>{result?.items?.length ?? 0} items</p>
      <p>{result?.total ?? 0} total</p>
    </main>
  );
}
