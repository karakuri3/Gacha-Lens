import assert from "node:assert/strict";
import process from "node:process";

const UNEXPECTED_FAILURES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_CONCURRENCY = 24;

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

export function parseSitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].replaceAll("&amp;", "&").trim())
    .filter(Boolean);
}

export function pathFromPublishedUrl(value) {
  const url = new URL(value);
  assert.equal(url.origin, "https://gachalens.com", `published URL escaped canonical origin: ${value}`);
  return `${url.pathname}${url.search}`;
}

export function parseSameOriginAssets(html, canonicalOrigin = "https://gachalens.com") {
  const assets = new Set();
  const text = String(html || "");
  const add = (candidate) => {
    if (!candidate) return;
    let url;
    try {
      url = new URL(candidate, canonicalOrigin);
    } catch {
      return;
    }
    if (url.origin !== canonicalOrigin) return;
    if (
      url.pathname.startsWith("/_next/")
      || url.pathname.startsWith("/brand/")
      || url.pathname === "/manifest.webmanifest"
      || url.pathname === "/ads.txt"
    ) {
      assets.add(`${url.pathname}${url.search}`);
    }
  };

  for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(match[1]);
  for (const match of text.matchAll(/srcset=["']([^"']+)["']/g)) {
    for (const entry of match[1].split(",")) add(entry.trim().split(/\s+/)[0]);
  }
  return [...assets];
}

function parseCssAssets(css, cssPath, canonicalOrigin = "https://gachalens.com") {
  const result = new Set();
  const base = new URL(cssPath, canonicalOrigin);
  for (const match of String(css || "").matchAll(/url\((?:["']?)([^)"']+)(?:["']?)\)/g)) {
    const candidate = match[1].trim();
    if (!candidate || candidate.startsWith("data:")) continue;
    const url = new URL(candidate, base);
    if (url.origin === canonicalOrigin) result.add(`${url.pathname}${url.search}`);
  }
  return [...result];
}

function normalizeLocation(value) {
  if (!value) return "";
  const url = new URL(value, "https://placeholder.invalid");
  return `${url.pathname}${url.search}`;
}

function contentTypeForPath(pathname) {
  if (pathname.endsWith(".css")) return /text\/css/i;
  if (pathname.endsWith(".js")) return /javascript|ecmascript/i;
  if (pathname.endsWith(".png")) return /image\/png/i;
  if (pathname.endsWith(".svg")) return /image\/svg\+xml/i;
  if (pathname.endsWith(".woff2")) return /font\/woff2|application\/font-woff2/i;
  if (pathname === "/manifest.webmanifest") return /application\/manifest\+json|application\/json/i;
  return null;
}

async function mapLimit(values, limit, fn) {
  const items = [...values];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
    while (index < items.length) {
      const current = index++;
      await fn(items[current], current);
    }
  });
  await Promise.all(workers);
}

export async function runA6Acceptance({
  publicOrigin,
  appOrigin,
  targetSha,
  fetchImpl = fetch,
  log = console.log,
  concurrency = DEFAULT_CONCURRENCY,
}) {
  assert.match(publicOrigin, /^https:\/\//);
  assert.match(appOrigin, /^https:\/\//);
  assert.match(targetSha, /^[0-9a-f]{40}$/);

  const appPreviewOrigin = new URL(appOrigin).origin;
  const summary = {
    passes: [],
    publicRequests: 0,
    appRequests: 0,
    sitemapLocs: { root: 0, series: 0, variantShards: 0, variants: 0 },
    assets: 0,
  };

  const call = async (origin, path, options = {}, kind = "public") => {
    const url = new URL(path, origin);
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
      ...options,
      headers: {
        "cache-control": "no-cache",
        ...(kind === "public" ? { "x-gacha-a6-app-preview-origin": appPreviewOrigin } : {}),
        ...(options.headers || {}),
      },
    });
    if (kind === "public") summary.publicRequests += 1;
    else summary.appRequests += 1;
    assert.equal(UNEXPECTED_FAILURES.has(response.status), false, `${kind} ${path} returned unexpected HTTP ${response.status}`);
    return response;
  };

  const assertPublicIdentity = async () => {
    const response = await call(publicOrigin, "/api/runtime-diagnostics/release-source", {
      headers: { accept: "application/json" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.plane, "public");
    assert.equal(body.source_sha, targetSha);
  };

  const assertAppIdentity = async () => {
    const response = await call(appOrigin, "/api/runtime-diagnostics/release-source", {
      headers: { accept: "application/json" },
    }, "app");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source_sha, targetSha);
    assert.equal(response.headers.get("x-gacha-source-sha"), targetSha);
  };

  const publicRequest = async (path, options = {}, { delegated = true } = {}) => {
    const response = await call(publicOrigin, path, options);
    if (delegated) {
      assert.equal(response.headers.get("x-gacha-public-plane"), "a6-front-door", `${path} missing A6 front-door marker`);
      assert.equal(response.headers.get("x-gacha-app-source-sha"), targetSha, `${path} missing exact App SHA`);
      assert.equal(response.headers.get("x-gacha-app-transport"), "preview-http", `${path} did not use immutable App Preview`);
    }
    return response;
  };

  const compareWithApp = async (path, options = {}) => {
    const [publicResponse, appResponse] = await Promise.all([
      publicRequest(path, options),
      call(appOrigin, path, options, "app"),
    ]);
    assert.equal(publicResponse.status, appResponse.status, `${path} status differs Public=${publicResponse.status} App=${appResponse.status}`);
    if (publicResponse.status >= 300 && publicResponse.status < 400) {
      assert.equal(
        normalizeLocation(publicResponse.headers.get("location")),
        normalizeLocation(appResponse.headers.get("location")),
        `${path} redirect target mismatch`,
      );
    }
    return publicResponse;
  };

  await assertPublicIdentity();
  await assertAppIdentity();

  const delegationDiagnostic = await call(publicOrigin, "/api/runtime-diagnostics/app-delegation", {
    headers: { accept: "application/json" },
  });
  assert.equal(delegationDiagnostic.status, 200);
  const diagnosticBody = await delegationDiagnostic.json();
  assert.equal(diagnosticBody.ok, true);
  assert.equal(diagnosticBody.public_source_sha, targetSha);
  assert.equal(diagnosticBody.app_source_sha, targetSha);

  const exact200 = [
    "/",
    "/series",
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
    "/privacy",
    "/terms",
    "/disclaimer",
    "/affiliate-disclosure",
    "/operator",
    "/contact",
    "/review",
    "/robots.txt",
    "/sitemap.xml",
    "/series-sitemap.xml",
    "/variant-sitemap.xml",
    "/manifest.webmanifest",
    "/brand/gacha-lens-logo.png",
    "/brand/gacha-lens-mark.png",
  ];

  const queryRoutes = [
    "/series?q=test",
    "/series?scope=series",
    "/series?release=released",
    "/series?category=test",
    "/series?month=2026-10",
    "/series?sort=newest",
    "/series?page=2",
    "/series?filter=test",
    "/schedule?month=2026-10",
  ];

  for (const pass of ["cold", "repeat"]) {
    log(`A6 ${pass}: route/query/API/assets/sitemap closure`);

    for (const path of exact200) {
      const response = await publicRequest(path, { method: "GET" });
      assert.equal(response.status, 200, `${pass} ${path}`);
    }

    for (const path of queryRoutes) {
      const response = await compareWithApp(path);
      assert.equal(response.status, 200, `${pass} ${path}`);
    }

    for (const path of [
      "/schedule",
      "/schedule?month=invalid",
      "/schedule?month=2026-10&page=1",
      "/schedule?month=2026-10&unknown=1",
      "/ranking?tab=upcoming&scope=series",
      "/ranking?tab=released&scope=series",
      "/trends",
    ]) {
      const response = await compareWithApp(path);
      assert.ok(response.status >= 300 && response.status < 400, `${pass} ${path} expected redirect, got ${response.status}`);
    }

    const schedule = await publicRequest("/schedule?month=2026-10");
    const scheduleHtml = await schedule.text();
    assert.doesNotMatch(scheduleHtml, /2026年10月の発売情報はまだありません/, "2026-10 schedule unexpectedly empty");
    assert.match(scheduleHtml, /2026年10月|2026-10/);

    const rootSitemap = await publicRequest("/sitemap.xml");
    const rootXml = await rootSitemap.text();
    const rootLocs = parseSitemapLocs(rootXml);
    assert.ok(rootLocs.length > 0, "root sitemap has no locs");
    summary.sitemapLocs.root = rootLocs.length;

    const seriesSitemap = await publicRequest("/series-sitemap.xml");
    const seriesXml = await seriesSitemap.text();
    const seriesLocs = parseSitemapLocs(seriesXml);
    assert.ok(seriesLocs.length > 0, "series sitemap has no locs");
    assert.ok(seriesLocs.every((loc) => new URL(loc).pathname.startsWith("/series/group/")), "series sitemap emitted non-parent namespace");
    summary.sitemapLocs.series = seriesLocs.length;

    const variantIndex = await publicRequest("/variant-sitemap.xml");
    const variantIndexXml = await variantIndex.text();
    const shardLocs = parseSitemapLocs(variantIndexXml);
    assert.ok(shardLocs.length > 0, "variant sitemap index has no shards");
    assert.ok(shardLocs.every((loc) => /^\/variant-sitemap\/[1-9]\d*$/.test(new URL(loc).pathname)), "variant sitemap index emitted invalid shard path");
    summary.sitemapLocs.variantShards = shardLocs.length;

    const variantLocs = [];
    for (const shardLoc of shardLocs) {
      const shardPath = pathFromPublishedUrl(shardLoc);
      const shard = await publicRequest(shardPath);
      assert.equal(shard.status, 200, shardPath);
      const shardXml = await shard.text();
      for (const loc of parseSitemapLocs(shardXml)) {
        const pathname = new URL(loc).pathname;
        assert.match(pathname, /^\/series\/(?!group\/)[^/]+$/, `invalid variant sitemap loc: ${loc}`);
        variantLocs.push(loc);
      }
    }
    assert.ok(variantLocs.length > 0, "variant sitemap shards contain no locs");
    summary.sitemapLocs.variants = variantLocs.length;

    const allPublishedLocs = [...new Set([...rootLocs, ...seriesLocs, ...variantLocs])];
    await mapLimit(allPublishedLocs, concurrency, async (loc) => {
      const path = pathFromPublishedUrl(loc);
      const response = await publicRequest(path, { method: "HEAD" });
      assert.equal(response.status, 200, `${pass} sitemap loc ${path}`);
    });

    for (const invalidPath of ["/variant-sitemap/0", "/variant-sitemap/5001"]) {
      const response = await publicRequest(invalidPath, { method: "HEAD" });
      assert.equal(response.status, 404, `${pass} invalid sitemap shard ${invalidPath}`);
    }

    const categoryLoc = rootLocs.find((loc) => new URL(loc).pathname.startsWith("/categories/"));
    const brandLoc = rootLocs.find((loc) => new URL(loc).pathname.startsWith("/brands/"));
    const franchiseLoc = rootLocs.find((loc) => new URL(loc).pathname.startsWith("/franchises/"));
    const guideLoc = rootLocs.find((loc) => new URL(loc).pathname.startsWith("/guides/"));
    assert.ok(categoryLoc && brandLoc && franchiseLoc && guideLoc, "root sitemap missing dynamic discovery classes");

    for (const loc of [categoryLoc, brandLoc, franchiseLoc, guideLoc]) {
      const path = pathFromPublishedUrl(loc);
      const response = await publicRequest(path);
      assert.equal(response.status, 200, path);
    }

    for (const loc of [categoryLoc, brandLoc, franchiseLoc]) {
      const path = new URL(loc).pathname;
      const legacy = await compareWithApp(`${path}?page=2`);
      assert.ok(legacy.status >= 300 && legacy.status < 400, `${path}?page=2 must redirect`);
      const pathPage = await compareWithApp(`${path}/page/2`);
      assert.ok([200, 307, 308].includes(pathPage.status), `${path}/page/2 unexpected ${pathPage.status}`);
    }

    const guideQueryPath = `${new URL(guideLoc).pathname}?from=a6`;
    const guideQuery = await publicRequest(guideQueryPath);
    assert.equal(guideQuery.status, 200);
    assert.match(await guideQuery.text(), /noindex/i, "guide query must remain noindex");

    const stockApi = await publicRequest("/api/public-stock", { headers: { accept: "application/json" } });
    assert.equal(stockApi.status, 200);
    const stockJson = await stockApi.json();
    assert.ok(Array.isArray(stockJson.rows), "public-stock rows missing");

    const variantsApi = await publicRequest("/api/public-variants?ids=", { headers: { accept: "application/json" } });
    assert.equal(variantsApi.status, 200);
    const variantsJson = await variantsApi.json();
    assert.ok(Array.isArray(variantsJson.identifiers), "public-variants identifiers missing");

    const invalidDiscovery = await publicRequest("/api/public-discovery", { headers: { accept: "application/json" } });
    assert.equal(invalidDiscovery.status, 400);
    assert.equal((await invalidDiscovery.json()).error, "invalid_request");

    const categoryName = decodeURIComponent(new URL(categoryLoc).pathname.split("/").at(-1));
    const validDiscovery = await publicRequest(`/api/public-discovery?type=category&name=${encodeURIComponent(categoryName)}&page=1`, {
      headers: { accept: "application/json" },
    });
    assert.equal(validDiscovery.status, 200);
    assert.ok((await validDiscovery.json()).result, "valid public-discovery result missing");

    const missingDiscovery = await publicRequest("/api/public-discovery?type=category&name=__a6_missing__&page=1", {
      headers: { accept: "application/json" },
    });
    assert.equal(missingDiscovery.status, 404);

    const ops = await publicRequest("/api/ops-health", { headers: { accept: "application/json" } });
    assert.equal(ops.status, 401);

    const imports = await publicRequest("/api/import-issues", { headers: { accept: "application/json" } });
    assert.equal(imports.status, 401);

    const reviewMutation = await publicRequest("/api/review/community-reports/a6-nonexistent", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: publicOrigin,
      },
      body: "decision=approved",
    });
    assert.equal(reviewMutation.status, 401);

    const ingestGet = await publicRequest("/api/ingest/all", { headers: { accept: "application/json" } });
    assert.equal(ingestGet.status, 200);
    const ingestGetJson = await ingestGet.json();
    assert.equal(ingestGetJson.execution, "retired-from-web-runtime");

    const ingestPost = await publicRequest("/api/ingest/all", { method: "POST" });
    assert.equal(ingestPost.status, 401);

    const runtimeDiagnostic = await compareWithApp("/api/runtime-diagnostics/variant-detail", {
      headers: { accept: "application/json" },
    });
    assert.equal(runtimeDiagnostic.status, 200);

    const outbound = await publicRequest("/api/outbound-clicks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "official", variantId: "a6-read-only-proof", pagePath: "/a6" }),
    });
    assert.equal(outbound.status, 204, "noncanonical Preview origin must suppress outbound-click writes");

    const communityValidation = await publicRequest("/api/community-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportType: "__invalid__", variantId: "" }),
    });
    assert.equal(communityValidation.status, 400);

    const unknown = await call(publicOrigin, "/__a6-unknown");
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).error, "route_not_owned_by_public_bootstrap");

    for (const internalPath of ["/__public-data/v1/series", "/__public-data/v1/counts"]) {
      const internal = await call(publicOrigin, internalPath);
      assert.equal(internal.status, 404, internalPath);
      assert.equal((await internal.json()).error, "route_not_owned_by_public_bootstrap");
    }

    const representativePages = [
      "/",
      "/series",
      pathFromPublishedUrl(seriesLocs[0]),
      pathFromPublishedUrl(variantLocs[0]),
      "/ranking",
      "/stock",
      "/favorites",
      "/review",
    ];
    const assets = new Set(["/manifest.webmanifest", "/brand/gacha-lens-logo.png", "/brand/gacha-lens-mark.png"]);
    for (const pagePath of representativePages) {
      const response = await publicRequest(pagePath, { headers: { accept: "text/html" } });
      assert.equal(response.status, 200, pagePath);
      const html = await response.text();
      for (const asset of parseSameOriginAssets(html)) assets.add(asset);
      assert.match(html, /<html|<!doctype html/i, `${pagePath} not HTML`);
    }
    assert.ok([...assets].some((path) => path.startsWith("/_next/static/")), "representative App HTML exposed no Next static assets");

    const cssQueue = [];
    await mapLimit([...assets], concurrency, async (assetPath) => {
      const response = await publicRequest(assetPath, { method: "GET" });
      assert.ok([200, 304].includes(response.status), `${assetPath} asset HTTP ${response.status}`);
      const expected = contentTypeForPath(new URL(assetPath, "https://gachalens.com").pathname);
      if (expected) assert.match(response.headers.get("content-type") || "", expected, `${assetPath} content-type`);
      if (assetPath.endsWith(".css") && response.status === 200) {
        const css = await response.text();
        cssQueue.push(...parseCssAssets(css, assetPath));
      }
    });

    await mapLimit([...new Set(cssQueue)], concurrency, async (assetPath) => {
      const response = await publicRequest(assetPath, { method: "GET" });
      assert.ok([200, 304].includes(response.status), `${assetPath} nested asset HTTP ${response.status}`);
    });
    summary.assets = new Set([...assets, ...cssQueue]).size;

    summary.passes.push({
      pass,
      publishedLocs: allPublishedLocs.length,
      variantLocs: variantLocs.length,
      assets: summary.assets,
    });
  }

  return summary;
}

async function main() {
  const publicOrigin = argument("public");
  const appOrigin = argument("app");
  const targetSha = argument("sha");
  if (!publicOrigin || !appOrigin || !targetSha) {
    throw new Error("usage: node scripts/cloudflare-a6-acceptance.mjs --public <url> --app <url> --sha <40hex>");
  }
  const summary = await runA6Acceptance({ publicOrigin, appOrigin, targetSha });
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
