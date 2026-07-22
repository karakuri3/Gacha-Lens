import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildLineupPublicationState,
  isPublicVariant,
  signalIsPublic,
} from "../lib/domain/variant-publication.js";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const parentIds = new Set(["series-1"]);
const normal = { id: "normal", slug: "normal", series_id: "series-1", name: "確認済み", variant_type: "normal" };
const legacy = { id: "legacy", slug: "legacy", series_id: "series-1", name: "既存データ", variant_type: null };
const provisional = { id: "provisional", slug: "provisional", series_id: "series-1", name: "未確認の仮名称", variant_type: "provisional" };

test("public variant rule preserves legacy rows and rejects provisional or incomplete rows", () => {
  assert.equal(isPublicVariant(normal, { seriesIds: parentIds }), true);
  assert.equal(isPublicVariant(legacy, { seriesIds: parentIds }), true);
  assert.equal(isPublicVariant(provisional, { seriesIds: parentIds }), false);
  assert.equal(isPublicVariant({ ...normal, series_id: "missing" }, { seriesIds: parentIds }), false);
  assert.equal(isPublicVariant({ ...normal, slug: "" }, { seriesIds: parentIds }), false);
  assert.equal(isPublicVariant({ ...normal, name: "" }, { seriesIds: parentIds }), false);
});

test("lineup state exposes counts and status without exposing provisional contents", () => {
  assert.deepEqual(buildLineupPublicationState([normal], [normal]), {
    lineup_verification_status: "verified",
    has_provisional_variants: false,
    provisional_variant_count: 0,
    verified_variant_count: 1,
    lineup_verification_label: "確認済み",
  });

  const partial = buildLineupPublicationState([normal, provisional], [normal]);
  assert.equal(partial.lineup_verification_status, "partial");
  assert.equal(partial.provisional_variant_count, 1);
  assert.equal(JSON.stringify(partial).includes(provisional.name), false);

  const pending = buildLineupPublicationState([provisional], []);
  assert.equal(pending.lineup_verification_status, "pending");
  assert.equal(pending.lineup_verification_label, "ラインナップを確認中です");
});

test("signals attached to provisional variants cannot enter public summaries", () => {
  const publicIds = new Set([normal.id, legacy.id]);
  assert.equal(signalIsPublic({ variant_id: normal.id }, publicIds), true);
  assert.equal(signalIsPublic({ matched_variant_id: provisional.id }, publicIds), false);
  assert.equal(signalIsPublic({ series_id: "series-1" }, publicIds), true);
});

test("public repository uses the common rule while admin data keeps raw variants", () => {
  const source = read("lib/series.js");
  assert.match(source, /normalized\.variants\.filter\(\(variant\) => isPublicVariant\(variant, \{ seriesIds \}\)\)/);
  assert.match(source, /variants: normalized\.variants/);
  assert.match(source, /buildRecordIndexes\(normalized, visibleVariantRows\)/);
  assert.match(source, /signalIsPublic\(entry, publicVariantIds\)/);
});

test("Supabase public queries include null variant types and exclude provisional rows", () => {
  const source = read("lib/data/supabase-gacha-repository.js");
  assert.match(source, /variant_type\.is\.null,variant_type\.neq\.provisional/);
  assert.match(source, /fetchSupabaseCatalogPage[\s\S]*?applyPublicVariantFilter\(query\)/);
  assert.match(source, /fetchSupabaseCatalogVariant[\s\S]*?applyPublicVariantFilter/);
  assert.match(source, /fetchSupabaseCategoryCatalog[\s\S]*?fetchAllPublicVariantRows/);
  assert.match(source, /countPublicVariants\(supabaseClient/);
});

test("detail, favorites and sitemap cannot publish provisional URLs", () => {
  assert.match(read("app/series/[slug]/page.js"), /if \(!item\) notFound\(\)/);
  assert.match(read("app/favorites/page.js"), /\/api\/public-variants/);
  assert.match(read("app/api/public-variants/route.js"), /getPublicFavoriteIdentifiers/);
  assert.match(read("app/sitemap.js"), /getSeriesSlugs/);
  assert.doesNotMatch(read("app/series/[slug]/page.js"), /application\/ld\+json/);
});
