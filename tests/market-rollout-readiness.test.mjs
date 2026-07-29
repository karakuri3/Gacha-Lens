import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildMarketRolloutReadinessReport,
  renderMarketRolloutReadinessMarkdown,
  validateMarketRolloutReadinessReport,
} from "../lib/domain/market-rollout-readiness.js";
import { stableId } from "../lib/fetchers/feed-source-utils.js";

const GENERATED_AT = "2026-07-30T00:00:00.000Z";
const AUDIT_RUN_ID = "30365904563";
const CANARY_RUN_ID = "30484636298";
const CANDIDATE_KEY = "58fa0fbd97373dfc";
const LISTING_ID = "rakuten-auc-toysanta-10382232";

function phase4(overrides = {}) {
  const audit = {
    run_id: AUDIT_RUN_ID,
    report_complete: true,
    truncated_count: 0,
    candidate_count: 1,
    accepted_count: 1,
    review_required_count: 0,
    no_result_variant_count: 0,
    providers: [{
      provider: "rakuten_ichiba",
      audited_candidate_count: 1,
      accepted_count: 1,
      review_required_count: 0,
    }],
    ...overrides.audit,
  };
  const canary = {
    run_id: CANARY_RUN_ID,
    source_audit_run_id: AUDIT_RUN_ID,
    ok: true,
    verification: true,
    listing_writes: 1,
    observation_writes: 1,
    candidate_keys: [CANDIDATE_KEY],
    rollback: { attempted: false, verified: false },
    providers: [{ provider: "rakuten_ichiba", rollback_count: 0 }],
    ...overrides.canary,
  };
  return {
    complete: overrides.complete ?? true,
    workflow_unchanged: overrides.workflow_unchanged ?? true,
    audits: overrides.audits ?? [audit],
    canaries: overrides.canaries ?? [canary],
  };
}

function listing(overrides = {}) {
  return {
    id: LISTING_ID,
    source: "rakuten",
    status: "active",
    review_required: false,
    raw: {
      provider: "rakuten_ichiba",
      source_listing_id: "auc-toysanta:10382232",
      canary_audit_run_id: AUDIT_RUN_ID,
      canary_candidate_key: CANDIDATE_KEY,
      seller: "must-not-leak",
      private_url: "https://private.invalid/listing",
    },
    ...overrides,
  };
}

function marker(overrides = {}) {
  const auditRunId = overrides.auditRunId ?? AUDIT_RUN_ID;
  const candidateKey = overrides.candidateKey ?? CANDIDATE_KEY;
  const listingId = overrides.listing_id ?? LISTING_ID;
  return {
    id: overrides.id ?? stableId("market-canary-observation", auditRunId, candidateKey, listingId),
    listing_id: listingId,
    price: overrides.price ?? 568,
    status: overrides.status ?? "active",
    observed_at: overrides.observed_at ?? "2026-07-29T19:30:19.906Z",
    created_at: overrides.created_at ?? "2026-07-29T19:30:20.000Z",
    raw: overrides.raw ?? {
      canary_audit_run_id: auditRunId,
      canary_candidate_key: candidateKey,
      credential: "must-not-leak",
    },
  };
}

function input(overrides = {}) {
  return {
    generatedAt: GENERATED_AT,
    phase4: phase4(),
    marketListings: [listing()],
    observations: [marker()],
    ingestionRuns: [],
    importIssues: [],
    productionReadComplete: true,
    fetchErrorCount: 0,
    databaseWrites: 0,
    ...overrides,
  };
}

test("Phase 4-F success is ready only for more manual canaries", () => {
  const report = buildMarketRolloutReadinessReport(input());
  assert.equal(report.readiness.verdict, "READY_FOR_MORE_MANUAL_CANARIES");
  assert.equal(report.readiness.next_allowed_step, "manual canaries on fresh audits with different series or providers");
  assert.equal(report.database_writes, 0);
});

test("malformed consumption marker fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    observations: [marker({ raw: { canary_audit_run_id: AUDIT_RUN_ID } })],
  }));
  assert.equal(report.safety.malformed_consumption_markers, 1);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("duplicate consumption marker fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    observations: [
      marker(),
      marker({ id: "market-observation-legacy-second" }),
    ],
  }));
  assert.equal(report.safety.duplicate_consumption_markers, 1);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("review-required canary write fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    marketListings: [listing({ review_required: true })],
  }));
  assert.equal(report.safety.review_required_writes, 1);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("verification false fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ canary: { verification: false } }),
  }));
  assert.equal(report.phase4.successful_canaries, 0);
  assert.equal(report.safety.unverified_canary_observations, 1);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("an attempted and verified rollback is allowed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ canary: { rollback: { attempted: true, verified: true } } }),
  }));
  assert.equal(report.phase4.rollbacks_attempted, 1);
  assert.equal(report.phase4.rollbacks_verified, 1);
  assert.equal(report.safety.rollback_failures, 0);
  assert.equal(report.readiness.verdict, "READY_FOR_MORE_MANUAL_CANARIES");
});

test("an attempted but unverified rollback fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ canary: { rollback: { attempted: true, verified: false } } }),
  }));
  assert.equal(report.safety.rollback_failures, 1);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("incomplete evidence report fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ complete: false }),
  }));
  assert.equal(report.report_complete, false);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("Production read failure fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    productionReadComplete: false,
    fetchErrorCount: 1,
  }));
  assert.equal(report.report_complete, false);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("nonzero database writes fail closed", () => {
  const report = buildMarketRolloutReadinessReport(input({ databaseWrites: 1 }));
  assert.equal(report.readiness.verdict, "NOT_READY");
  assert.ok(report.readiness.reasons.includes("database_writes_nonzero"));
});

test("legacy marker IDs are recognized", () => {
  const report = buildMarketRolloutReadinessReport(input({
    observations: [marker({ id: "market-observation-2026-07-27-rakuten-listing" })],
  }));
  assert.equal(report.safety.consumption_markers, 1);
  assert.equal(report.safety.malformed_consumption_markers, 0);
});

test("dedicated marker IDs are recognized and deterministic", () => {
  const report = buildMarketRolloutReadinessReport(input());
  assert.equal(report.safety.consumption_markers, 1);
  assert.deepEqual(report.marker_audits, [{
    audit_run_id: AUDIT_RUN_ID,
    marker_count: 1,
    candidate_count: 1,
  }]);
});

test("normal and canary observations on one UTC day are deduped for public history", () => {
  const report = buildMarketRolloutReadinessReport(input({
    observations: [
      marker({ observed_at: "2026-07-29T01:00:00Z" }),
      {
        id: "normal-observation",
        listing_id: LISTING_ID,
        price: 600,
        status: "active",
        observed_at: "2026-07-29T02:00:00Z",
      },
    ],
  }));
  assert.equal(report.safety.duplicate_daily_observations, 1);
  assert.equal(report.safety.public_history_observation_count, 1);
  assert.equal(report.readiness.verdict, "READY_FOR_MORE_MANUAL_CANARIES");
});

test("provider quality combines audit, listing and verified marker counts", () => {
  const report = buildMarketRolloutReadinessReport(input());
  assert.deepEqual(report.provider_quality, [{
    provider: "rakuten_ichiba",
    audited_candidate_count: 1,
    accepted_count: 1,
    review_required_count: 0,
    canary_write_count: 1,
    verified_write_count: 1,
    rollback_count: 0,
    active_count: 1,
    sold_count: 0,
    malformed_identity_count: 0,
  }]);
});

test("zero denominator rates are safely zero", () => {
  const emptyAudit = {
    ...phase4().audits[0],
    candidate_count: 0,
    accepted_count: 0,
    review_required_count: 0,
    no_result_variant_count: 1,
    providers: [],
  };
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ audits: [emptyAudit] }),
  }));
  assert.equal(report.candidate_quality.accepted_rate, 0);
  assert.equal(report.candidate_quality.review_required_rate, 0);
});

test("JSON output is sanitized", () => {
  const serialized = JSON.stringify(buildMarketRolloutReadinessReport(input()));
  assert.doesNotMatch(serialized, /must-not-leak|seller|private_url|credential|raw/i);
});

test("Markdown output is sanitized", () => {
  const markdown = renderMarketRolloutReadinessMarkdown(buildMarketRolloutReadinessReport(input()));
  assert.doesNotMatch(markdown, /must-not-leak|seller|private_url|credential|raw response/i);
  assert.match(markdown, /READY_FOR_MORE_MANUAL_CANARIES/);
});

test("sorting is deterministic across reversed input", () => {
  const secondListing = listing({
    id: "unknown-listing",
    source: "unmapped_provider",
    raw: {},
  });
  const evidence = phase4({
    audit: {
      providers: [
        { provider: "unmapped_provider", audited_candidate_count: 0, accepted_count: 0, review_required_count: 0 },
        ...phase4().audits[0].providers,
      ],
    },
  });
  const forward = buildMarketRolloutReadinessReport(input({
    phase4: evidence,
    marketListings: [listing(), secondListing],
  }));
  const reverse = buildMarketRolloutReadinessReport(input({
    phase4: { ...evidence, audits: [...evidence.audits].reverse() },
    marketListings: [secondListing, listing()],
  }));
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.provider_quality.map((row) => row.provider), ["rakuten_ichiba", "unmapped_provider"]);
});

test("invalid candidate key is malformed and evidence is incomplete", () => {
  const invalid = "NOT-A-KEY";
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ canary: { candidate_keys: [invalid] } }),
    observations: [marker({
      candidateKey: invalid,
      raw: { canary_audit_run_id: AUDIT_RUN_ID, canary_candidate_key: invalid },
    })],
  }));
  assert.equal(report.safety.malformed_consumption_markers, 1);
  assert.equal(report.report_complete, false);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("invalid audit run ID is malformed and fails closed", () => {
  const invalid = "audit-x";
  const report = buildMarketRolloutReadinessReport(input({
    observations: [marker({
      auditRunId: invalid,
      raw: { canary_audit_run_id: invalid, canary_candidate_key: CANDIDATE_KEY },
    })],
  }));
  assert.equal(report.safety.malformed_consumption_markers, 1);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("marker without a corresponding listing is unverified", () => {
  const report = buildMarketRolloutReadinessReport(input({ marketListings: [] }));
  assert.equal(report.safety.unverified_canary_observations, 1);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("duplicate audit and candidate pair is counted independently of marker ID", () => {
  const report = buildMarketRolloutReadinessReport(input({
    observations: [marker(), marker({ id: "legacy-marker-with-same-pair" })],
  }));
  assert.equal(report.safety.consumption_markers, 2);
  assert.equal(report.safety.duplicate_consumption_markers, 1);
});

test("unknown providers are aggregated without leaking listing details", () => {
  const report = buildMarketRolloutReadinessReport(input({
    marketListings: [
      listing(),
      listing({ id: "unknown-id", source: "", raw: {}, status: "sold" }),
    ],
  }));
  const unknown = report.provider_quality.find((row) => row.provider === "unknown");
  assert.equal(unknown.sold_count, 1);
  assert.doesNotMatch(JSON.stringify(unknown), /unknown-id/);
});

test("validation rejects unsafe next steps and unsorted providers", () => {
  const report = buildMarketRolloutReadinessReport(input({
    marketListings: [
      listing({ id: "z-id", source: "z_provider", raw: {} }),
      listing(),
    ],
  }));
  assert.throws(() => validateMarketRolloutReadinessReport({
    ...report,
    readiness: { ...report.readiness, next_allowed_step: "normal ingestion" },
  }), /manual canary boundary/);
  assert.throws(() => validateMarketRolloutReadinessReport({
    ...report,
    provider_quality: [...report.provider_quality].reverse(),
  }), /not sorted/);
});

test("read-only script has no database mutation or workflow dispatch path", async () => {
  const source = await readFile(new URL("../scripts/market-rollout-readiness.mjs", import.meta.url), "utf8");
  assert.match(source, /fetchRows/);
  assert.doesNotMatch(source, /\b(upsertRows|deleteRowsByIds|fetchRowCount|workflow dispatch|gh workflow|method:\s*["'](?:POST|PATCH|DELETE))/i);
  assert.match(source, /databaseWrites:\s*0/);
});

test("existing observation history remains the shared duplicate rule", async () => {
  const source = await readFile(new URL("../lib/domain/market-rollout-readiness.js", import.meta.url), "utf8");
  assert.match(source, /dedupeMarketObservationsByListingDay/);
  assert.doesNotMatch(source, /market_listings\.raw/);
});

test("reviewed evidence manifest preserves all known Phase 4 canaries", async () => {
  const evidence = JSON.parse(await readFile(
    new URL("../config/market-rollout-evidence.json", import.meta.url),
    "utf8",
  ));
  assert.deepEqual(
    evidence.phase4.canaries.map((row) => row.run_id),
    ["30264689615", "30280796120", "30484636298"],
  );
  assert.deepEqual(
    evidence.phase4.canaries.flatMap((row) => row.candidate_keys).sort(),
    [
      "1e901198049bc341",
      "2e833931e4e7cb26",
      "5d7cb7a3f9eb122c",
      "65bf088fb494c114",
      "f1e9adfb8785c509",
      "58fa0fbd97373dfc",
      "dce072831c296dda",
      "f95e4845828bba73",
    ].sort(),
  );
  const workflow = await readFile(
    new URL("../.github/workflows/gacha-ingestion.yml", import.meta.url),
  );
  assert.equal(createHash("sha256").update(workflow).digest("hex"), evidence.workflow_sha256);
});

test("workflow drift fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ workflow_unchanged: false }),
  }));
  assert.equal(report.readiness.verdict, "NOT_READY");
  assert.ok(report.readiness.reasons.includes("workflow_changed"));
});

test("dedicated marker and listing marker mismatch is unverified", () => {
  const report = buildMarketRolloutReadinessReport(input({
    marketListings: [listing({
      raw: {
        provider: "rakuten_ichiba",
        source_listing_id: "auc-toysanta:10382232",
        canary_audit_run_id: AUDIT_RUN_ID,
        canary_candidate_key: "ffffffffffffffff",
      },
    })],
  }));
  assert.equal(report.safety.unverified_canary_observations, 1);
  assert.equal(report.readiness.verdict, "NOT_READY");
});
