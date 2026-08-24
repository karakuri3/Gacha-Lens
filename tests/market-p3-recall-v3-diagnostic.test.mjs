import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildPriorityThreeSeedQueriesForVariant, buildPriorityThreeSeedRecallV3QueriesForVariant, normalizeRecallSeriesAlias, normalizeRecallVariantAlias, PRIORITY_THREE_SEED_RECALL_V3_QUERY_PROFILE } from "../lib/fetchers/market-seed-query-planner.js";

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-recall-v3-diagnostic.yml"), "utf8");
const oldAuto = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml"), "utf8");
const manual = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-p3-bounded-seed-v2.yml"), "utf8");
const genericAuto = fs.readFileSync(path.join(root, ".github/workflows/gacha-market-bounded-auto.yml"), "utf8");
const series = { id: "series", name: "TVアニメ「黄泉のツガイ」 カプセルラバーマスコット" };
const variant = { id: "variant", name: "アサ", variant_type: "regular" };

test("V3 preserves the strict V2 root and limits each root to three attempts", () => {
  const v2 = buildPriorityThreeSeedQueriesForVariant(variant, series)[0]; const v3 = buildPriorityThreeSeedRecallV3QueriesForVariant(variant, series)[0];
  assert.equal(v3.query, v2.query); assert.equal(v3.root_query, v2.query); assert.equal(v3.query_profile, PRIORITY_THREE_SEED_RECALL_V3_QUERY_PROFILE);
  assert.ok(v3.fallback_queries.length <= 2); assert.ok([v3.query, ...v3.fallback_queries].every((query) => query.includes("アサ") && (query.includes("黄泉") || query === v3.query)));
});

test("V3 aliases remove only presentation text while preserving series and variant anchors", () => {
  assert.match(normalizeRecallSeriesAlias("アニメ「桜蘭高校ホスト部」 カプセルヘアクリップ"), /桜蘭高校ホスト部.*カプセルヘアクリップ/);
  assert.doesNotMatch(normalizeRecallSeriesAlias("TVアニメ「黄泉のツガイ」 カプセルラバーマスコット"), /^TVアニメ/);
  assert.doesNotMatch(normalizeRecallSeriesAlias("【フラットガシャポン】クリアポーチコレクション 仮面ライダー"), /^フラットガシャポン/);
  assert.doesNotMatch(normalizeRecallSeriesAlias("MLB&trade; Capsuleトルソー Players Edition"), /&trade;/i);
  assert.match(normalizeRecallVariantAlias("NPB ~パシフィック・リーグ~"), /NPB.*パシフィック.*リーグ/);
});

test("recall diagnostic is dispatch-only, read-only, and leaves all production workflows isolated", () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m); assert.doesNotMatch(workflow, /schedule:|upsertRows|deleteRowsByIds|market-p3-bounded-seed-v2-auto\.mjs/);
  assert.match(workflow, /manual-market-audit-guard\.mjs scan/); assert.match(workflow, /steps\.scan\.outcome == 'success'/);
  assert.match(oldAuto, /17 \*\/3 \* \* \*/); assert.match(manual, /APPROVE_P3_BOUNDED_SEED_V2/); assert.match(genericAuto, /AUTOMATIC_MARKET_BOUNDED_AUTO_ENABLED/);
});
