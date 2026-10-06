import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ASSERTIONS } from "../scripts/a9r-postflight-evidence.mjs";

const appSeriesPage = fs.readFileSync(new URL("../app/series/group/[slug]/page.js", import.meta.url), "utf8");
const a9rHarness = fs.readFileSync(new URL("../scripts/a9r-postflight-evidence.mjs", import.meta.url), "utf8");
const runtimeSmoke = fs.readFileSync(new URL("../.github/workflows/cloudflare-runtime-smoke.yml", import.meta.url), "utf8");
const legacyPublicRenderer = fs.readFileSync(new URL("../workers/public/src/document-renderer.js", import.meta.url), "utf8");

test("App-owned parent-series detail renders a semantic primary h1 heading", () => {
  assert.match(appSeriesPage, /<main\s+className="site-main">/);
  assert.match(appSeriesPage, /<section\s+className="detail-hero collector-detail-hero">/);
  assert.match(appSeriesPage, /<h1\s+className="page-title detail-title">\{item\.name\}<\/h1>/);
});

test("A9R series_detail uses the App-owned primary-heading marker without changing assertion order", () => {
  assert.equal(ASSERTIONS.length, 52);
  assert.equal(ASSERTIONS[4].id, "ranking");
  assert.equal(ASSERTIONS[5].id, "series_detail");
  assert.equal(ASSERTIONS[6].id, "schedule_october");

  const seriesDetail = ASSERTIONS[5];
  assert.equal(seriesDetail.marker, "<h1");
  assert.equal(seriesDetail.status, 200);
  assert.equal(seriesDetail.canonical, true);
  assert.equal(seriesDetail.owner, "app");

  assert.doesNotMatch(a9rHarness, /A\("series_detail"[\s\S]*?marker:\s*"<article><h1"/);
});

test("Cloudflare runtime smoke uses the same primary-heading marker", () => {
  assert.match(
    runtimeSmoke,
    /request_public_document "\$pass" series_detail "\$series_detail_path" '<h1'/,
  );
  assert.doesNotMatch(
    runtimeSmoke,
    /request_public_document "\$pass" series_detail "\$series_detail_path" '<article><h1'/,
  );
});

test("legacy standalone Public renderer may retain article+h1 without defining the App-owned contract", () => {
  assert.match(legacyPublicRenderer, /<article><h1/);
  assert.equal(a9rHarness.includes("<article><h1"), false);
  assert.equal(runtimeSmoke.includes("<article><h1"), false);
});
