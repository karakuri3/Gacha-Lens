import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");

const PUBLIC_SHARED_ROUTES = [
  "/",
  "/series",
  "/series/:path*",
  "/ranking",
  "/schedule",
  "/restocks",
  "/stock",
  "/categories",
  "/categories/:path*",
  "/brands",
  "/brands/:path*",
  "/franchises",
  "/franchises/:path*",
  "/guides",
  "/guides/:path*",
];

const PRIVATE_OR_WRITE_SURFACES = ["/api", "/review", "/supabase-series"];

test("shared public pages publish a portable CDN-only cache policy", () => {
  assert.match(source, /key: "CDN-Cache-Control"/);
  assert.match(source, /public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400/);

  for (const route of PUBLIC_SHARED_ROUTES) {
    assert.match(source, new RegExp(`"${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
});

test("CDN cache allowlist excludes API, review, and other non-public surfaces", () => {
  const allowlistStart = source.indexOf("const publicSharedCdnRoutes = [");
  const allowlistEnd = source.indexOf("];", allowlistStart);
  assert.notEqual(allowlistStart, -1);
  assert.notEqual(allowlistEnd, -1);
  const allowlist = source.slice(allowlistStart, allowlistEnd);

  for (const route of PRIVATE_OR_WRITE_SURFACES) {
    assert.doesNotMatch(allowlist, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
