import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  auditParentImageCleanupRecords,
  buildParentImageCleanupPlan,
  createParentImageCleanupExpectation,
  executeParentImageCleanup,
} from "../lib/domain/variant-image-parent-conflict-cleanup.js";
import { buildVariantImagePresentation } from "../lib/domain/variant-image-presentation.js";

const parent = {
  id: "series-1",
  brand: "BANDAI",
  image_url: "https://images.example/series.jpg",
};

function record(overrides = {}) {
  return {
    variant: {
      id: overrides.id || "variant-1",
      series_id: overrides.series_id || "series-1",
      source_type: overrides.source_type ?? "official_site",
      variant_type: overrides.variant_type || "normal",
      image: overrides.image === undefined ? parent.image_url : overrides.image,
      image_scope: overrides.image_scope || "",
      name: overrides.name || "Variant",
      raw: overrides.raw || {},
    },
    parent: {
      ...parent,
      ...(overrides.parent || {}),
    },
    sibling_count: overrides.sibling_count ?? 2,
  };
}

function expectationFor(records, { afterInputCount = 0 } = {}) {
  const audit = auditParentImageCleanupRecords(records);
  return createParentImageCleanupExpectation(audit, { afterInputCount });
}

test("safe multi-sibling exact parent image is cleaned in a bounded transaction", async () => {
  const records = [record()];
  const adapter = memoryAdapter(records);
  const result = await executeParentImageCleanup({
    adapter,
    expectation: expectationFor(records),
    batchSize: 1,
  });

  assert.equal(result.state, "committed");
  assert.equal(result.database_writes, 1);
  assert.equal(result.safe_candidate_count_after, 0);
  assert.equal(adapter.snapshot()[0].variant.image, null);
});

test("genuine variant image, mismatch, singleton, non-official, explicit variant scope, and invalid URL are never cleanup candidates", () => {
  const cases = [
    record({ image: "https://images.example/variant.jpg" }),
    record({ image: "https://images.example/other.jpg" }),
    record({ sibling_count: 1 }),
    record({ source_type: "community" }),
    record({ image_scope: "variant" }),
    record({ image: "", parent: { image_url: "" } }),
  ];

  const audit = auditParentImageCleanupRecords(cases);
  assert.equal(audit.candidate_count, 0);
  assert.equal(audit.rejection_counts.singleton_ambiguous, 1);
  assert.equal(audit.rejection_counts.non_official_source, 1);
  assert.equal(audit.rejection_counts.explicit_variant_scope, 1);
  assert.equal(audit.rejection_counts.invalid_or_blank_image_url, 1);
  assert.equal(audit.rejection_counts.not_exact_parent_image, 2);
});

test("already-cleaned null image is an idempotent no-op", async () => {
  const before = [record()];
  const expectation = expectationFor(before);
  const cleaned = structuredClone(before);
  cleaned[0].variant.image = null;
  const adapter = memoryAdapter(cleaned);

  const result = await executeParentImageCleanup({ adapter, expectation, batchSize: 1 });
  assert.equal(result.state, "already_clean");
  assert.equal(result.database_writes, 0);
  assert.equal(adapter.writeCalls(), 0);
});

test("digest mismatch fails closed before writes", async () => {
  const records = [record()];
  const expectation = { ...expectationFor(records), candidate_set_sha256: "sha256:" + "0".repeat(64) };
  const adapter = memoryAdapter(records);

  await assert.rejects(
    executeParentImageCleanup({ adapter, expectation, batchSize: 1 }),
    /candidate_digest_mismatch/,
  );
  assert.equal(adapter.writeCalls(), 0);
  assert.deepEqual(adapter.snapshot(), records);
});

test("expected count mismatch fails closed before writes", async () => {
  const records = [record()];
  const expectation = { ...expectationFor(records), candidate_count: 2 };
  const adapter = memoryAdapter(records);

  await assert.rejects(
    executeParentImageCleanup({ adapter, expectation, batchSize: 1 }),
    /candidate_count_mismatch/,
  );
  assert.equal(adapter.writeCalls(), 0);
});

test("concurrent variant image drift fails closed and rolls back", async () => {
  const records = [record()];
  const adapter = memoryAdapter(records, { driftVariantBeforeWrite: true });

  await assert.rejects(
    executeParentImageCleanup({ adapter, expectation: expectationFor(records), batchSize: 1 }),
    /batch_precondition_drift/,
  );
  assert.deepEqual(adapter.snapshot(), records);
});

test("parent image drift fails closed and rolls back", async () => {
  const records = [record()];
  const adapter = memoryAdapter(records, { driftParentBeforeWrite: true });

  await assert.rejects(
    executeParentImageCleanup({ adapter, expectation: expectationFor(records), batchSize: 1 }),
    /batch_precondition_drift/,
  );
  assert.deepEqual(adapter.snapshot(), records);
});

test("failed batch can be retried safely after rollback", async () => {
  const records = [
    record({ id: "variant-1" }),
    record({ id: "variant-2" }),
  ];
  const expectation = expectationFor(records);
  const adapter = memoryAdapter(records, { failAfterWriteCalls: 1 });

  await assert.rejects(
    executeParentImageCleanup({ adapter, expectation, batchSize: 1 }),
    /simulated_batch_failure/,
  );
  assert.deepEqual(adapter.snapshot(), records);

  adapter.disableFailures();
  const result = await executeParentImageCleanup({ adapter, expectation, batchSize: 1 });
  assert.equal(result.state, "committed");
  assert.equal(result.database_writes, 2);
  assert.equal(result.batch_count, 2);
});

test("cleanup changes only variant.image in memory contract", async () => {
  const records = [record({ name: "Keep me", raw: { provenance: "keep" } })];
  const adapter = memoryAdapter(records);
  const before = stripImages(adapter.snapshot());

  await executeParentImageCleanup({
    adapter,
    expectation: expectationFor(records),
    batchSize: 1,
  });

  assert.deepEqual(stripImages(adapter.snapshot()), before);
});

test("cleanup plan preserves deterministic candidate order and exact expected image", () => {
  const records = [record({ id: "variant-b" }), record({ id: "variant-a" })];
  const plan = buildParentImageCleanupPlan(records, { expectation: expectationFor(records) });

  assert.deepEqual(plan.candidates.map((item) => item.variant_id), ["variant-a", "variant-b"]);
  assert.ok(plan.candidates.every((item) => item.expected_image === parent.image_url));
  assert.ok(plan.candidates.every((item) => item.expected_parent_image === parent.image_url));
});

test("cleanup result still presents the parent image as series_fallback", async () => {
  const records = [record()];
  const adapter = memoryAdapter(records);
  await executeParentImageCleanup({
    adapter,
    expectation: expectationFor(records),
    batchSize: 1,
  });

  const cleaned = adapter.snapshot()[0];
  const presentation = buildVariantImagePresentation({
    variant: cleaned.variant,
    parent: cleaned.parent,
    siblingCount: cleaned.sibling_count,
  });

  assert.equal(presentation.variant_image_url, "");
  assert.equal(presentation.display_image_url, parent.image_url);
  assert.equal(presentation.has_variant_image, false);
  assert.equal(presentation.image_scope, "series_fallback");
});

test("production script is one-purpose, variants.image-only, batched, and has no schema mutation", () => {
  const script = fs.readFileSync("scripts/variant-image-parent-conflict-cleanup.mjs", "utf8");

  assert.match(script, /set image = null/i);
  assert.match(script, /batchSize: 200/);
  assert.match(script, /BEGIN ISOLATION LEVEL SERIALIZABLE/);
  assert.match(script, /GITHUB_EVENT_BEFORE/);
  assert.match(script, /3be94fa2c7636d49da57623796c4751d459496a0/);
  assert.doesNotMatch(script, /set\s+(?:updated_at|name|series_id|release_|price|brand|source_type|variant_type|rarity|review_required|official_url|raw)\s*=/i);
  assert.doesNotMatch(script, /ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|INSERT\s+INTO/i);
  assert.doesNotMatch(script, /update\s+public\.series/i);
});

test("production workflow runs only on the one-shot main push and performs dry-run before execute", () => {
  const workflow = fs.readFileSync(".github/workflows/variant-image-parent-conflict-cleanup.yml", "utf8");
  const dryRunIndex = workflow.indexOf("Dry run exact cleanup cohort");
  const executeIndex = workflow.indexOf("Execute bounded cleanup");

  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /actions\\/checkout@v6[\\s\\S]*fetch-depth:\\s*2/);
  assert.doesNotMatch(workflow, /workflow_dispatch:|schedule:|pull_request:/);
  assert.match(workflow, /github\.event\.before == '3be94fa2c7636d49da57623796c4751d459496a0'/);
  assert.ok(dryRunIndex >= 0 && executeIndex > dryRunIndex);
  assert.match(workflow, /SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
});

function memoryAdapter(initialRecords, options = {}) {
  let records = structuredClone(initialRecords);
  let transactionSnapshot = null;
  let calls = 0;
  let failuresEnabled = true;
  let driftApplied = false;

  return {
    async begin() {
      transactionSnapshot = structuredClone(records);
    },
    async assertWriteSurface() {},
    async readConflictRecords() {
      return structuredClone(records.filter((item) => {
        const variantImage = item.variant?.image;
        const parentImage = item.parent?.image_url;
        return variantImage != null && parentImage != null && variantImage === parentImage;
      }));
    },
    async cleanBatch(batch) {
      calls += 1;

      if (!driftApplied && options.driftVariantBeforeWrite) {
        records[0].variant.image = "https://images.example/drifted.jpg";
        driftApplied = true;
      }
      if (!driftApplied && options.driftParentBeforeWrite) {
        records[0].parent.image_url = "https://images.example/parent-drifted.jpg";
        driftApplied = true;
      }

      const updated = [];
      for (const candidate of batch) {
        const item = records.find((entry) => entry.variant.id === candidate.variant_id);
        if (!item) continue;
        const scope = String(item.variant.image_scope || item.variant.raw?.image_scope || "").trim();
        const valid = item.variant.series_id === candidate.series_id
          && item.variant.source_type === "official_site"
          && item.variant.variant_type === candidate.variant_type
          && item.variant.image === candidate.expected_image
          && item.parent.id === candidate.series_id
          && item.parent.image_url === candidate.expected_parent_image
          && item.variant.image === item.parent.image_url
          && scope !== "variant"
          && item.sibling_count === candidate.expected_sibling_count
          && item.sibling_count > 1;

        if (valid) {
          item.variant.image = null;
          updated.push(item.variant.id);
        }
      }

      if (failuresEnabled && options.failAfterWriteCalls === calls) {
        throw new Error("simulated_batch_failure");
      }
      return updated;
    },
    async commit() {
      transactionSnapshot = null;
    },
    async rollback() {
      if (transactionSnapshot) records = transactionSnapshot;
      transactionSnapshot = null;
    },
    snapshot() {
      return structuredClone(records);
    },
    writeCalls() {
      return calls;
    },
    disableFailures() {
      failuresEnabled = false;
      calls = 0;
    },
  };
}

function stripImages(records) {
  return structuredClone(records).map((item) => {
    delete item.variant.image;
    return item;
  });
}
