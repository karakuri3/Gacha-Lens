import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const originalMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260903033000_market_depth_r4_atomic_v1.sql", import.meta.url),
  "utf8",
);
const triggerRepairMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260903183500_market_observation_trigger_schema_qualification.sql", import.meta.url),
  "utf8",
);
const repairMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260903183600_market_depth_r4_postgres_regex_repair.sql", import.meta.url),
  "utf8",
);

test("R4 trigger prerequisite qualifies the historical observation relation without changing trigger semantics", () => {
  assert.match(
    triggerRepairMigration,
    /pg_get_functiondef\('public\.sync_market_observation_links\(\)'::regprocedure\)/i,
  );
  assert.match(triggerRepairMigration, /v_broken_reference constant text := 'update market_listing_observations'/i);
  assert.match(triggerRepairMigration, /v_repaired_reference constant text := 'update public\.market_listing_observations'/i);
  assert.match(triggerRepairMigration, /v_occurrences\s*<>\s*1/i);
  assert.match(triggerRepairMigration, /replace\(v_definition, v_broken_reference, v_repaired_reference\)/i);
  assert.match(triggerRepairMigration, /alter function public\.sync_market_observation_links\(\) security invoker/i);
  assert.match(triggerRepairMigration, /alter function public\.sync_market_observation_links\(\) set search_path to ''/i);
  assert.doesNotMatch(triggerRepairMigration, /drop\s+trigger/i);
  assert.doesNotMatch(triggerRepairMigration, /create\s+trigger/i);
});

test("R4 repair preserves migration history and replaces only the unsupported SQL validator semantics", () => {
  assert.match(
    originalMigration,
    /source_listing_id',[\s\S]*?\^\[A-Za-z0-9:\._-\]\{1,300\}\$/,
  );
  assert.match(repairMigration, /pg_get_functiondef\('public\.apply_market_depth_r4_atomic_v1\(jsonb\)'::regprocedure\)/i);
  assert.match(repairMigration, /v_occurrences\s*<>\s*1/i);
  assert.match(
    repairMigration,
    /length\(coalesce\(e\.value->>''source_listing_id'', ''''\)\) not between 1 and 300/i,
  );
  assert.match(
    repairMigration,
    /coalesce\(e\.value->>''source_listing_id'', ''''\) !~ ''\^\[A-Za-z0-9:\._-\]\+\$''/i,
  );
  assert.match(repairMigration, /replace\(v_definition, v_broken_guard, v_repaired_guard\)/i);
});

test("R4 repair reasserts the reviewed callable security surface", () => {
  assert.match(repairMigration, /alter function public\.apply_market_depth_r4_atomic_v1\(jsonb\) security invoker/i);
  assert.match(repairMigration, /alter function public\.apply_market_depth_r4_atomic_v1\(jsonb\) set search_path to ''/i);
  assert.match(repairMigration, /revoke execute on function public\.apply_market_depth_r4_atomic_v1\(jsonb\) from public/i);
  assert.match(repairMigration, /from anon/i);
  assert.match(repairMigration, /from authenticated/i);
  assert.match(repairMigration, /grant execute on function public\.apply_market_depth_r4_atomic_v1\(jsonb\) to service_role/i);
  assert.match(repairMigration, /aclexplode\(coalesce\(p\.proacl, acldefault\('f', p\.proowner\)\)\)/i);
  assert.match(repairMigration, /acl\.grantee\s*=\s*0/i);
  assert.match(repairMigration, /v_public_execute is distinct from false/i);
  assert.doesNotMatch(repairMigration, /has_function_privilege\('PUBLIC'/i);
  assert.match(repairMigration, /has_function_privilege\('service_role'/i);
});

test("R4 repair migration contains a real service-role transactional function invocation proof with zero residue", () => {
  assert.match(repairMigration, /set local role service_role/i);
  assert.match(repairMigration, /v_result := public\.apply_market_depth_r4_atomic_v1\(v_batch\)/i);
  assert.match(repairMigration, /market_depth_r4_runtime_proof_result_mismatch/i);
  assert.match(repairMigration, /market_depth_r4_runtime_proof_depth_mismatch/i);
  assert.match(repairMigration, /market_depth_r4_runtime_proof_rollback/i);
  assert.match(repairMigration, /current_user\s*<>\s*session_user/i);
  assert.match(repairMigration, /market_depth_r4_runtime_proof_role_not_restored/i);
  assert.match(repairMigration, /market_depth_r4_runtime_proof_residue/i);
  assert.match(repairMigration, /SQLSTATE = 'P0001'/i);
  assert.match(repairMigration, /repeat\('a', 301\)/i);
  assert.match(repairMigration, /bad\/source/i);
  assert.match(repairMigration, /SQLERRM = 'market_depth_r4_invalid_candidate'/i);
});

test("R4 repair does not weaken the insert-only R4 contract in the historical function", () => {
  assert.match(originalMigration, /insert into public\.market_listings/i);
  assert.match(originalMigration, /insert into public\.market_listing_observations/i);
  assert.doesNotMatch(originalMigration, /\bupdate\s+public\.market_listings\b/i);
  assert.doesNotMatch(originalMigration, /\bdelete\s+from\s+public\.market_listings\b/i);
  assert.match(originalMigration, /sold_at, last_observed_at/i);
  assert.match(originalMigration, /v_price, 'active'/i);
});
