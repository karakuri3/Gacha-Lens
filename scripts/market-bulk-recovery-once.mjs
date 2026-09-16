import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { loadMarketCoverageData } from "./market-coverage-data.mjs";
import { executeP3BoundedSeedV2 } from "./market-p3-bounded-seed-v2.mjs";
import { fetchRowCount } from "./supabase-rest.mjs";

export const BULK_RECOVERY_CONFIRMATION = "APPROVE_GACHA_MARKET_BULK_RECOVERY_20260916";
export const BULK_RECOVERY_MAX_TARGETS = 100;
export const BULK_RECOVERY_MAX_ROUNDS = 7;
export const BULK_RECOVERY_ROUND_LIMIT = 25;
export const BULK_RECOVERY_LOOKBACK_DAYS = 30;

export function selectBulkRecoveryTargets(rows = [], { now = new Date(), lookbackDays = BULK_RECOVERY_LOOKBACK_DAYS } = {}) {
  const current = validDate(now);
  if (!current) throw new Error("Bulk market recovery now is invalid.");
  const cutoff = current.getTime() - lookbackDays * 24 * 60 * 60 * 1000;
  return rows.filter((row) => {
    const release = validDate(row?.releaseDate);
    return row?.released === true
      && Number(row?.eligibleListingCount) === 0
      && Number(row?.priority) === 3
      && release
      && release.getTime() >= cutoff
      && release.getTime() <= current.getTime();
  });
}

export function summarizeBulkRecoverySeriesDepth(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const seriesId = String(row?.seriesId ?? "").trim();
    if (!seriesId) throw new Error("Bulk market recovery target is missing a series ID.");
    counts.set(seriesId, (counts.get(seriesId) ?? 0) + 1);
  }
  const values = [...counts.values()];
  return {
    distinct_series: counts.size,
    max_variants_per_series: values.length ? Math.max(...values) : 0,
  };
}

export function validateBulkRecoveryInvocation({ event_name, ref, confirmation, head_sha, origin_main_sha } = {}) {
  const head = String(head_sha ?? "").trim();
  const origin = String(origin_main_sha ?? "").trim();
  if (event_name !== "push" || ref !== "refs/heads/main" || confirmation !== BULK_RECOVERY_CONFIRMATION) {
    throw new Error("Bulk market recovery invocation is not authorized.");
  }
  if (!/^[0-9a-f]{40}$/.test(head) || head !== origin) {
    throw new Error("Bulk market recovery main revision is not exact.");
  }
  return "manual-v2";
}

export async function runBulkMarketRecoveryOnce({
  output_dir = process.argv.find((arg) => arg.startsWith("--output-dir="))?.slice("--output-dir=".length) || "market-bulk-recovery-once",
  now = new Date(),
} = {}) {
  validateBulkRecoveryInvocation({
    event_name: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    confirmation: process.env.GACHA_MARKET_BULK_RECOVERY_CONFIRMATION,
    head_sha: process.env.GITHUB_SHA,
    origin_main_sha: process.env.GACHA_MARKET_BULK_RECOVERY_ORIGIN_MAIN_SHA,
  });

  const output = path.resolve(output_dir);
  fs.mkdirSync(output, { recursive: true });
  const before = await productionCounts();
  const catalog = await loadOfficialCatalog();
  const initialData = await loadMarketCoverageData({ catalog });
  const targets = selectBulkRecoveryTargets(initialData.coverageRows, { now });
  const targetIds = targets.map((row) => String(row.variantId));
  const targetSet = new Set(targetIds);
  if (targetSet.size !== targetIds.length) throw new Error("Bulk market recovery targets are not unique.");
  if (targets.length > BULK_RECOVERY_MAX_TARGETS) throw new Error("Bulk market recovery target count exceeds the fixed cap.");

  const depth = summarizeBulkRecoverySeriesDepth(targets);
  if (depth.max_variants_per_series > BULK_RECOVERY_MAX_ROUNDS) {
    throw new Error("Bulk market recovery requires more rounds than the fixed safety cap.");
  }

  const attempted = new Set();
  const persisted = new Set();
  const rounds = [];
  const runId = String(process.env.GITHUB_RUN_ID ?? "").trim();
  const roundCount = Math.min(BULK_RECOVERY_MAX_ROUNDS, depth.max_variants_per_series);

  for (let round = 1; round <= roundCount; round += 1) {
    const roundDir = path.join(output, `round-${String(round).padStart(2, "0")}`);
    const execution = await executeP3BoundedSeedV2({
      output_dir: roundDir,
      fixed_limit: BULK_RECOVERY_ROUND_LIMIT,
      execution_mode: "manual-v2",
      stage: "p3-bounded-seed-v2",
      target_variant_ids: targetIds,
      additional_excluded_variant_ids: [...attempted],
      rotation_key: `priority-3-bulk-recovery:${runId}:${round}`,
      validate_invocation: () => validateBulkRecoveryInvocation({
        event_name: process.env.GITHUB_EVENT_NAME,
        ref: process.env.GITHUB_REF,
        confirmation: process.env.GACHA_MARKET_BULK_RECOVERY_CONFIRMATION,
        head_sha: process.env.GITHUB_SHA,
        origin_main_sha: process.env.GACHA_MARKET_BULK_RECOVERY_ORIGIN_MAIN_SHA,
      }),
    });

    const attemptedThisRound = execution.attempted_variant_ids.filter((id) => targetSet.has(id));
    for (const id of attemptedThisRound) attempted.add(id);
    for (const id of execution.result?.selection?.persisted_variant_ids ?? []) {
      if (targetSet.has(id)) persisted.add(id);
    }
    rounds.push({
      round,
      attempted: attemptedThisRound.length,
      persisted: (execution.result?.selection?.persisted_variant_ids ?? []).filter((id) => targetSet.has(id)).length,
      status: execution.result?.status ?? "unknown",
      database_writes: Number(execution.result?.database_writes) || 0,
      rotation_key: execution.rotation_key,
    });
    if (attemptedThisRound.length === 0) break;
  }

  const postData = await loadMarketCoverageData({ catalog: await loadOfficialCatalog() });
  const postById = new Map(postData.coverageRows.map((row) => [String(row.variantId), row]));
  const coveredAfter = targetIds.filter((id) => Number(postById.get(id)?.eligibleListingCount) > 0);
  const after = await productionCounts();
  if (after.review_required !== before.review_required) {
    throw new Error("Bulk market recovery changed the review-required listing count.");
  }

  const summary = {
    schema_version: 1,
    status: "completed",
    contract: {
      lookback_days: BULK_RECOVERY_LOOKBACK_DAYS,
      round_limit: BULK_RECOVERY_ROUND_LIMIT,
      max_rounds: BULK_RECOVERY_MAX_ROUNDS,
      max_targets: BULK_RECOVERY_MAX_TARGETS,
      one_variant_per_series_per_round: true,
      strict_matcher_unchanged: true,
      source_scope: "planner-apis",
    },
    target_count: targets.length,
    distinct_target_series: depth.distinct_series,
    max_target_variants_per_series: depth.max_variants_per_series,
    attempted_count: attempted.size,
    persisted_count: persisted.size,
    covered_after_count: coveredAfter.length,
    unresolved_count: targetIds.length - coveredAfter.length,
    rounds,
    production_counts_before: before,
    production_counts_after: after,
    deltas: {
      market_listings: after.market_listings - before.market_listings,
      market_listing_observations: after.market_listing_observations - before.market_listing_observations,
      review_required: after.review_required - before.review_required,
    },
  };
  fs.writeFileSync(path.join(output, "bulk-recovery-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "bulk-recovery-summary.md"), renderSummary(summary));
  console.log(JSON.stringify({ ok: true, target_count: summary.target_count, attempted_count: summary.attempted_count, persisted_count: summary.persisted_count, covered_after_count: summary.covered_after_count }));
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runBulkMarketRecoveryOnce();
}

async function productionCounts() {
  const [marketListings, marketObservations, reviewRequired] = await Promise.all([
    fetchRowCount("market_listings"),
    fetchRowCount("market_listing_observations"),
    fetchRowCount("market_listings", { review_required: "eq.true" }),
  ]);
  return {
    market_listings: Number(marketListings),
    market_listing_observations: Number(marketObservations),
    review_required: Number(reviewRequired),
  };
}

function renderSummary(summary) {
  return [
    "# Gacha market bulk recovery result",
    "",
    `- Status: ${summary.status}`,
    `- Targets: ${summary.target_count}`,
    `- Distinct series: ${summary.distinct_target_series}`,
    `- Attempted: ${summary.attempted_count}`,
    `- Persisted: ${summary.persisted_count}`,
    `- Covered after: ${summary.covered_after_count}`,
    `- Unresolved: ${summary.unresolved_count}`,
    `- Listing delta: ${summary.deltas.market_listings}`,
    `- Observation delta: ${summary.deltas.market_listing_observations}`,
    `- Review-required delta: ${summary.deltas.review_required}`,
    "",
  ].join("\n");
}

function validDate(value) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}
