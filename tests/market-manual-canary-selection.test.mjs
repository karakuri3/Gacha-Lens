import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildMarketManualCanarySelectionDiagnostics,
  manualCanarySelectionOptions,
  parseMarketManualCanarySelectionProfile,
  sanitizeMarketManualCanarySelectionDiagnostics,
  shouldApplyMarketManualCanarySelection,
} from "../lib/domain/market-manual-canary-selection.js";
import { selectMarketCollectionTargets } from "../lib/domain/market-coverage.js";
import {
  buildSanitizedMarketCandidateAudit,
  renderMarketCandidateAuditMarkdown,
} from "../lib/domain/market-candidate-audit.js";
import { planMarketSearchQueries } from "../lib/fetchers/market-query-planner.js";

const NOW = new Date("2026-07-30T00:00:00Z");
const GASPARD_ID = "gashapon-4570118183576000-ガスパール";
const PROFILE = Object.freeze({
  schema_version: 1,
  profile: "manual_canary_diversity",
  max_variants_per_series: 1,
  blocked_variants: [{
    variant_id: GASPARD_ID,
    reason: "repeated_target_variant_not_confirmed",
    evidence_candidate_key: "3908a16901a36053",
  }],
});

function row(id, seriesId, overrides = {}) {
  return {
    variantId: id,
    slug: id,
    seriesId,
    seriesName: `Series ${seriesId}`,
    variantName: `Variant ${id}`,
    coverageState: overrides.coverageState ?? "no_evidence",
    priority: Object.hasOwn(overrides, "priority") ? overrides.priority : 1,
    priorityReason: overrides.priorityReason ?? "missing_evidence",
    released: overrides.released ?? true,
    lastCollectionAttemptAt: overrides.lastCollectionAttemptAt ?? null,
  };
}

function catalogFor(rows) {
  const series = [...new Set(rows.map((entry) => entry.seriesId))].map((id) => ({
    id,
    slug: id,
    name: `Series ${id}`,
    franchise: `Franchise ${id}`,
  }));
  const variants = rows.map((entry) => ({
    id: entry.variantId,
    slug: entry.variantId,
    series_id: entry.seriesId,
    name: entry.variantName,
    variant_type: "normal",
    released: entry.released,
  }));
  return {
    series,
    variants,
    seriesById: new Map(series.map((entry) => [entry.id, entry])),
    variantById: new Map(variants.map((entry) => [entry.id, entry])),
  };
}

function constrained(rows, overrides = {}) {
  return selectMarketCollectionTargets(rows, {
    now: NOW,
    cooldownHours: 0,
    limit: 5,
    ...manualCanarySelectionOptions(PROFILE),
    ...overrides,
  });
}

test("default selection remains unchanged without optional constraints", () => {
  const rows = [row("a1", "a"), row("a2", "a"), row("b1", "b")];
  const first = selectMarketCollectionTargets(rows, { now: NOW, cooldownHours: 0, limit: 3 });
  const second = selectMarketCollectionTargets(rows, {
    now: NOW,
    cooldownHours: 0,
    limit: 3,
    excludedVariantIds: [],
    maxVariantsPerSeries: Infinity,
  });
  assert.deepEqual(second, first);
  assert.equal("skipped_series_cap" in first.summary, false);
});

test("series cap selects at most one variant from each series and fills from later series", () => {
  const plan = constrained([
    row("a1", "a"), row("a2", "a"), row("b1", "b"), row("c1", "c"),
    row("a3", "a"), row("d1", "d"), row("e1", "e"),
  ]);
  assert.equal(plan.selected.length, 5);
  assert.equal(new Set(plan.selected.map((entry) => entry.seriesId)).size, 5);
  assert.equal(plan.summary.skipped_series_cap, 2);
});

test("selection remains below limit when distinct series are unavailable", () => {
  const plan = constrained([row("a1", "a"), row("a2", "a"), row("b1", "b")]);
  assert.equal(plan.selected.length, 2);
  assert.equal(plan.summary.distinct_series_selected, 2);
});

test("blocked variants are excluded and counted", () => {
  const plan = constrained([row(GASPARD_ID, "gaspard"), row("b1", "b")]);
  assert.deepEqual(plan.selected.map((entry) => entry.variantId), ["b1"]);
  assert.equal(plan.summary.skipped_excluded_variants, 1);
});

test("priority, cooldown, release, eligibility and trusted-tier filters are preserved", () => {
  const rows = [
    row("low", "low", { priority: 2 }),
    row("high", "high", { priority: 1 }),
    row("cooldown", "cooldown", { lastCollectionAttemptAt: "2026-07-29T23:30:00Z" }),
    row("upcoming", "upcoming", { released: false }),
    row("ineligible", "ineligible", { coverageState: "not_eligible" }),
    row("trusted", "trusted", { priority: null }),
  ];
  const plan = constrained(rows, { priority: 1, release: "released", cooldownHours: 24 });
  assert.deepEqual(plan.selected.map((entry) => entry.variantId), ["high"]);
  assert.equal(plan.summary.skipped_cooldown, 1);
  assert.equal(plan.summary.skipped_eligibility, 1);
  assert.equal(plan.summary.skipped_trusted_tier, 1);
  assert.equal(plan.summary.skipped_priority, 1);
});

test("rotation ordering stays deterministic and constraints only remove rows", () => {
  const rows = [row("a1", "a"), row("a2", "a"), row("b1", "b"), row("c1", "c")];
  const normal = selectMarketCollectionTargets(rows, { now: NOW, cooldownHours: 0, limit: 4 });
  const plan = constrained(rows);
  const normalOrder = normal.selected.map((entry) => entry.variantId);
  assert.deepEqual(plan.selected, [...plan.selected].sort(
    (left, right) => normalOrder.indexOf(left.variantId) - normalOrder.indexOf(right.variantId),
  ));
  assert.deepEqual(constrained([...rows].reverse()), plan);
});

test("query plan keeps unique variants, unique queries and one query per selection", () => {
  const rows = [row("a1", "a"), row("a2", "a"), row("b1", "b"), row("c1", "c")];
  const plan = planMarketSearchQueries(catalogFor(rows), rows, {
    now: NOW,
    cooldownHours: 0,
    limit: 5,
    ...manualCanarySelectionOptions(PROFILE),
  });
  assert.equal(plan.selected.length, plan.queries.length);
  assert.equal(new Set(plan.selected.map((entry) => entry.variantId)).size, plan.selected.length);
  assert.equal(new Set(plan.queries.map((entry) => entry.query)).size, plan.queries.length);
});

test("manual profile applies only to external market workflow-dispatch dry-runs", () => {
  const base = { task: "market", mode: "dry-run", executeSources: true, eventName: "workflow_dispatch" };
  assert.equal(shouldApplyMarketManualCanarySelection(base), true);
  assert.equal(shouldApplyMarketManualCanarySelection({ ...base, mode: "canary-write" }), false);
  assert.equal(shouldApplyMarketManualCanarySelection({ ...base, mode: "write" }), false);
  assert.equal(shouldApplyMarketManualCanarySelection({ ...base, eventName: "schedule" }), false);
  assert.equal(shouldApplyMarketManualCanarySelection({ ...base, executeSources: false }), false);
  assert.equal(shouldApplyMarketManualCanarySelection({ ...base, task: "official" }), false);
});

test("profile validation fails closed for malformed, duplicate and unknown schema input", () => {
  assert.throws(() => parseMarketManualCanarySelectionProfile(null), /must be an object/);
  assert.throws(() => parseMarketManualCanarySelectionProfile({ ...PROFILE, schema_version: 2 }), /Unsupported/);
  assert.throws(() => parseMarketManualCanarySelectionProfile({
    ...PROFILE,
    blocked_variants: [...PROFILE.blocked_variants, ...PROFILE.blocked_variants],
  }), /unique/);
  assert.throws(() => parseMarketManualCanarySelectionProfile({
    ...PROFILE,
    blocked_variants: [{ ...PROFILE.blocked_variants[0], evidence_candidate_key: "invalid" }],
  }), /evidence key/);
  assert.throws(() => parseMarketManualCanarySelectionProfile({ ...PROFILE, secret: "no" }), /unsupported field/);
});

test("the checked-in profile is valid and contains the single approved block", async () => {
  const source = await readFile(new URL("../config/market-manual-canary-selection.json", import.meta.url), "utf8");
  const profile = parseMarketManualCanarySelectionProfile(JSON.parse(source));
  assert.equal(profile.blocked_variants.length, 1);
  assert.equal(profile.blocked_variants[0].variant_id, GASPARD_ID);
  assert.equal(profile.max_variants_per_series, 1);
});

test("diagnostics are count-only, deterministic and sanitized", () => {
  const plan = constrained([row(GASPARD_ID, "gaspard"), row("a1", "a"), row("a2", "a"), row("b1", "b")]);
  const diagnostics = buildMarketManualCanarySelectionDiagnostics(PROFILE, plan.summary);
  assert.deepEqual(diagnostics, {
    name: "manual_canary_diversity",
    max_variants_per_series: 1,
    blocked_variant_count: 1,
    blocked_variants_skipped: 1,
    series_cap_skipped: 1,
    distinct_series_selected: 2,
    selected_variant_count: 2,
  });
  assert.deepEqual(sanitizeMarketManualCanarySelectionDiagnostics(diagnostics), diagnostics);
  assert.doesNotMatch(JSON.stringify(diagnostics), /ガスパール|3908a16901a36053|seller|url|credential/i);
});

test("candidate audit and Markdown include sanitized profile diagnostics", () => {
  const rows = [row("a1", "a")];
  const plan = planMarketSearchQueries(catalogFor(rows), rows, {
    now: NOW,
    cooldownHours: 0,
    limit: 1,
    ...manualCanarySelectionOptions(PROFILE),
  });
  const selectionProfile = buildMarketManualCanarySelectionDiagnostics(PROFILE, plan.summary);
  const report = buildSanitizedMarketCandidateAudit({
    records: [],
    queryPlan: plan.queries,
    catalog: catalogFor(rows),
    runContext: { mode: "dry-run", source_scope: "planner-apis" },
    summary: {
      selection_profile: selectionProfile,
      safety_assessed_records: 0,
      no_result_variants: 1,
      listing_upserts: 0,
      observations_created: 0,
      ingestion_runs_written: 0,
    },
  });
  assert.deepEqual(report.selection_profile, selectionProfile);
  const markdown = renderMarketCandidateAuditMarkdown(report);
  const profileSection = markdown.match(/## Selection profile[\s\S]*?(?=\n## Summary)/)?.[0] ?? "";
  assert.match(markdown, /Selection profile/);
  assert.match(markdown, /manual\\_canary\\_diversity/);
  assert.doesNotMatch(profileSection, /ガスパール|3908a16901a36053|seller|private URL/i);

  const invalid = structuredClone(report);
  invalid.selection_profile.selected_variant_count = 2;
  assert.throws(
    () => renderMarketCandidateAuditMarkdown(invalid),
    /profile count does not match/,
  );
});

test("Gaspard is blocked only when manual profile options are supplied", () => {
  const rows = [row(GASPARD_ID, "gaspard"), row("b1", "b")];
  const normal = selectMarketCollectionTargets(rows, { now: NOW, cooldownHours: 0, limit: 2 });
  const manual = constrained(rows);
  assert.ok(normal.selected.some((entry) => entry.variantId === GASPARD_ID));
  assert.ok(manual.selected.every((entry) => entry.variantId !== GASPARD_ID));
});

test("market backfill wires the profile only through the manual dry-run predicate", async () => {
  const source = await readFile(new URL("../scripts/market-backfill.mjs", import.meta.url), "utf8");
  assert.match(source, /shouldApplyMarketManualCanarySelection/);
  assert.match(source, /eventName: process\.env\.GITHUB_EVENT_NAME/);
  const canary = source.match(/async function runCanaryWriteMode[\s\S]*?function assessFetchedRecords/)?.[0] ?? "";
  const write = source.match(/async function runWriteMode[\s\S]*?async function runCanaryWriteMode/)?.[0] ?? "";
  assert.doesNotMatch(canary, /resolveManualSelectionProfile/);
  assert.doesNotMatch(write, /resolveManualSelectionProfile/);
});

test("approved query replay remains independent of the manual selection profile", async () => {
  const source = await readFile(new URL("../lib/domain/market-approved-query-replay.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /manual-canary|manualCanary|maxVariantsPerSeries|excludedVariantIds/);
});
