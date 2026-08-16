import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketBoundedCoverageSnapshot,
  MarketBoundedCoverageError,
  marketBoundedCoverageSnapshotsEqual,
  validateMarketBoundedCoverageSnapshot,
} from "../lib/domain/market-bounded-coverage.js";
import { selectDeterministicMarketPersistenceCandidates } from "../lib/domain/market-bounded-selection.js";
import { loadMarketBoundedCoverageSnapshot } from "../scripts/market-bounded-coverage-data.mjs";

const selectedVariants = [1, 2, 3].map((index) => ({
  variant_id: `variant-${index}`,
  series_id: `series-${index}`,
}));

test("no persistence history preserves Phase 8-A.3 diversity-first selection", () => {
  assert.deepEqual(select(candidates(), []).selectedCandidateKeys, [
    "0000000000000001", "0000000000000003",
  ]);
});

test("fewer than two safe candidates remain within the hard cap", () => {
  assert.deepEqual(select([safe("0000000000000001", 1)], []).selectedCandidateKeys, ["0000000000000001"]);
});

test("more than two safe candidates select exactly two", () => {
  assert.equal(select(candidates(), []).selectedCandidateKeys.length, 2);
});

test("a never-persisted variant precedes a previously persisted variant", () => {
  const history = [row("history-1", "0000000000000001", 1, "2026-08-01T00:00:00Z")];
  const result = select(candidates(), history);
  assert.deepEqual(result.selectedCandidateKeys, ["0000000000000003", "0000000000000005"]);
  assert.equal(result.selectedNewVariantCount, 2);
});

test("all persisted variants rotate oldest-first and prefer an uncovered candidate", () => {
  const history = [
    row("history-1", "0000000000000001", 1, "2026-08-01T00:00:00Z"),
    row("history-2", "0000000000000003", 2, "2026-08-02T00:00:00Z"),
    row("history-3", "0000000000000005", 3, "2026-08-03T00:00:00Z"),
  ];
  const result = select(candidates(), history);
  assert.deepEqual(result.selectedCandidateKeys, ["0000000000000002", "0000000000000004"]);
  assert.equal(result.selectedNewVariantCount, 0);
  assert.equal(result.selectedPreviouslyPersistedCandidateCount, 0);
});

test("same coverage age ties retain audited variant order and Phase 8-A.3 ranking", () => {
  const history = [
    row("history-1", "0000000000000002", 1, "2026-08-01T00:00:00Z"),
    row("history-2", "0000000000000004", 2, "2026-08-01T00:00:00Z"),
    row("history-3", "0000000000000006", 3, "2026-08-01T00:00:00Z"),
  ];
  assert.deepEqual(select(candidates(), history).selectedCandidateKeys, [
    "0000000000000001", "0000000000000003",
  ]);
});

test("candidate and provider input order do not affect rotation", () => {
  const values = candidates();
  const history = [row("history-1", "0000000000000001", 1, "2026-08-01T00:00:00Z")];
  const expected = select(values, history).selectedCandidateKeys;
  assert.deepEqual(select([...values].reverse(), [...history].reverse()).selectedCandidateKeys, expected);
});

test("snapshot is deterministic and validates its digest", () => {
  const rows = [
    row("history-2", "0000000000000003", 2, "2026-08-02T00:00:00Z"),
    row("history-1", "0000000000000001", 1, "2026-08-01T00:00:00Z"),
  ];
  const left = buildMarketBoundedCoverageSnapshot(rows);
  const right = buildMarketBoundedCoverageSnapshot([...rows].reverse());
  assert.equal(marketBoundedCoverageSnapshotsEqual(left, right), true);
  assert.equal(validateMarketBoundedCoverageSnapshot(left), left);
});

test("coverage snapshot drift is detectable before persistence", () => {
  const planned = buildMarketBoundedCoverageSnapshot([]);
  const current = buildMarketBoundedCoverageSnapshot([
    row("history-1", "0000000000000001", 1, "2026-08-01T00:00:00Z"),
  ]);
  assert.equal(marketBoundedCoverageSnapshotsEqual(planned, current), false);
});

test("malformed or unknown durable history fails closed", () => {
  const value = row("history-1", "0000000000000001", 1, "2026-08-01T00:00:00Z");
  delete value.raw.automatic_rollout.candidate_key;
  assert.throws(() => buildMarketBoundedCoverageSnapshot([value]), MarketBoundedCoverageError);
});

test("unavailable durable history fails closed", () => {
  assert.throws(() => buildMarketBoundedCoverageSnapshot(null), MarketBoundedCoverageError);
});

test("candidate identity mutation in durable history fails closed", () => {
  const left = row("history-1", "0000000000000001", 1, "2026-08-01T00:00:00Z");
  const right = row("history-2", "0000000000000001", 1, "2026-08-02T00:00:00Z", { listingId: "listing-other" });
  assert.throws(() => buildMarketBoundedCoverageSnapshot([left, right]), MarketBoundedCoverageError);
});

test("variant identity mutation in durable history fails closed", () => {
  const left = row("history-1", "0000000000000001", 1, "2026-08-01T00:00:00Z");
  const right = row("history-2", "0000000000000002", 2, "2026-08-02T00:00:00Z", { listingId: left.listing_id });
  assert.throws(() => buildMarketBoundedCoverageSnapshot([left, right]), MarketBoundedCoverageError);
});

test("duplicate durable history rows fail closed", () => {
  const value = row("history-1", "0000000000000001", 1, "2026-08-01T00:00:00Z");
  assert.throws(() => buildMarketBoundedCoverageSnapshot([value, structuredClone(value)]), MarketBoundedCoverageError);
});

test("exact rerun excludes its own durable markers and keeps the same snapshot", () => {
  const options = { exclude_workflow_run_id: "100", exclude_workflow_run_attempt: "1" };
  const before = buildMarketBoundedCoverageSnapshot([], options);
  const after = buildMarketBoundedCoverageSnapshot([
    row("history-1", "0000000000000001", 1, "2026-08-01T00:00:00Z", { runId: "100", runAttempt: "1" }),
    row("history-2", "0000000000000003", 2, "2026-08-01T00:00:00Z", { runId: "100", runAttempt: "1" }),
  ], options);
  assert.equal(marketBoundedCoverageSnapshotsEqual(before, after), true);
});

test("read-only loader uses a deterministic full-pagination query", async () => {
  let call;
  const snapshot = await loadMarketBoundedCoverageSnapshot({
    workflow: { run_id: "100", run_attempt: "1" },
    fetchRowsImpl: async (...args) => { call = args; return []; },
  });
  assert.equal(call[0], "market_listing_observations");
  assert.equal(call[1].params.order, "id.asc");
  assert.equal(call[1].params.id, "like.market-bounded-observation-*");
  assert.equal(call[1].pageSize, 1000);
  assert.equal(snapshot.source_row_count, 0);
});

function select(values, history) {
  return selectDeterministicMarketPersistenceCandidates({
    candidates: values,
    selectedVariants,
    coverageSnapshot: buildMarketBoundedCoverageSnapshot(history),
    capacity: 2,
  });
}

function candidates() {
  return [
    safe("0000000000000002", 1, 0.86),
    safe("0000000000000001", 1, 0.91),
    safe("0000000000000004", 2, 0.86),
    safe("0000000000000003", 2, 0.91),
    safe("0000000000000006", 3, 0.86),
    safe("0000000000000005", 3, 0.91),
  ];
}

function safe(candidateKey, variantIndex, confidence = 0.86) {
  return {
    candidate_key: candidateKey,
    source: { provider: variantIndex % 2 ? "rakuten_ichiba" : "yahoo_shopping" },
    target: { variant_id: `variant-${variantIndex}`, series_id: `series-${variantIndex}` },
    assessment: { confidence },
    checks: {
      explicit_label_target_match: true,
      parent_series_exact_evidence_present: true,
      parent_series_discriminator_required: false,
      parent_series_discriminator_evidence_present: false,
    },
  };
}

function row(id, candidateKey, variantIndex, observedAt, options = {}) {
  const listingId = options.listingId ?? `listing-${candidateKey}`;
  return {
    id,
    listing_id: listingId,
    variant_id: `variant-${variantIndex}`,
    observed_at: observedAt,
    raw: {
      automatic_rollout: {
        stage: "market-bounded",
        workflow_run_id: options.runId ?? String(200 + Number(id.replace(/\D/g, "") || 0)),
        workflow_run_attempt: options.runAttempt ?? "1",
        head_sha: "a".repeat(40),
        policy_digest: "b".repeat(64),
        audit_digest: "c".repeat(64),
        plan_digest: "d".repeat(64),
        candidate_key: candidateKey,
      },
    },
  };
}
