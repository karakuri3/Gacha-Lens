const SCHEMA_CONTEXT = "https://schema.org";

export function buildVariantDetailStructuredData(input = {}) {
  const page = {
    "@context": SCHEMA_CONTEXT,
    "@type": "ItemPage",
    "@id": `${input.url}#item-page`,
    name: input.name,
    description: input.description,
    url: input.url,
    image: input.image ? [input.image] : undefined,
    isPartOf: websiteReference(input.siteUrl),
  };

  return [page, buildBreadcrumbList(input.breadcrumbs)];
}

export function buildParentSeriesStructuredData(input = {}) {
  const itemListId = `${input.url}#lineup`;
  const collection = {
    "@context": SCHEMA_CONTEXT,
    "@type": "CollectionPage",
    "@id": `${input.url}#collection-page`,
    name: input.name,
    description: input.description,
    url: input.url,
    image: input.image ? [input.image] : undefined,
    isPartOf: websiteReference(input.siteUrl),
    mainEntity: { "@id": itemListId },
  };
  const itemList = {
    "@context": SCHEMA_CONTEXT,
    "@type": "ItemList",
    "@id": itemListId,
    name: `${input.name}の単品ラインナップ`,
    numberOfItems: input.items?.length ?? 0,
    itemListElement: (input.items ?? []).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };

  return [collection, itemList, buildBreadcrumbList(input.breadcrumbs)];
}

function buildBreadcrumbList(items = []) {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function websiteReference(siteUrl) {
  return {
    "@type": "WebSite",
    "@id": `${siteUrl}#website`,
    name: "Gacha Lens",
    url: siteUrl,
  };
}
