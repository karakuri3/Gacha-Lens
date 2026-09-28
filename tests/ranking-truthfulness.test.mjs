import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("released ranking is explicitly completed-sale only and active asking stays separate", async () => {
  const source = await read("components/RankingPageContent.js");
  assert.match(source, /成約価格ランキング/);
  assert.match(source, /直近90日で確認できた単品の成約価格が3件以上/);
  assert.match(source, /出品中の価格は順位に使いません/);
  assert.match(source, /出品価格ウォッチ/);
  assert.match(source, /売れた価格・成約価格ではなく、成約価格ランキングの順位にも使いません/);
  assert.match(source, /buildActiveListingWatchEvidence/);
  assert.match(source, /listingCount > 1/);
});

test("sold-evidence zero state never fabricates a released ranking or podium", async () => {
  const source = await read("components/RankingPageContent.js");
  assert.match(source, /現在、成約価格として確認できるデータがありません/);
  assert.match(source, /出品中の価格だけでは成約価格ランキングを作らない/);
  assert.match(source, /showReleasedPodium = tab === "released" && ranked\.length >= 3/);
  const watch = source.slice(source.indexOf("function ListingWatchCard"), source.indexOf("function ProductTitle"));
  assert.doesNotMatch(watch, /rank-medal|rank-number|[123]位/);
});

test("released rank order uses completed-sale evidence only", async () => {
  const source = await read("components/RankingPageContent.js");
  const comparator = source.slice(source.indexOf("function compareCompletedSaleEvidence"), source.indexOf("function isReleasedRankingCandidate"));
  assert.match(comparator, /primaryPrice/);
  assert.match(comparator, /completedCount/);
  assert.match(comparator, /lastCompletedObservedAt/);
  assert.doesNotMatch(comparator, /active_listing|stock|trend|watchScore|releasedPriorityScore/);
  assert.match(source, /hasPriceRankingEvidence\(item\)/);
});

test("ranking surfaces sample count and evidence-specific freshness", async () => {
  const source = await read("components/RankingPageContent.js");
  assert.match(source, /成約確認/);
  assert.match(source, /最終成約確認/);
  assert.match(source, /lastCompletedObservedAt/);
  assert.match(source, /出品確認/);
  assert.match(source, /確認元/);
  assert.match(source, /最終確認/);
  assert.match(source, /formatObservedFreshness/);
});

test("upcoming ranking remains a separate forecast role", async () => {
  const [source, upcomingPage, upcomingSeriesPage] = await Promise.all([
    read("components/RankingPageContent.js"),
    read("app/ranking/upcoming/page.js"),
    read("app/ranking/upcoming/series/page.js"),
  ]);
  assert.match(source, /発売前注目ランキング/);
  assert.match(source, /upcomingPriority/);
  assert.match(source, /diversifyUpcomingPodium/);
  assert.match(upcomingPage, /注目度・入手難度・ラインナップの期待/);
  assert.match(upcomingSeriesPage, /注目度・入手難度・ラインナップの期待/);
});

test("released metadata names completed sales and asking prices separately", async () => {
  const [variantPage, seriesPage] = await Promise.all([
    read("app/ranking/page.js"),
    read("app/ranking/series/page.js"),
  ]);
  assert.match(variantPage, /成約価格ランキング（単品）/);
  assert.match(variantPage, /販売中の出品価格は別の出品価格ウォッチ/);
  assert.match(seriesPage, /成約価格ランキング（シリーズ）/);
  assert.match(seriesPage, /単品価格や販売中の出品価格は順位に使いません/);
});
