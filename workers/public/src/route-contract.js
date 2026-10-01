export const PUBLIC_DIAGNOSTIC_PATHS = Object.freeze([
  "/api/runtime-diagnostics/release-source",
  "/api/runtime-diagnostics/public-plane",
  "/api/runtime-diagnostics/app-delegation",
]);

export const PUBLIC_DOCUMENT_EXACT_PATHS = Object.freeze([
  "/",
  "/series",
  "/schedule",
  "/sitemap.xml",
  "/series-sitemap.xml",
  "/variant-sitemap.xml",
  "/robots.txt",
]);

export const APP_OWNED_EXACT_PATHS = Object.freeze([
  "/review",
  "/review/login",
  "/review/logout",
  "/api/community-reports",
  "/api/import-issues",
  "/api/ops-health",
  "/api/outbound-clicks",
  "/api/runtime-diagnostics/variant-detail",
]);

export const APP_OWNED_PREFIXES = Object.freeze([
  "/api/review/",
  "/api/ingest/",
]);

export function classifyPublicRoute(pathname) {
  const path = String(pathname || "");
  if (PUBLIC_DIAGNOSTIC_PATHS.includes(path)) return "public-diagnostic";
  if (PUBLIC_DOCUMENT_EXACT_PATHS.includes(path)
      || /^\/series\/[^/]+$/.test(path)
      || /^\/variant-sitemap\/[1-9]\d*$/.test(path)) {
    return "public-document";
  }
  if (APP_OWNED_EXACT_PATHS.includes(path) || APP_OWNED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return "app-owned";
  }
  return "explicitly-rejected";
}

// Backward-compatible exports retained for release-integrity tooling/tests.
export const PUBLIC_BOOTSTRAP_OWNED_PATHS = PUBLIC_DIAGNOSTIC_PATHS;
export const CONDITIONAL_PUBLIC_PATHS = Object.freeze(["/review"]);
export const PLANNED_PUBLIC_DOCUMENT_PATHS = PUBLIC_DOCUMENT_EXACT_PATHS;
export const classifyPhaseA2Route = classifyPublicRoute;
