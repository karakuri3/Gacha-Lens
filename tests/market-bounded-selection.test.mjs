import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKET_BOUNDED_PERSISTENCE_HARD_CAP,
  selectDeterministicMarketPersistenceCandidates,
} from "../lib/domain/market-bounded-selection.js";
import {
  buildAutomaticMarketRolloutPlan,
  loadAutomaticIngestionRolloutPolicy,
} from "../lib/domain/automatic-ingestion-rollout.js";
import { buildMarketBoundedCoverageSnapshot } from "../lib/domain/market-bounded-coverage.js";

const { policy, digest } = loadAutomaticIngestionRolloutPolicy("config/automatic-ingestion-rollout-policy.json");
const selection = [1, 2, 3, 4, 5].map((index) => ({
  variant_id: `variant-${index}`,
  series_id: `series-${index}`,
}));

test("hard persistence ceiling remains two", () => {
  assert.equal(MARKET_BOUNDED_PERSISTENCE_HARD_CAP, 2);
  assert.throws(() => selectDeterministicMarketPersistenceCandidates({
    candidates: [], selectedVariants: selection, capacity: 3,
  }), /capacity/);
});

test("variant diversity precedes a second listing from the same variant", () => {
  const candidates = [
    safe("0000000000000001", 1),
    safe("0000000000000002", 1),
    safe("0000000000000003", 2),
  ];
  assert.deepEqual(select(candidates).selectedCandidateKeys, [
    "0000000000000001", "0000000000000003",
  ]);
});

test("within-variant ranking uses evidence then confidence then candidate key", () => {
  const candidates = [
    safe("0000000000000004", 1, { confidence: 0.99 }),
    safe("0000000000000003", 1, { parentExact: true, confidence: 0.86 }),
    safe("0000000000000002", 1, { explicit: true, confidence: 0.86 }),
    safe("0000000000000001", 1, { explicit: true, confidence: 0.91 }),
  ];
  assert.deepEqual(select(candidates).selectedCandidateKeys, [
    "0000000000000001", "0000000000000002",
  ]);
});

test("selection is independent of candidate and provider response order", () => {
  const candidates = [
    safe("0000000000000004", 2, { provider: "yahoo_shopping" }),
    safe("0000000000000003", 1, { provider: "rakuten_ichiba" }),
    safe("0000000000000002", 2, { provider: "rakuten_ichiba" }),
    safe("0000000000000001", 1, { provider: "yahoo_shopping" }),
  ];
  const expected = select(candidates).selectedCandidateKeys;
  assert.deepEqual(select([...candidates].reverse()).selectedCandidateKeys, expected);
  assert.deepEqual(select([candidates[2], candidates[0], candidates[3], candidates[1]]).selectedCandidateKeys, expected);
});

test("one safe variant uses a deterministic second pass within the hard cap", () => {
  const result = select([
    safe("0000000000000004", 1), safe("0000000000000002", 1),
    safe("0000000000000003", 1), safe("0000000000000001", 1),
  ]);
  assert.deepEqual(result.selectedCandidateKeys, ["0000000000000001", "0000000000000002"]);
  assert.equal(result.selectedDistinctVariantCount, 1);
});

test("zero candidates is a clean no-op", () => {
  const result = select([]);
  assert.deepEqual(result.selectedCandidateKeys, []);
  assert.deepEqual(result.safeNotSelectedCandidateKeys, []);
});

test("exactly two distinct safe candidates are both selected", () => {
  const result = select([safe("0000000000000002", 2), safe("0000000000000001", 1)]);
  assert.deepEqual(result.selectedCandidateKeys, ["0000000000000001", "0000000000000002"]);
});

test("candidate targets outside the audited selection fail closed", () => {
  assert.throws(() => select([safe("0000000000000001", 9)]), /outside/);
});

test("Run 31930988966 sanitized replay audits 32 and selects two diverse safe candidates", () => {
  const audit = productionReplayAudit();
  const result = replayPlan(audit);
  assert.deepEqual({
    total: result.total_candidate_count,
    safe: result.safe_candidate_count,
    review: result.review_required_candidate_count,
    selected: result.selected_for_persistence_count,
    safeNotSelected: result.safe_not_selected_count,
    distinctVariants: result.selected_distinct_variant_count,
    listingWrites: result.listing_writes_planned,
    observationWrites: result.observation_writes_planned,
    reviewWrites: result.review_required_writes_planned,
    budget: result.budget_checks.state,
  }, {
    total: 32, safe: 12, review: 20, selected: 2, safeNotSelected: 10,
    distinctVariants: 2, listingWrites: 2, observationWrites: 2, reviewWrites: 0,
    budget: "within_budget",
  });
  assert.deepEqual(result.selected_candidate_keys, ["11da70d6ad877fb3", "4e8ab49acab22512"]);
  assert.ok(result.safe_not_selected_candidates.every((entry) => entry.reason === "bounded_selection_capacity"));
  const selected = audit.candidates.filter((candidate) => result.selected_candidate_keys.includes(candidate.candidate_key));
  assert.equal(selected.filter((candidate) => candidate.checks.parent_series_edition_conflict === true).length, 0);
  assert.ok(selected.every((candidate) => candidate.assessment.review_required === false));
});

test("Run 31930988966 replay selection is stable under full candidate reversal", () => {
  const audit = productionReplayAudit();
  const expected = replayPlan(audit).selected_candidate_keys;
  audit.candidates.reverse();
  assert.deepEqual(replayPlan(audit).selected_candidate_keys, expected);
});

test("Run 31930988966 cross-run replay advances to uncovered candidate and variant", () => {
  const audit = productionReplayAudit();
  const first = replayPlan(audit);
  const history = first.selected_candidate_keys.map((candidateKey, index) => {
    const candidate = audit.candidates.find((entry) => entry.candidate_key === candidateKey);
    return boundedHistoryRow(candidate, index + 1);
  });
  const second = replayPlan(audit, buildMarketBoundedCoverageSnapshot(history));
  assert.deepEqual(first.selected_candidate_keys, ["11da70d6ad877fb3", "4e8ab49acab22512"]);
  assert.deepEqual(second.selected_candidate_keys, ["043c45ddd8687c1e", "3dc2f8eb3b051968"]);
  assert.equal(second.selected_new_variant_count, 1);
  assert.equal(second.selected_previously_persisted_candidate_count, 0);
  assert.equal(second.selected_candidate_keys.filter((key) => first.selected_candidate_keys.includes(key)).length, 0);
});

function select(candidates) {
  return selectDeterministicMarketPersistenceCandidates({
    candidates,
    selectedVariants: selection,
    coverageSnapshot: buildMarketBoundedCoverageSnapshot([]),
    capacity: 2,
  });
}

function replayPlan(audit, coverageSnapshot = buildMarketBoundedCoverageSnapshot([])) {
  return buildAutomaticMarketRolloutPlan({
    policy,
    policy_digest: digest,
    stage: "market-bounded",
    audit,
    head_sha: "59a2956a2ba01f22ee7240d371a6436c5b65a6c7",
    source_run_id: "31930988966",
    generated_at: "2026-08-16T00:00:00.000Z",
    throttle: { state: "clear" },
    coverage_snapshot: coverageSnapshot,
  });
}

function boundedHistoryRow(candidate, index) {
  return {
    id: `bounded-history-${index}`,
    listing_id: `listing-${candidate.candidate_key}`,
    variant_id: candidate.target.variant_id,
    observed_at: "2026-08-16T00:10:00.000Z",
    raw: {
      automatic_rollout: {
        stage: "market-bounded",
        workflow_run_id: "31930988966",
        workflow_run_attempt: "1",
        head_sha: "59a2956a2ba01f22ee7240d371a6436c5b65a6c7",
        policy_digest: "a".repeat(64),
        audit_digest: "b".repeat(64),
        plan_digest: "c".repeat(64),
        candidate_key: candidate.candidate_key,
      },
    },
  };
}

function safe(key, variantIndex, options = {}) {
  return {
    candidate_key: key,
    source: { provider: options.provider ?? "rakuten_ichiba" },
    target: { variant_id: `variant-${variantIndex}`, series_id: `series-${variantIndex}` },
    assessment: { confidence: options.confidence ?? 0.86 },
    checks: {
      explicit_label_target_match: options.explicit === true,
      parent_series_exact_evidence_present: options.parentExact === true,
      parent_series_discriminator_required: options.discriminatorRequired === true,
      parent_series_discriminator_evidence_present: options.discriminatorEvidence === true,
    },
  };
}

function productionReplayAudit() {
  const selectedVariants = selection.map((entry, index) => ({
    ...entry,
    variant_slug: `variant-${index + 1}`,
    variant_name: `Variant ${index + 1}`,
    series_slug: `series-${index + 1}`,
    series_name: `Series ${index + 1}`,
    query: `Series ${index + 1} Variant ${index + 1}`,
  }));
  const safeByVariant = {
    3: ["11da70d6ad877fb3", "3dc2f8eb3b051968", "8492b2f9864fa928", "bcacecffc5e9f6e0"],
    4: ["4e8ab49acab22512", "4f3beb24b579ce98", "88d5281cf6a4210c", "d498acc8a6dbf43d"],
    5: ["043c45ddd8687c1e", "5a07d7917816b562", "947bd5be4b5304a6", "c35d1977cad75d09"],
  };
  const candidates = Object.entries(safeByVariant).flatMap(([variant, keys]) => keys.map((key, index) =>
    auditCandidate(key, Number(variant), true, index % 2 ? "yahoo_shopping" : "rakuten_ichiba")));
  const reviewKeys = [
    "166f854f7fa57fab", "351c5a089529b41e", "3fa7ba397ccdcb50", "500ba490c34b2ea3",
    "639b01889a33e28d", "71f61e9f296d6af6", "82aa70739fe4bf60", "8e1940b2bd2b8b60",
    "94278ae3eb9ba87d", "975406d9c91ded9e", "a577334ddf57c011", "a8e60c48ebd1c572",
    "ad7cf6e17be76f6e", "c8ecaf0b9262a85f", "d3718afb47c0c9f5", "e40a0becbf66c0ef",
    "ed23f61a26b1ce36", "efbd5e56d858c37c", "fb546cbd1a4d80e6", "feb53198da0ff6c8",
  ];
  candidates.push(...reviewKeys.map((key, index) => auditCandidate(key, (index % 5) + 1, false, "rakuten_ichiba")));
  return {
    schema_version: 1,
    mode: "dry-run",
    source_scope: "planner-apis",
    workflow: { run_id: "31930988966", head_sha: "59a2956a2ba01f22ee7240d371a6436c5b65a6c7" },
    selection: { selected_variant_count: 5, query_count: 5, selected_variants: selectedVariants },
    result: { candidate_count: 32, accepted_count: 12, review_count: 20, report_complete: true, truncated_count: 0 },
    database_writes: { listings: 0, observations: 0, ingestion_runs: 0 },
    candidates,
  };
}

function auditCandidate(key, variantIndex, accepted, provider) {
  return {
    candidate_key: key,
    source: { provider, listing_id: `listing-${key}`, public_url: `https://example.com/${key}` },
    listing: { title: `Product ${key}`, price: 500, status: "active", listing_type: "single" },
    target: {
      variant_id: `variant-${variantIndex}`, variant_slug: `variant-${variantIndex}`, variant_name: `Variant ${variantIndex}`,
      series_id: `series-${variantIndex}`, series_slug: `series-${variantIndex}`, series_name: `Series ${variantIndex}`,
      search_query: `Series ${variantIndex} Variant ${variantIndex}`,
    },
    assessment: {
      accepted, review_required: !accepted,
      reason: accepted ? "variant_and_parent_evidence_confirmed" : "review_required",
      confidence: accepted ? 0.86 : 0.5,
      matched_variant_ids: accepted ? [`variant-${variantIndex}`] : [],
    },
    checks: {
      variant_evidence_present: accepted,
      parent_series_evidence_present: accepted,
      parent_series_exact_evidence_present: accepted,
      explicit_label_target_match: accepted,
      set_signal_detected: false,
      multiple_variant_candidates: false,
      explicit_variant_conflict: false,
      explicit_label_other_variant_match: false,
      explicit_label_unresolved: false,
      parent_series_edition_conflict: false,
    },
  };
}
