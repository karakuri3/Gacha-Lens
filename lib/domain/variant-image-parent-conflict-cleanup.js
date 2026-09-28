import {
  buildVariantParentImageConflictAudit,
} from "./variant-image-parent-conflict.js";

export const PARENT_IMAGE_CLEANUP_PRODUCTION_EXPECTATION = Object.freeze({
  before_input_count: 7072,
  candidate_count: 5885,
  candidate_set_sha256: "sha256:5f5ce212e4e8518df554b16c3342a3cea6fa154c35238e344586715f14fdf4c9",
  candidate_type_buckets: Object.freeze({
    provisional: 2383,
    normal: 3492,
    rare: 5,
    secret: 5,
    other: 0,
  }),
  singleton_ambiguous: 1187,
  after_input_count: 1187,
});

export const PARENT_IMAGE_CLEANUP_BATCH_SIZE = 200;

export function auditParentImageCleanupRecords(records = []) {
  return buildVariantParentImageConflictAudit({
    schema_version: 1,
    records,
  });
}

export function createParentImageCleanupExpectation(audit, {
  afterInputCount = 0,
} = {}) {
  return {
    before_input_count: audit.record_count,
    candidate_count: audit.candidate_count,
    candidate_set_sha256: audit.candidate_set_sha256,
    candidate_type_buckets: { ...audit.candidate_type_buckets },
    singleton_ambiguous: audit.rejection_counts?.singleton_ambiguous || 0,
    after_input_count: afterInputCount,
  };
}

export function buildParentImageCleanupPlan(records = [], {
  expectation = PARENT_IMAGE_CLEANUP_PRODUCTION_EXPECTATION,
} = {}) {
  const audit = auditParentImageCleanupRecords(records);

  if (isExpectedPostState(audit, expectation)) {
    return {
      state: "already_clean",
      audit,
      candidates: [],
      batches: [],
      expected_write_count: 0,
    };
  }

  assertExpectedBeforeAudit(audit, expectation);

  const byId = new Map();
  for (const record of records) {
    const id = text(record?.variant?.id);
    if (!id) continue;
    if (byId.has(id)) throw cleanupError("duplicate_variant_record");
    byId.set(id, record);
  }

  const candidates = audit.candidates.map((candidate) => {
    const record = byId.get(candidate.variant_id);
    if (!record) throw cleanupError("candidate_record_missing");

    const variantImage = rawText(record.variant?.image);
    const parentImage = rawText(record.parent?.image_url);
    if (!variantImage || !parentImage || variantImage !== parentImage) {
      throw cleanupError("candidate_raw_image_mismatch");
    }

    return Object.freeze({
      variant_id: candidate.variant_id,
      series_id: candidate.series_id,
      variant_type: candidate.variant_type,
      expected_image: variantImage,
      expected_parent_image: parentImage,
      expected_source_type: rawText(record.variant?.source_type),
      expected_image_scope: rawText(record.variant?.image_scope || record.variant?.raw?.image_scope),
      expected_sibling_count: Number(record.sibling_count),
    });
  });

  if (candidates.length !== expectation.candidate_count) {
    throw cleanupError("candidate_plan_count_mismatch");
  }

  return {
    state: "ready",
    audit,
    candidates,
    batches: chunk(candidates, PARENT_IMAGE_CLEANUP_BATCH_SIZE),
    expected_write_count: candidates.length,
  };
}

export async function executeParentImageCleanup({
  adapter,
  expectation = PARENT_IMAGE_CLEANUP_PRODUCTION_EXPECTATION,
  batchSize = PARENT_IMAGE_CLEANUP_BATCH_SIZE,
} = {}) {
  if (!adapter
    || typeof adapter.begin !== "function"
    || typeof adapter.readConflictRecords !== "function"
    || typeof adapter.cleanBatch !== "function"
    || typeof adapter.commit !== "function"
    || typeof adapter.rollback !== "function") {
    throw cleanupError("invalid_cleanup_adapter");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw cleanupError("invalid_batch_size");
  }

  let transactionStarted = false;
  let commitStarted = false;
  try {
    await adapter.begin();
    transactionStarted = true;

    if (typeof adapter.assertWriteSurface === "function") {
      await adapter.assertWriteSurface();
    }

    const beforeRecords = await adapter.readConflictRecords();
    const plan = buildParentImageCleanupPlan(beforeRecords, { expectation });

    if (plan.state === "already_clean") {
      commitStarted = true;
      await adapter.commit();
      return {
        state: "already_clean",
        database_writes: 0,
        batch_count: 0,
        candidate_count_before: 0,
        candidate_set_sha256: plan.audit.candidate_set_sha256,
        singleton_ambiguous_after: expectation.singleton_ambiguous,
      };
    }

    const batches = chunk(plan.candidates, batchSize);
    let databaseWrites = 0;
    const batchResults = [];

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const updated = await adapter.cleanBatch(batch);
      const updatedIds = normalizeUpdatedIds(updated);
      const expectedIds = batch.map((item) => item.variant_id);

      if (!sameOrderedSet(updatedIds, expectedIds)) {
        throw cleanupError("batch_precondition_drift");
      }

      databaseWrites += updatedIds.length;
      batchResults.push({
        batch: index + 1,
        expected: batch.length,
        updated: updatedIds.length,
      });
    }

    if (databaseWrites !== expectation.candidate_count) {
      throw cleanupError("total_write_count_mismatch");
    }

    const afterRecords = await adapter.readConflictRecords();
    const afterAudit = auditParentImageCleanupRecords(afterRecords);
    assertExpectedAfterAudit(afterAudit, expectation);

    commitStarted = true;
    await adapter.commit();

    return {
      state: "committed",
      database_writes: databaseWrites,
      batch_count: batchResults.length,
      batches: batchResults,
      candidate_count_before: plan.audit.candidate_count,
      candidate_set_sha256: plan.audit.candidate_set_sha256,
      candidate_type_buckets: plan.audit.candidate_type_buckets,
      singleton_ambiguous_before: plan.audit.rejection_counts?.singleton_ambiguous || 0,
      safe_candidate_count_after: afterAudit.candidate_count,
      exact_parent_conflicts_after: afterAudit.record_count,
      singleton_ambiguous_after: afterAudit.rejection_counts?.singleton_ambiguous || 0,
    };
  } catch (error) {
    if (transactionStarted && !commitStarted) {
      await adapter.rollback().catch(() => {});
    }
    if (commitStarted) error.commit_outcome_unknown = true;
    throw error;
  }
}

export function assertExpectedBeforeAudit(audit, expectation = PARENT_IMAGE_CLEANUP_PRODUCTION_EXPECTATION) {
  const singleton = audit.rejection_counts?.singleton_ambiguous || 0;
  const onlySingletonRejected = audit.rejected_count === singleton
    && Object.keys(audit.rejection_counts || {}).every((reason) => reason === "singleton_ambiguous");

  if (audit.record_count !== expectation.before_input_count) throw cleanupError("audit_input_count_mismatch");
  if (audit.candidate_count !== expectation.candidate_count) throw cleanupError("candidate_count_mismatch");
  if (audit.candidate_set_sha256 !== expectation.candidate_set_sha256) throw cleanupError("candidate_digest_mismatch");
  if (!sameTypeBuckets(audit.candidate_type_buckets, expectation.candidate_type_buckets)) {
    throw cleanupError("candidate_type_breakdown_mismatch");
  }
  if (singleton !== expectation.singleton_ambiguous || !onlySingletonRejected) {
    throw cleanupError("candidate_rejection_mismatch");
  }
  return true;
}

export function assertExpectedAfterAudit(audit, expectation = PARENT_IMAGE_CLEANUP_PRODUCTION_EXPECTATION) {
  const singleton = audit.rejection_counts?.singleton_ambiguous || 0;
  const onlySingletonRejected = audit.rejected_count === singleton
    && Object.keys(audit.rejection_counts || {}).every((reason) => reason === "singleton_ambiguous");

  if (audit.record_count !== expectation.after_input_count) throw cleanupError("post_input_count_mismatch");
  if (audit.candidate_count !== 0) throw cleanupError("post_candidate_count_nonzero");
  if (singleton !== expectation.singleton_ambiguous || !onlySingletonRejected) {
    throw cleanupError("post_singleton_mismatch");
  }
  return true;
}

export function isExpectedPostState(audit, expectation = PARENT_IMAGE_CLEANUP_PRODUCTION_EXPECTATION) {
  try {
    assertExpectedAfterAudit(audit, expectation);
    return true;
  } catch {
    return false;
  }
}

function normalizeUpdatedIds(updated) {
  const values = Array.isArray(updated) ? updated : [];
  return values.map((item) => typeof item === "string" ? item : item?.id)
    .filter(Boolean)
    .sort(compareUtf8);
}

function sameOrderedSet(left, right) {
  const a = [...left].sort(compareUtf8);
  const b = [...right].sort(compareUtf8);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameTypeBuckets(left = {}, right = {}) {
  return ["provisional", "normal", "rare", "secret", "other"]
    .every((key) => Number(left[key] || 0) === Number(right[key] || 0));
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(String(left), "utf8"), Buffer.from(String(right), "utf8"));
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function rawText(value) {
  return value == null ? "" : String(value);
}

function cleanupError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
