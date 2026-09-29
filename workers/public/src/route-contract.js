export const PUBLIC_BOOTSTRAP_OWNED_PATHS = Object.freeze([
  "/api/runtime-diagnostics/release-source",
  "/api/runtime-diagnostics/public-plane",
  "/api/runtime-diagnostics/public-variant-read",
  "/api/runtime-diagnostics/app-delegation",
]);

export const CONDITIONAL_PUBLIC_PATHS = Object.freeze([
  "/review",
]);

export const APP_OWNED_EXACT_PATHS = Object.freeze([
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

export const PLANNED_PUBLIC_DOCUMENT_PATHS = Object.freeze([
  "/",
  "/series",
  "/schedule",
  "/sitemap.xml",
  "/series-sitemap.xml",
  "/variant-sitemap.xml",
  "/robots.txt",
]);

export function classifyPhaseA2Route(pathname) {
  const path = String(pathname || "");
  if (PUBLIC_BOOTSTRAP_OWNED_PATHS.includes(path)) return "public-owned";
  if (CONDITIONAL_PUBLIC_PATHS.includes(path)) return "conditional";
  if (APP_OWNED_EXACT_PATHS.includes(path) || APP_OWNED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return "app-owned";
  }
  if (PLANNED_PUBLIC_DOCUMENT_PATHS.includes(path)
      || /^\/series\/(?:group\/)?[^/]+$/.test(path)
      || /^\/variant-sitemap\/[1-9]\d*$/.test(path)) {
    return "planned-public";
  }
  return "explicitly-rejected";
}
