export const PUBLIC_DIAGNOSTIC_PATHS = Object.freeze([
  "/api/runtime-diagnostics/release-source",
  "/api/runtime-diagnostics/public-plane",
  "/api/runtime-diagnostics/app-delegation",
]);

export const APP_OWNED_EXACT_PATHS = Object.freeze([
  "/",
  "/series",
  "/schedule",
  "/sitemap.xml",
  "/series-sitemap.xml",
  "/variant-sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/ads.txt",
  "/ranking",
  "/ranking/series",
  "/ranking/upcoming",
  "/ranking/upcoming/series",
  "/stock",
  "/restocks",
  "/favorites",
  "/categories",
  "/brands",
  "/franchises",
  "/guides",
  "/trends",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/affiliate-disclosure",
  "/operator",
  "/contact",
  "/review",
  "/review/login",
  "/review/logout",
  "/api/public-stock",
  "/api/public-variants",
  "/api/public-discovery",
  "/api/community-reports",
  "/api/import-issues",
  "/api/ops-health",
  "/api/outbound-clicks",
  "/api/runtime-diagnostics/variant-detail",
]);

export const APP_OWNED_PREFIXES = Object.freeze([
  "/series/",
  "/categories/",
  "/brands/",
  "/franchises/",
  "/guides/",
  "/variant-sitemap/",
  "/api/review/",
  "/api/ingest/",
  "/_next/",
  "/brand/",
]);

export const EXPLICITLY_REJECTED_PREFIXES = Object.freeze([
  "/__public-data/v1/",
]);

export function classifyPublicRoute(pathname) {
  const path = String(pathname || "");
  if (PUBLIC_DIAGNOSTIC_PATHS.includes(path)) return "public-diagnostic";
  if (EXPLICITLY_REJECTED_PREFIXES.some((prefix) => path.startsWith(prefix))) return "explicitly-rejected";
  if (APP_OWNED_EXACT_PATHS.includes(path) || APP_OWNED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return "app-owned";
  }
  return "explicitly-rejected";
}

// Backward-compatible exports retained for release-integrity tooling/tests.
export const PUBLIC_BOOTSTRAP_OWNED_PATHS = PUBLIC_DIAGNOSTIC_PATHS;
export const CONDITIONAL_PUBLIC_PATHS = Object.freeze(["/review"]);
export const PUBLIC_DOCUMENT_EXACT_PATHS = Object.freeze([]);
export const PLANNED_PUBLIC_DOCUMENT_PATHS = PUBLIC_DOCUMENT_EXACT_PATHS;
export function classifyPhaseA2Route(pathname) {
  const current = classifyPublicRoute(pathname);
  if (current === "public-diagnostic") return "public-owned";
  if (pathname === "/review") return "conditional";
  if (current === "app-owned") return "app-owned";
  return "explicitly-rejected";
}
