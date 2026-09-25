import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  getLegacyRankingRedirectPath,
  rankingPath,
} from "../lib/domain/ranking-routes.js";

const routes = [
  ["app/ranking/page.js", "/ranking"],
  ["app/ranking/series/page.js", "/ranking/series"],
  ["app/ranking/upcoming/page.js", "/ranking/upcoming"],
  ["app/ranking/upcoming/series/page.js", "/ranking/upcoming/series"],
];

for (const [route, canonical] of routes) {
  test(`${route} is daily static-rendered`, () => {
    const source = fs.readFileSync(route, "utf8");
    assert.match(source, /export const dynamic = "force-static";/);
    assert.match(source, /export const revalidate = 86400;/);
    assert.doesNotMatch(source, /force-dynamic|searchParams/);
    assert.ok(source.includes(`path: "${canonical}"`));
  });
}

test("ranking route mapping covers every supported state", () => {
  assert.equal(rankingPath({ tab: "released", scope: "variant" }), "/ranking");
  assert.equal(rankingPath({ tab: "released", scope: "series" }), "/ranking/series");
  assert.equal(rankingPath({ tab: "upcoming", scope: "variant" }), "/ranking/upcoming");
  assert.equal(rankingPath({ tab: "upcoming", scope: "series" }), "/ranking/upcoming/series");
});

test("legacy ranking query URLs map to canonical static paths", () => {
  assert.equal(getLegacyRankingRedirectPath("https://gachalens.com/ranking?scope=variant&tab=released"), "/ranking");
  assert.equal(getLegacyRankingRedirectPath("https://gachalens.com/ranking?scope=series&tab=released"), "/ranking/series");
  assert.equal(getLegacyRankingRedirectPath("https://gachalens.com/ranking?scope=variant&tab=upcoming"), "/ranking/upcoming");
  assert.equal(getLegacyRankingRedirectPath("https://gachalens.com/ranking?scope=series&tab=upcoming"), "/ranking/upcoming/series");
  assert.equal(getLegacyRankingRedirectPath("https://gachalens.com/ranking?utm_source=test"), null);
  assert.equal(getLegacyRankingRedirectPath("https://gachalens.com/series?scope=series"), null);
});

test("ranking presentation no longer depends on request search params", () => {
  const source = fs.readFileSync("components/RankingPageContent.js", "utf8");
  assert.doesNotMatch(source, /searchParams|useSearchParams/);
  assert.match(source, /getRankingSeries\(tab, scope\)/);
  assert.match(source, /rankingPath\(\{ scope: "variant", tab \}\)/);
  assert.match(source, /DocumentLink/);
});

test("worker redirects legacy ranking queries before invoking vinext", () => {
  const source = fs.readFileSync("worker/index.js", "utf8");
  assert.match(source, /getLegacyRankingRedirectPath/);
  assert.match(source, /Response\.redirect\(target\.toString\(\), 308\)/);
  const redirectIndex = source.indexOf("const legacyRankingRedirect = getLegacyRankingRedirect");
  const handlerIndex = source.indexOf("const response = await handler.fetch");
  assert.ok(redirectIndex >= 0 && handlerIndex > redirectIndex);
  for (const path of ["/ranking/series", "/ranking/upcoming", "/ranking/upcoming/series"]) {
    assert.ok(source.includes(`"${path}"`));
  }
});

test("all canonical ranking states are published in the public sitemap", () => {
  const source = fs.readFileSync("app/sitemap.js", "utf8");
  for (const path of ["/ranking", "/ranking/series", "/ranking/upcoming", "/ranking/upcoming/series"]) {
    assert.ok(source.includes(`{ path: "${path}",`), `${path} is missing from sitemap`);
  }
});
