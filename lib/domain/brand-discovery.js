import {
  discoveryFacetHref,
  discoveryFacetLookupCandidates,
  isMeaningfulDiscoveryFacetName,
  normalizeDiscoveryFacetPage,
} from "./discovery-facets.js";

export function brandDiscoveryLookupCandidates(value) {
  return discoveryFacetLookupCandidates(value).filter(isMeaningfulDiscoveryFacetName);
}

export function brandDiscoveryPageHref(name, page = 1) {
  const base = discoveryFacetHref("brand", name);
  const normalizedPage = normalizeDiscoveryFacetPage(page);
  return normalizedPage > 1 ? `${base}/page/${normalizedPage}` : base;
}

export function getLegacyBrandDiscoveryPageRedirectPath(url) {
  const candidate = url instanceof URL ? new URL(url.toString()) : new URL(String(url), "https://gachalens.com");
  if (!/^\/brands\/[^/]+$/.test(candidate.pathname) || !candidate.searchParams.has("page")) return null;

  const page = normalizeDiscoveryFacetPage(candidate.searchParams.get("page"));
  candidate.pathname = page > 1 ? `${candidate.pathname}/page/${page}` : candidate.pathname;
  candidate.searchParams.delete("page");
  return `${candidate.pathname}${candidate.search}`;
}
