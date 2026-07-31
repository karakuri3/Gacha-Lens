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
    head_sha: "4dcc11009b33a741ed0f5aa80bc51920a24fa46d",
    mode: "dry-run",
    source_scope: "planner-apis",
    report_complete: true,
    truncated_count: 0,
    selected_variant_count: 1,
    query_count: 1,
    candidate_count: 1,
    accepted_count: 1,
    review_required_count: 0,
    no_result_variant_count: 0,
    database_writes: { listings: 0, observations: 0, ingestion_runs: 0 },
    candidates: [{
      candidate_key: CANDIDATE_KEY,
      provider: "rakuten_ichiba",
      accepted: true,
      review_required: false,
    }],
    provenance: provenance("10000000001", `market-candidate-audit-${AUDIT_RUN_ID}`),
    ...overrides.audit,
  };
  const canary = {
    run_id: CANARY_RUN_ID,
    source_audit_run_id: AUDIT_RUN_ID,
    head_sha: "4dcc11009b33a741ed0f5aa80bc51920a24fa46d",
    outcome: "success",
    conclusion: "success",
    failed_stage: "",
    error_code: "",
    verification: true,
    listing_writes: 1,
    observation_writes: 1,
    consumption_markers: 1,
    candidate_keys: [CANDIDATE_KEY],
    rollback: { attempted: false, verified: false },
    providers: [{ provider: "rakuten_ichiba", candidate_count: 1 }],
    production_delta: {
      market_listings: 0,
      market_listing_observations: 1,
      import_issues: 0,
      ingestion_runs: 0,
      review_required: 0,
    },
    workflow_final_state: "disabled_manually",
    schedule_run_count: 0,
    rerun_count: 0,
    provenance: provenance("10000000002", `market-canary-result-${CANARY_RUN_ID}`),
    ...overrides.canary,
  };
  return {
    complete: overrides.complete ?? true,
    workflow_unchanged: overrides.workflow_unchanged ?? true,
    audits: overrides.audits ?? [audit],
    canaries: overrides.canaries ?? [canary],
  };
}

function provenance(artifactId, artifactName) {
  return {
    type: "github_actions_artifact",
    artifact_id: artifactId,
    artifact_name: artifactName,
    digest: `sha256:${"a".repeat(64)}`,
    commit_sha: "4dcc11009b33a741ed0f5aa80bc51920a24fa46d",
    expired: false,
  };
}

function failedSafeCanary(overrides = {}) {
  return {
    ...phase4().canaries[0],
    run_id: "30352652078",
    outcome: "failed_safe",
    conclusion: "failure",
    failed_stage: "exact_audit_match",
    error_code: "canary_exact_audit_match_failed",
    verification: false,
    listing_writes: 0,
    observation_writes: 0,
    consumption_markers: 0,
    production_delta: {
      market_listings: 0,
      market_listing_observations: 0,
      import_issues: 0,
      ingestion_runs: 0,
      review_required: 0,
    },
    rollback: { attempted: false, verified: false },
    provenance: provenance("10000000004", "market-canary-result-30352652078"),
    ...overrides,
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
  const successful = phase4().canaries[0];
  const rolledBack = {
    ...successful,
    run_id: "30484636399",
    outcome: "failed_with_rollback",
    conclusion: "failure",
    failed_stage: "post_write_verification",
    error_code: "canary_post_write_verification_failed",
    verification: false,
    consumption_markers: 0,
    production_delta: {
      market_listings: 0,
      market_listing_observations: 0,
      import_issues: 0,
      ingestion_runs: 0,
      review_required: 0,
    },
    rollback: { attempted: true, verified: true },
    provenance: provenance("10000000003", "market-canary-result-30484636399"),
  };
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ canaries: [successful, rolledBack] }),
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
  const evidence = phase4();
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

test("reviewed evidence manifest preserves all approved rollout audits and canaries", async () => {
  const evidence = JSON.parse(await readFile(
    new URL("../config/market-rollout-evidence.json", import.meta.url),
    "utf8",
  ));
  assert.equal(evidence.schema_version, 2);
  assert.equal(evidence.phase4.complete, true);
  assert.equal(evidence.phase4.workflow_unchanged, true);
  assert.deepEqual(
    evidence.phase4.canaries.map((row) => row.run_id),
    [
      "30264689615",
      "30280796120",
      "30352652078",
      "30358862209",
      "30484636298",
      "30568203750",
      "30651440275",
    ],
  );
  assert.deepEqual(
    evidence.phase4.canaries
      .filter((row) => row.outcome === "success")
      .flatMap((row) => row.candidate_keys)
      .sort(),
    [
      "1e901198049bc341",
      "2e833931e4e7cb26",
      "5d7cb7a3f9eb122c",
      "65bf088fb494c114",
      "f1e9adfb8785c509",
      "58fa0fbd97373dfc",
      "dce072831c296dda",
      "f95e4845828bba73",
      "806b7bdc9c03bf81",
      "aa2672a09667cec2",
      "7a8c4ec1b1a0d846",
    ].sort(),
  );
  assert.deepEqual(
    evidence.phase4.audits.map((row) => row.run_id),
    [
      "30253757681",
      "30278197797",
      "30348659878",
      "30354810437",
      "30365904563",
      "30565886734",
      "30572554031",
    ],
  );
  const audit = evidence.phase4.audits.at(-1);
  assert.deepEqual(audit, {
    run_id: "30572554031",
    head_sha: "8b2f0c95e44f40f3b3479a2a44f2e83752a2192e",
    mode: "dry-run",
    source_scope: "planner-apis",
    report_complete: true,
    truncated_count: 0,
    selected_variant_count: 5,
    query_count: 5,
    candidate_count: 11,
    accepted_count: 1,
    review_required_count: 10,
    no_result_variant_count: 2,
    database_writes: { listings: 0, observations: 0, ingestion_runs: 0 },
    candidates: [
      {
        candidate_key: "0d255efb944230e5",
        provider: "rakuten_ichiba",
        accepted: false,
        review_required: true,
      },
      {
        candidate_key: "25f5906df352c016",
        provider: "rakuten_ichiba",
        accepted: false,
        review_required: true,
      },
      {
        candidate_key: "5e08f193af49dbf9",
        provider: "yahoo_shopping",
        accepted: false,
        review_required: true,
      },
      {
        candidate_key: "6d1aaac520172ae5",
        provider: "rakuten_ichiba",
        accepted: false,
        review_required: true,
      },
      {
        candidate_key: "7a8c4ec1b1a0d846",
        provider: "rakuten_ichiba",
        accepted: true,
        review_required: false,
      },
      {
        candidate_key: "939a0ae56d23e979",
        provider: "yahoo_shopping",
        accepted: false,
        review_required: true,
      },
      {
        candidate_key: "c0a06ea538d0c6a6",
        provider: "yahoo_shopping",
        accepted: false,
        review_required: true,
      },
      {
        candidate_key: "d8f6b383d1c838c5",
        provider: "rakuten_ichiba",
        accepted: false,
        review_required: true,
      },
      {
        candidate_key: "e724818ddc2066e4",
        provider: "yahoo_shopping",
        accepted: false,
        review_required: true,
      },
      {
        candidate_key: "efef962964b26fbf",
        provider: "yahoo_shopping",
        accepted: false,
        review_required: true,
      },
      {
        candidate_key: "ff5baa7deca4ff32",
        provider: "rakuten_ichiba",
        accepted: false,
        review_required: true,
      },
    ],
    provenance: {
      type: "github_actions_artifact",
      artifact_id: "8771381977",
      artifact_name: "market-candidate-audit-30572554031",
      digest: "sha256:874b91e4d18024152f90b866ed7b7a0c15101f318bfe0450fda164ac8c619286",
      commit_sha: "8b2f0c95e44f40f3b3479a2a44f2e83752a2192e",
      expired: false,
    },
  });
  const canary = evidence.phase4.canaries.at(-1);
  assert.deepEqual(canary, {
    run_id: "30651440275",
    source_audit_run_id: "30572554031",
    head_sha: "8b2f0c95e44f40f3b3479a2a44f2e83752a2192e",
    outcome: "success",
    conclusion: "success",
    failed_stage: "",
    error_code: "",
    verification: true,
    listing_writes: 1,
    observation_writes: 1,
    consumption_markers: 1,
    candidate_keys: ["7a8c4ec1b1a0d846"],
    providers: [{ provider: "rakuten_ichiba", candidate_count: 1 }],
    production_delta: {
      market_listings: 0,
      market_listing_observations: 1,
      import_issues: 0,
      ingestion_runs: 0,
      review_required: 0,
    },
    rollback: { attempted: false, verified: false },
    workflow_final_state: "disabled_manually",
    schedule_run_count: 0,
    rerun_count: 0,
    provenance: {
      type: "github_actions_artifact",
      artifact_id: "8801545826",
      artifact_name: "market-canary-result-30651440275",
      digest: "sha256:e118734c0b46f4a4ef3b82aa94394f3e5b7585c59ea2a5ddbdacb59e047ddc58",
      commit_sha: "8b2f0c95e44f40f3b3479a2a44f2e83752a2192e",
      expired: false,
    },
  });
  assert.equal(
    evidence.phase4.audits.filter((row) => row.run_id === audit.run_id).length,
    1,
  );
  assert.equal(
    evidence.phase4.canaries.filter((row) => row.run_id === canary.run_id).length,
    1,
  );
  assert.equal(canary.source_audit_run_id, audit.run_id);
  assert.deepEqual(
    canary.candidate_keys,
    audit.candidates.filter((row) => row.accepted).map((row) => row.candidate_key),
  );
  assert.equal(
    audit.candidates.filter((row) => row.review_required).every((row) => !row.accepted),
    true,
  );
  assert.equal(audit.candidates.filter((row) => row.review_required).length, 10);
  assert.deepEqual(
    audit.candidates.filter((row) => row.accepted).map((row) => row.candidate_key),
    ["7a8c4ec1b1a0d846"],
  );
  assert.deepEqual(
    audit.candidates
      .filter((row) => [
        "0d255efb944230e5",
        "25f5906df352c016",
        "5e08f193af49dbf9",
        "6d1aaac520172ae5",
        "939a0ae56d23e979",
        "c0a06ea538d0c6a6",
        "e724818ddc2066e4",
        "efef962964b26fbf",
        "ff5baa7deca4ff32",
      ].includes(row.candidate_key))
      .map((row) => [row.candidate_key, row.accepted, row.review_required]),
    [
      ["0d255efb944230e5", false, true],
      ["25f5906df352c016", false, true],
      ["5e08f193af49dbf9", false, true],
      ["6d1aaac520172ae5", false, true],
      ["939a0ae56d23e979", false, true],
      ["c0a06ea538d0c6a6", false, true],
      ["e724818ddc2066e4", false, true],
      ["efef962964b26fbf", false, true],
      ["ff5baa7deca4ff32", false, true],
    ],
  );
  assert.deepEqual(
    audit.candidates
      .filter((row) => row.candidate_key === "d8f6b383d1c838c5")
      .map((row) => [row.accepted, row.review_required]),
    [[false, true]],
  );
  assert.equal(
    evidence.phase4.audits.filter((row) => row.run_id === "30572554031").length,
    1,
  );
  assert.equal(
    evidence.phase4.canaries.filter((row) => row.run_id === "30651440275").length,
    1,
  );
  assert.equal(new Set(evidence.phase4.audits.map((row) => row.run_id)).size, evidence.phase4.audits.length);
  assert.equal(new Set(evidence.phase4.canaries.map((row) => row.run_id)).size, evidence.phase4.canaries.length);
  const consumedPairs = evidence.phase4.canaries
    .filter((row) => row.outcome === "success")
    .flatMap((row) => row.candidate_keys.map((key) => `${row.source_audit_run_id}:${key}`));
  assert.equal(new Set(consumedPairs).size, consumedPairs.length);
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

test("three successes and two failed-safe attempts preserve manual readiness", () => {
  const base = phase4();
  const keys = [CANDIDATE_KEY, "aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"];
  const auditIds = [AUDIT_RUN_ID, "30348659878", "30354810437"];
  const audits = auditIds.map((runId, index) => ({
    ...base.audits[0],
    run_id: runId,
    candidates: [{
      candidate_key: keys[index],
      provider: "rakuten_ichiba",
      accepted: true,
      review_required: false,
    }],
    provenance: provenance(String(10000000001 + index), `market-candidate-audit-${runId}`),
  }));
  const successes = auditIds.map((sourceAuditRunId, index) => ({
    ...base.canaries[0],
    run_id: String(Number(CANARY_RUN_ID) + index),
    source_audit_run_id: sourceAuditRunId,
    candidate_keys: [keys[index]],
    provenance: provenance(String(10000000010 + index), `market-canary-result-${Number(CANARY_RUN_ID) + index}`),
  }));
  const marketListings = keys.map((candidateKey, index) => listing({
    id: `rakuten-readiness-${index}`,
    raw: {
      provider: "rakuten_ichiba",
      source_listing_id: `readiness:${index}`,
      canary_audit_run_id: auditIds[index],
      canary_candidate_key: candidateKey,
    },
  }));
  const observations = keys.map((candidateKey, index) => marker({
    auditRunId: auditIds[index],
    candidateKey,
    listing_id: marketListings[index].id,
  }));
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({
      audits,
      canaries: [
        ...successes,
        failedSafeCanary(),
        failedSafeCanary({
          run_id: "30358862209",
          provenance: provenance("10000000007", "market-canary-result-30358862209"),
        }),
      ],
    }),
    marketListings,
    observations,
  }));
  assert.equal(report.phase4.successful_canaries, 3);
  assert.equal(report.phase4.failed_canaries, 2);
  assert.equal(report.phase4.failed_safe_canaries, 2);
  assert.equal(report.phase4.failed_unsafe_canaries, 0);
  assert.equal(report.readiness.verdict, "READY_FOR_MORE_MANUAL_CANARIES");
});

test("failed-safe attempt with a listing write fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ canaries: [phase4().canaries[0], failedSafeCanary({ listing_writes: 1 })] }),
  }));
  assert.equal(report.readiness.verdict, "NOT_READY");
  assert.ok(report.readiness.reasons.includes("invalid_failed_safe_canary"));
  assert.equal(report.phase4.failed_safe_canaries, 0);
  assert.equal(report.phase4.failed_unsafe_canaries, 1);
});

test("failed-safe attempt with a consumption marker fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ canaries: [phase4().canaries[0], failedSafeCanary({ consumption_markers: 1 })] }),
  }));
  assert.equal(report.readiness.verdict, "NOT_READY");
  assert.ok(report.readiness.reasons.includes("invalid_failed_safe_canary"));
});

test("failed-safe attempt with nonzero Production delta fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({
      canaries: [phase4().canaries[0], failedSafeCanary({
        production_delta: {
          market_listings: 1,
          market_listing_observations: 0,
          import_issues: 0,
          ingestion_runs: 0,
          review_required: 0,
        },
      })],
    }),
  }));
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("failed-safe attempt requires disabled workflow and no rerun or schedule run", () => {
  for (const override of [
    { workflow_final_state: "active" },
    { rerun_count: 1 },
    { schedule_run_count: 1 },
  ]) {
    const report = buildMarketRolloutReadinessReport(input({
      phase4: phase4({ canaries: [phase4().canaries[0], failedSafeCanary(override)] }),
    }));
    assert.equal(report.readiness.verdict, "NOT_READY");
  }
});

test("failed-with-rollback attempt must have verified rollback", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({
      canaries: [phase4().canaries[0], failedSafeCanary({
        outcome: "failed_with_rollback",
        rollback: { attempted: true, verified: false },
      })],
    }),
  }));
  assert.equal(report.readiness.verdict, "NOT_READY");
  assert.ok(report.readiness.reasons.includes("rollback_unverified"));
});

test("missing source audit evidence fails closed with a specific reason", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({
      canary: { source_audit_run_id: "99999999999" },
    }),
  }));
  assert.equal(report.report_complete, false);
  assert.ok(report.readiness.reasons.includes("missing_source_audit_evidence"));
});

test("canary candidate absent from its source audit fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({
      canary: { candidate_keys: ["ffffffffffffffff"] },
    }),
  }));
  assert.equal(report.readiness.verdict, "NOT_READY");
  assert.ok(report.readiness.reasons.includes("canary_candidate_missing_from_source_audit"));
});

test("successful canary cannot consume a review-required candidate", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({
      audit: {
        accepted_count: 0,
        review_required_count: 1,
        candidates: [{
          candidate_key: CANDIDATE_KEY,
          provider: "rakuten_ichiba",
          accepted: false,
          review_required: true,
        }],
      },
    }),
  }));
  assert.equal(report.readiness.verdict, "NOT_READY");
  assert.ok(report.readiness.reasons.includes("successful_canary_candidate_not_accepted"));
});

test("missing or malformed artifact provenance makes evidence incomplete", () => {
  for (const provenanceOverride of [
    undefined,
    { ...provenance("10000000001", `market-candidate-audit-${AUDIT_RUN_ID}`), digest: "" },
  ]) {
    const report = buildMarketRolloutReadinessReport(input({
      phase4: phase4({ audit: { provenance: provenanceOverride } }),
    }));
    assert.equal(report.report_complete, false);
    assert.ok(report.readiness.reasons.includes("missing_source_audit_provenance"));
  }
});

test("duplicate canary and audit run IDs fail closed", () => {
  const base = phase4();
  const duplicateCanary = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ canaries: [base.canaries[0], base.canaries[0]] }),
  }));
  assert.ok(duplicateCanary.readiness.reasons.includes("duplicate_canary_run_id"));

  const duplicateAudit = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ audits: [base.audits[0], base.audits[0]] }),
  }));
  assert.ok(duplicateAudit.readiness.reasons.includes("duplicate_source_audit_run_id"));
});

test("unknown or missing canary outcomes fail closed", () => {
  for (const outcome of ["mystery", ""]) {
    const report = buildMarketRolloutReadinessReport(input({
      phase4: phase4({ canary: { outcome } }),
    }));
    assert.equal(report.readiness.verdict, "NOT_READY");
    assert.ok(report.readiness.reasons.includes("unknown_canary_outcome"));
  }
});

test("candidate quality reports partial scope when any audit is incomplete", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ audit: { query_count: 2 } }),
  }));
  assert.equal(report.candidate_quality.scope, "partial");
  assert.equal(report.candidate_quality.evidence_complete, false);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("candidate quality covers all reviewed audits when evidence is complete", () => {
  const report = buildMarketRolloutReadinessReport(input());
  assert.equal(report.candidate_quality.scope, "all_reviewed_phase4_audits");
  assert.equal(report.candidate_quality.audit_count, 1);
  assert.equal(report.candidate_quality.evidence_complete, true);
});

test("failure stages and error codes are aggregated deterministically", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({
      canaries: [
        phase4().canaries[0],
        failedSafeCanary(),
        failedSafeCanary({
          run_id: "30358862209",
          provenance: provenance("10000000007", "market-canary-result-30358862209"),
        }),
      ],
    }),
  }));
  assert.deepEqual(report.phase4.failure_stages, [{ value: "exact_audit_match", count: 2 }]);
  assert.deepEqual(report.phase4.error_codes, [{ value: "canary_exact_audit_match_failed", count: 2 }]);
  const markdown = renderMarketRolloutReadinessMarkdown(report);
  assert.match(markdown, /Failed safely: 2/);
  assert.match(markdown, /exact\\_audit\\_match: 2/);
});

test("missing Production consumption marker fails closed", () => {
  const report = buildMarketRolloutReadinessReport(input({ observations: [] }));
  assert.equal(report.safety.missing_consumption_markers, 1);
  assert.equal(report.readiness.verdict, "NOT_READY");
});

test("duplicate successful audit and candidate consumption fails closed", () => {
  const second = {
    ...phase4().canaries[0],
    run_id: "30484636300",
    provenance: provenance("10000000005", "market-canary-result-30484636300"),
  };
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ canaries: [phase4().canaries[0], second] }),
  }));
  assert.ok(report.readiness.reasons.includes("duplicate_consumed_candidate_pair"));
});

test("missing numeric evidence is never estimated as zero", () => {
  const missingAuditCount = { ...phase4().audits[0] };
  delete missingAuditCount.candidate_count;
  const auditReport = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ audits: [missingAuditCount] }),
  }));
  assert.equal(auditReport.report_complete, false);

  const missingDelta = failedSafeCanary();
  delete missingDelta.production_delta.import_issues;
  const canaryReport = buildMarketRolloutReadinessReport(input({
    phase4: phase4({ canaries: [phase4().canaries[0], missingDelta] }),
  }));
  assert.equal(canaryReport.report_complete, false);
});

test("canary provider distribution must match its source audit", () => {
  const report = buildMarketRolloutReadinessReport(input({
    phase4: phase4({
      canary: {
        providers: [{ provider: "yahoo_shopping", candidate_count: 1 }],
      },
    }),
  }));
  assert.equal(report.readiness.verdict, "NOT_READY");
  assert.ok(report.readiness.reasons.includes("canary_provider_distribution_mismatch"));
});

test("source audits must remain planner dry-runs", () => {
  for (const auditOverride of [
    { mode: "canary-write" },
    { source_scope: "all" },
  ]) {
    const report = buildMarketRolloutReadinessReport(input({
      phase4: phase4({ audit: auditOverride }),
    }));
    assert.equal(report.report_complete, false);
    assert.equal(report.readiness.verdict, "NOT_READY");
  }
});
