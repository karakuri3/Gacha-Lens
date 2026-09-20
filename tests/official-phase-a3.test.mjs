import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertOfficialPhaseA3Expectation,
  buildOfficialPhaseA3Plan,
  buildOfficialPhaseA3Snapshot,
  buildOfficialPhaseA3VariantRow,
  classifyOfficialPhaseA3Residuals,
  validateOfficialPhaseA3Snapshot,
  isAllowedOfficialPhaseA3Url,
} from "../lib/domain/official-phase-a3.js";

const counts = {
  series: 10,
  variants: 20,
  provisional_variants: 2,
  restock_events: 0,
  import_issues: 1,
};

test("Phase A3 classifies only known undetailed database records", () => {
  const known = [
    { id: "safe", official_url: "https://gashapon.jp/products/detail.php?jan_code=1" },
    { id: "rr", official_url: "https://gashapon.jp/products/detail.php?jan_code=2" },
  ];
  const classification = classifyOfficialPhaseA3Residuals({
    knownOfficialRecords: known,
    knownDetailedSeriesIds: [],
    fetchedRecords: [
      record("safe", "https://gashapon.jp/products/detail.php?jan_code=1"),
      record("rr", "https://gashapon.jp/products/detail.php?jan_code=2", { rerelease: true }),
      record("new", "https://gashapon.jp/products/detail.php?jan_code=999"),
    ],
  });

  assert.equal(classification.knownUndetailedRecords.length, 2);
  assert.equal(classification.safeRecords.length, 1);
  assert.equal(classification.rereleaseRecords.length, 1);
  assert.equal(classification.unresolvedRecords.length, 0);
  assert.equal(classification.safeRecords[0].id, "safe");
});

test("Phase A3 keeps cross-series official URL collisions unresolved by series identity", () => {
  const sharedUrl = "https://gashapon.jp/products/detail.php?jan_code=shared";
  const classification = classifyOfficialPhaseA3Residuals({
    knownOfficialRecords: [
      { id: "detailed", official_url: sharedUrl },
      { id: "undetailed", official_url: sharedUrl },
    ],
    knownDetailedSeriesIds: ["detailed"],
    fetchedRecords: [],
  });
  assert.equal(classification.knownUndetailedRecords.length, 1);
  assert.equal(classification.knownUndetailedRecords[0].id, "undetailed");
  assert.equal(classification.safeRecords.length, 0);
  assert.equal(classification.unresolvedRecords.length, 1);
});

test("Phase A3 never turns unresolved records into write candidates", () => {
  const classification = classifyOfficialPhaseA3Residuals({
    knownOfficialRecords: [
      { id: "safe", official_url: "https://gashapon.jp/products/detail.php?jan_code=1" },
      { id: "missing", official_url: "https://gashapon.jp/products/detail.php?jan_code=3" },
    ],
    knownDetailedSeriesIds: [],
    fetchedRecords: [record("safe", "https://gashapon.jp/products/detail.php?jan_code=1")],
  });
  const plan = buildOfficialPhaseA3Plan(classification);
  assert.equal(plan.target_series, 1);
  assert.equal(plan.target_variants, 2);
  assert.equal(classification.unresolvedRecords.length, 1);
});

test("Phase A3 variant row preserves legacy data-quality fields", () => {
  const source = record("full", "https://gashapon.jp/products/detail.php?jan_code=10");
  source.variants[0] = {
    ...source.variants[0],
    rarity: "レア",
    role: "単品",
    axes: { ace: 70 },
    signals: { sample: true },
    tags: ["限定"],
    image_scope: "series",
    raw: { image_scope: "series", evidence: "official" },
  };
  const row = buildOfficialPhaseA3VariantRow(source.variants[0], source);
  assert.equal(row.rarity, "レア");
  assert.equal(row.role, "単品");
  assert.deepEqual(row.axes, { ace: 70 });
  assert.deepEqual(row.signals, { sample: true });
  assert.deepEqual(row.tags, ["限定"]);
  assert.equal(row.raw.image_scope, "series");
  assert.deepEqual(row.raw.raw, { image_scope: "series", evidence: "official" });
  assert.equal(row.raw.id, "full-v1");
});

test("Phase A3 plan writes variants only and is deterministic", () => {
  const first = record("a", "https://gashapon.jp/products/detail.php?jan_code=1");
  const second = record("b", "https://www.takaratomy-arts.co.jp/items/item.html?n=2");
  const one = buildOfficialPhaseA3Plan({ safeRecords: [first, second] });
  const two = buildOfficialPhaseA3Plan({ safeRecords: [second, first] });

  assert.equal(one.plan_digest, two.plan_digest);
  assert.equal(one.write_contract_digest, two.write_contract_digest);
  assert.equal(one.target_series, 2);
  assert.equal(one.target_variants, 4);
  assert.ok(one.variant_rows.every((row) => row.variant_type !== "provisional"));
});

test("Phase A3 stable write contract ignores bounded live metadata drift but not identity drift", () => {
  const base = record("stable", "https://gashapon.jp/products/detail.php?jan_code=stable");
  const first = buildOfficialPhaseA3Plan({ safeRecords: [base] });

  const metadataChanged = structuredClone(base);
  metadataChanged.price = 500;
  metadataChanged.release_date = "2026-10-01";
  metadataChanged.variants[0].image_url = "https://example.invalid/changed.jpg";
  metadataChanged.variants[0].raw = { parser_note: "changed" };
  const second = buildOfficialPhaseA3Plan({ safeRecords: [metadataChanged] });

  assert.notEqual(first.plan_digest, second.plan_digest);
  assert.equal(first.write_contract_digest, second.write_contract_digest);

  const identityChanged = structuredClone(base);
  identityChanged.variants[0].name = "Different Variant";
  identityChanged.variants[0].id = "stable-different";
  identityChanged.variants[0].slug = "stable-different";
  const third = buildOfficialPhaseA3Plan({ safeRecords: [identityChanged] });
  assert.notEqual(first.write_contract_digest, third.write_contract_digest);

  const imageScopeChanged = structuredClone(base);
  imageScopeChanged.variants[0].image_scope = "series";
  const fourth = buildOfficialPhaseA3Plan({ safeRecords: [imageScopeChanged] });
  assert.notEqual(first.write_contract_digest, fourth.write_contract_digest);
});

test("Phase A3 rejects rerelease leakage and deterministically disambiguates duplicate variant identities", () => {
  assert.throws(
    () => buildOfficialPhaseA3Plan({
      safeRecords: [record("rr", "https://gashapon.jp/products/detail.php?jan_code=2", { rerelease: true })],
    }),
    /phase_a3_rerelease_leak/,
  );

  const a = record("a", "https://gashapon.jp/products/detail.php?jan_code=1");
  a.variants[1].id = a.variants[0].id;
  a.variants[1].slug = a.variants[0].slug;
  const plan = buildOfficialPhaseA3Plan({ safeRecords: [a] });
  assert.equal(plan.target_variants, 2);
  assert.equal(plan.identity_disambiguations, 1);
  assert.equal(new Set(plan.variant_rows.map((row) => row.id)).size, 2);
  assert.equal(new Set(plan.variant_rows.map((row) => row.slug)).size, 2);
  assert.equal(plan.variant_rows[1].raw.id, a.variants[1].id);

  const reversed = buildOfficialPhaseA3Plan({ safeRecords: [a] });
  assert.equal(plan.plan_digest, reversed.plan_digest);
});

test("Phase A3 accepts only approved HTTPS provider URLs", () => {
  assert.equal(isAllowedOfficialPhaseA3Url("https://gashapon.jp/products/detail.php?jan_code=1"), true);
  assert.equal(isAllowedOfficialPhaseA3Url("https://www.takaratomy-arts.co.jp/items/item.html?n=1"), true);
  assert.equal(isAllowedOfficialPhaseA3Url("http://gashapon.jp/products/detail.php?jan_code=1"), false);
  assert.equal(isAllowedOfficialPhaseA3Url("https://example.com/products/1"), false);

  assert.throws(
    () => buildOfficialPhaseA3Plan({
      safeRecords: [record("x", "https://example.com/products/1")],
    }),
    /phase_a3_provider_not_allowed/,
  );
});

test("preflight is ready only with a complete scan and zero database delta", () => {
  const classification = {
    knownUndetailedRecords: [{ id: "a" }],
    safeRecords: [record("a", "https://gashapon.jp/products/detail.php?jan_code=1")],
    rereleaseRecords: [],
    unresolvedRecords: [],
  };
  const plan = buildOfficialPhaseA3Plan(classification);
  const report = validateOfficialPhaseA3Snapshot(buildOfficialPhaseA3Snapshot({
    classification,
    plan,
    scan: {
      detail_fetch_limit: 1000,
      detail_fetched: 1,
      known_priority_urls: 1,
      priority_scan_complete: true,
      fetch_issues: 0,
    },
    databaseBefore: counts,
    databaseAfter: counts,
    workflow: { run_id: "1", head_sha: "a".repeat(40), event_name: "push" },
  }));
  assert.equal(report.final_verdict, "OFFICIAL_PHASE_A3_PREFLIGHT_READY");
  assert.equal(report.plan.series_writes, 0);
  assert.equal(report.plan.restock_event_writes, 0);
  assert.equal(report.plan.import_issue_writes, 0);
  assert.equal(report.plan.deletes, 0);

  const drifted = buildOfficialPhaseA3Snapshot({
    classification,
    plan,
    scan: { priority_scan_complete: true },
    databaseBefore: counts,
    databaseAfter: { ...counts, variants: counts.variants + 1 },
  });
  assert.equal(drifted.final_verdict, "OFFICIAL_PHASE_A3_PREFLIGHT_BLOCKED");
});

test("frozen Phase A3 expectation fails closed on any cohort drift", () => {
  const snapshot = {
    counts: {
      known_undetailed: 10,
      safe_records: 5,
      safe_variants: 20,
      rerelease_records: 2,
      unresolved_records: 3,
    },
    plan: {
      plan_digest: "sha256:" + "a".repeat(64),
      write_contract_digest: "sha256:" + "b".repeat(64),
      identity_disambiguations: 1,
    },
    scan: {
      held_shared_detailed_urls: 2,
      held_unsupported_provider_urls: 1,
    },
  };
  assert.doesNotThrow(() => assertOfficialPhaseA3Expectation(snapshot, {
    plan_digest: snapshot.plan.plan_digest,
    write_contract_digest: snapshot.plan.write_contract_digest,
    known_undetailed: 10,
    safe_records: 5,
    safe_variants: 20,
    rerelease_records: 2,
    unresolved_records: 3,
    held_shared_detailed_urls: 2,
    held_unsupported_provider_urls: 1,
    identity_disambiguations: 1,
  }));
  assert.throws(() => assertOfficialPhaseA3Expectation(snapshot, { safe_records: 6 }), /phase_a3_expectation_mismatch/);
  assert.throws(() => assertOfficialPhaseA3Expectation(snapshot, { held_shared_detailed_urls: 3 }), /phase_a3_expectation_mismatch/);
});

test("Phase A3 preflight workflow is branch-only and contains no write lane", () => {
  const workflow = fs.readFileSync(".github/workflows/gacha-official-phase-a3-preflight.yml", "utf8");
  const script = fs.readFileSync("scripts/official-phase-a3-preflight.mjs", "utf8");
  const support = fs.readFileSync("scripts/official-phase-a3-support.mjs", "utf8");

  assert.match(workflow, /fix\/363-phase-a3-targeted-non-rerelease/);
  assert.match(workflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(workflow, /EXPECTED_BASE_MAIN_SHA: c51b945eb06f5ae3726f0d40657745ab7386b894/);
  assert.match(workflow, /git merge-base HEAD origin\/main/);
  assert.doesNotMatch(workflow, /workflow_dispatch:|schedule:/);
  assert.doesNotMatch(workflow, /SUPABASE_DB_URL|db:upsert|ingest:official/);
  assert.doesNotMatch(script, /upsertRows|INSERT INTO|DELETE FROM|UPDATE public\./);
  assert.match(support, /const detailFetchLimit = priorityDetailUrls\.length/);
  assert.match(support, /Number\(fetched\.detailFetched\) === priorityDetailUrls\.length/);
  assert.doesNotMatch(support, /priorityDetailUrls\.length \+ 500/);
  assert.match(support, /all_variant_identities/);
  assert.match(support, /phase_a3_preflight_existing_variant_id_collision/);
  assert.match(support, /phase_a3_preflight_existing_variant_slug_collision/);
  assert.doesNotMatch(support, /variant_type: "neq\.provisional"/);
  assert.match(support, /fetchExactRowCountReliable/);
  assert.doesNotMatch(support, /\bfetchRowCount\b/);
  assert.match(support, /phase_a3_snapshot\.series/);
  assert.match(support, /phase_a3_snapshot\.variants/);
  assert.match(support, /phase_a3_snapshot\.provisional_variants/);
  assert.match(support, /phase_a3_snapshot\.restock_events/);
  assert.match(support, /phase_a3_snapshot\.import_issues/);
});


test("Phase A3 exact-main preflight is one-time, read-only, drift-aware, and secret-scanned", () => {
  const workflow = fs.readFileSync(".github/workflows/gacha-official-phase-a3-main-preflight.yml", "utf8");
  const marker = fs.readFileSync(".github/ops/gacha-official-phase-a3-main-preflight-writer-20260920.token", "utf8").trim();

  assert.equal(marker, "APPROVE_GACHA_OFFICIAL_PHASE_A3_MAIN_PREFLIGHT_WRITER_V5_20260921");
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /paths:\s*\n\s*- \.github\/ops\/gacha-official-phase-a3-main-preflight-writer-20260920\.token/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(workflow, /MARKET_BACKFILL_WRITE_DISABLED: "true"/);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /official:phase-a3-preflight/);
  assert.match(workflow, /official-live-audit-guard\.mjs scan/);
  assert.match(workflow, /steps\.main_start\.outcome/);
  assert.match(workflow, /steps\.main_end\.outcome/);
  assert.match(workflow, /OFFICIAL_PHASE_A3_PREFLIGHT_READY/);
  assert.match(workflow, /report\.workflow\?\.head_sha !== process\.env\.GITHUB_SHA/);
  assert.match(workflow, /Object\.values\(report\.database\?\.delta \|\| \{\}\)/);
  assert.ok((workflow.match(/git rev-parse origin\/main/g) || []).length >= 2);
  assert.doesNotMatch(workflow, /workflow_dispatch:|schedule:/);
  assert.doesNotMatch(workflow, /SUPABASE_DB_URL|db:upsert|ingest:official|official:bounded-write/);
});

function record(id, officialUrl, { rerelease = false } = {}) {
  return {
    id,
    slug: id,
    name: "Series " + id,
    franchise: "Test",
    brand: "Test",
    category: "Test",
    release_date: "2026-09-01",
    release_month: "9月",
    release_week: "第1週",
    price: 400,
    image_url: "https://example.invalid/" + id + ".jpg",
    official_url: officialUrl,
    released: true,
    raw: rerelease ? { is_restock: true } : {},
    variants: [1, 2].map((index) => ({
      id: id + "-v" + index,
      slug: id + "-v" + index,
      name: "Variant " + index,
      image_url: "https://example.invalid/" + id + "-" + index + ".jpg",
      variant_type: "normal",
    })),
  };
}
