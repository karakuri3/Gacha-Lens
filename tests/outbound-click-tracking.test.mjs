import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CANONICAL_OUTBOUND_CLICK_HOST,
  shouldRecordOutboundClickRequest,
} from "../lib/domain/outbound-click-tracking.js";

const routeSource = readFileSync(new URL("../app/api/outbound-clicks/route.js", import.meta.url), "utf8");

test("outbound click demand is recorded only on the canonical HTTPS production host", () => {
  assert.equal(CANONICAL_OUTBOUND_CLICK_HOST, "gachalens.com");
  assert.equal(shouldRecordOutboundClickRequest("https://gachalens.com/api/outbound-clicks"), true);
  assert.equal(shouldRecordOutboundClickRequest("https://gachalens.com/api/outbound-clicks?source=detail"), true);

  for (const url of [
    "https://preview-gacha-lens.senpingxingzuo.workers.dev/api/outbound-clicks",
    "https://feature-branch-gacha-lens.senpingxingzuo.workers.dev/api/outbound-clicks",
    "http://localhost:3000/api/outbound-clicks",
    "https://localhost:3000/api/outbound-clicks",
    "http://gachalens.com/api/outbound-clicks",
    "https://www.gachalens.com/api/outbound-clicks",
    "https://gachalens.com.evil.example/api/outbound-clicks",
    "not-a-url",
  ]) {
    assert.equal(shouldRecordOutboundClickRequest(url), false, url);
  }
});

test("outbound click route rejects non-production hosts before parsing or writing", () => {
  const guardIndex = routeSource.indexOf("shouldRecordOutboundClickRequest(request.url)");
  const bodyIndex = routeSource.indexOf("request.json()");
  const insertIndex = routeSource.indexOf('supabase.from("outbound_clicks").insert');

  assert.ok(guardIndex >= 0, "route must apply the production-host guard");
  assert.ok(bodyIndex > guardIndex, "host guard must run before request-body parsing");
  assert.ok(insertIndex > bodyIndex, "database insert must remain after validation");
  assert.match(routeSource, /if \(!shouldRecordOutboundClickRequest\(request\.url\)\) return new Response\(null, \{ status: 204 \}\);/);
});
