import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260902150500_r2_atomic_reobservation_canary.sql", import.meta.url),
  "utf8",
);

const frozenListingIds = [
  "rakuten-auc-toysanta-10386044",
  "rakuten-realize-store-2-10575349",
  "yahoo-lead-netstore-302507s186ook3",
  "yahoo-selen-shope-5500000224314",
];

test("R2 migration is pinned to the exact #179 cohort and logical key", () => {
  for (const id of frozenListingIds) assert.match(migration, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(migration, /v_frozen_observation_key constant text := 'reobs-v1:r2-20260902-01'/);
  assert.match(migration, /r2_frozen_cohort_mismatch/);
  assert.match(migration, /v_observation_key <> v_frozen_observation_key/);
});

test("R2 migration explicitly rejects null timestamps before comparison", () => {
  assert.match(migration, /v_observed_at is null or v_expected_last_observed_at is null/);
  assert.match(migration, /r2_invalid_timestamp/);
  assert.match(migration, /v_listing\.last_observed_at is null/);
  assert.match(migration, /r2_observation_time_not_newer/);
});

test("R2 migration remains invoker-only and service-role-only", () => {
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke execute on function public\.apply_market_reobservation_r2_canary_v1\(jsonb\) from public/i);
  assert.match(migration, /from anon/i);
  assert.match(migration, /from authenticated/i);
  assert.match(migration, /grant execute on function public\.apply_market_reobservation_r2_canary_v1\(jsonb\) to service_role/i);
});
