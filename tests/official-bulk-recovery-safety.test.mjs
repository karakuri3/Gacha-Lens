import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  OFFICIAL_RERELEASE_SKIP_CONFIRMATION,
  assertLegacyOfficialRecordsSafe,
  partitionLegacyOfficialRecords,
  resolveLegacyOfficialRereleasePolicy,
} from "../lib/domain/official-upsert-safety.js";

const ordinary = { id: "ordinary", name: "ordinary" };
const rerelease = {
  id: "rerelease",
  name: "rerelease",
  raw: {
    rerelease: {
      is_rerelease: true,
      original_release: {
        year: 2025,
        month: 1,
        release_date: null,
        release_month: "1月",
        release_week: "未定",
        precision: "month",
      },
      current_schedule: {
        year: 2026,
        release_date: null,
        release_month: "9月",
        release_week: "第2週",
        precision: "week",
      },
    },
  },
};

test("legacy official policy remains fail-closed by default", () => {
  assert.equal(resolveLegacyOfficialRereleasePolicy(), "block");
  assert.throws(() => assertLegacyOfficialRecordsSafe([ordinary, rerelease]), /cannot persist rerelease semantics/);
});

test("one-time skip policy requires the exact explicit confirmation", () => {
  assert.throws(
    () => resolveLegacyOfficialRereleasePolicy({ policy: "skip", confirmation: "wrong" }),
    /invalid or missing/,
  );
  assert.equal(
    resolveLegacyOfficialRereleasePolicy({
      policy: "skip",
      confirmation: OFFICIAL_RERELEASE_SKIP_CONFIRMATION,
    }),
    "skip",
  );
});

test("partition isolates rerelease records without mutating ordinary records", () => {
  const result = partitionLegacyOfficialRecords([ordinary, rerelease]);
  assert.deepEqual(result.safeRecords, [ordinary]);
  assert.deepEqual(result.blockedRecords, [rerelease]);
});

test("one-time recovery workflow scopes skip mode to the official bulk step and keeps scheduled auto untouched", () => {
  const workflow = fs.readFileSync(".github/workflows/gacha-other-data-bulk-recovery-once.yml", "utf8");
  assert.match(workflow, /gacha-other-data-bulk-recovery-repair-20260918\.token/);
  assert.match(workflow, /OFFICIAL_RERELEASE_POLICY: skip/);
  assert.match(workflow, /APPROVE_OFFICIAL_RERELEASE_SKIP_FOR_ONE_TIME_RECOVERY_V1/);
  assert.match(workflow, /Bulk refresh official non-rerelease detail lineups/);
  assert.doesNotMatch(workflow, /OFFICIAL_BOUNDED_AUTO_ENABLED:\s*true/);
  const scheduled = fs.readFileSync(".github/workflows/gacha-official-bounded-auto.yml", "utf8");
  assert.match(scheduled, /OFFICIAL_BOUNDED_AUTO_ENABLED/);
  assert.doesNotMatch(scheduled, /OFFICIAL_RERELEASE_POLICY: skip/);
});
