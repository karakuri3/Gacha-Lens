import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  authorizeOfficialPhaseA3Write,
  buildOfficialPhaseA3WriteResult,
  expectedOfficialPhaseA3PostCounts,
  verifyOfficialPhaseA3PostState,
} from "../lib/domain/official-phase-a3-write.js";

const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const RUN_ID = "35503717593";
const DIGEST = "sha256:" + "c".repeat(64);
const APPROVAL = `APPROVE_GACHA_PHASE_A3_WRITE:${HEAD}:${RUN_ID}:${DIGEST}`;

test("Phase A3 writer authorizes only the exact successful main audit identity", () => {
  const authorization = authorizeOfficialPhaseA3Write({
    report: auditFixture(),
    auditRunId: RUN_ID,
    planDigest: DIGEST,
    approval: APPROVAL,
    headSha: HEAD,
    originMainSha: HEAD,
  });
  assert.equal(authorization.ok, true);
  assert.equal(authorization.head_sha, HEAD);
  assert.equal(authorization.audit_run_id, RUN_ID);
  assert.equal(authorization.plan_digest, DIGEST);
  assert.equal(authorization.expectation.safe_records, 1828);
  assert.equal(authorization.expectation.safe_variants, 11350);
  assert.equal(authorization.expectation.rerelease_records, 374);
  assert.equal(authorization.expectation.unresolved_records, 815);
  assert.equal(authorization.expectation.identity_disambiguations, 25);
});

test("Phase A3 writer rejects main, run, digest, approval, event, and database drift", () => {
  const base = {
    auditRunId: RUN_ID,
    planDigest: DIGEST,
    approval: APPROVAL,
    headSha: HEAD,
    originMainSha: HEAD,
  };
  assert.throws(() => authorizeOfficialPhaseA3Write({ ...base, report: auditFixture(), originMainSha: OTHER }), /main_sha_mismatch/);
  assert.throws(() => authorizeOfficialPhaseA3Write({ ...base, report: auditFixture(), auditRunId: "1" }), /audit_run_mismatch/);
  assert.throws(() => authorizeOfficialPhaseA3Write({ ...base, report: auditFixture(), planDigest: "sha256:" + "d".repeat(64) }), /plan_digest_mismatch/);
  assert.throws(() => authorizeOfficialPhaseA3Write({ ...base, report: auditFixture(), approval: `APPROVE_GACHA_PHASE_A3_WRITE:${HEAD}:${RUN_ID}:sha256:${"d".repeat(64)}` }), /approval_mismatch/);

  const wrongEvent = auditFixture();
  wrongEvent.workflow.event_name = "workflow_dispatch";
  assert.throws(() => authorizeOfficialPhaseA3Write({ ...base, report: wrongEvent }), /audit_event_invalid/);

  const drifted = auditFixture();
  drifted.database.delta.variants = 1;
  assert.throws(() => authorizeOfficialPhaseA3Write({ ...base, report: drifted }), /audit_database_drift/);
});

test("Phase A3 expected post counts are variants-only and leave unrelated tables unchanged", () => {
  const expected = expectedOfficialPhaseA3PostCounts({
    series: 10599,
    variants: 55300,
    provisional_variants: 7555,
    restock_events: 0,
    import_issues: 1726,
    official_without_real: 3017,
  }, {
    target_series: 1828,
    target_variants: 11350,
  });
  assert.deepEqual(expected, {
    series: 10599,
    variants: 66650,
    provisional_variants: 7555,
    restock_events: 0,
    import_issues: 1726,
    official_without_real: 1189,
  });
});

test("Phase A3 post verification requires exact counts, identities, slugs, and detailed targets", () => {
  const before = {
    series: 10599,
    variants: 55300,
    provisional_variants: 7555,
    restock_events: 0,
    import_issues: 1726,
    official_without_real: 3017,
  };
  const plan = { target_series: 1828, target_variants: 11350 };
  const after = expectedOfficialPhaseA3PostCounts(before, plan);
  const verified = verifyOfficialPhaseA3PostState({
    before,
    after,
    plan,
    insertedIdCount: 11350,
    insertedSlugCount: 11350,
    targetDetailedCount: 1828,
  });
  assert.equal(verified.ok, true);

  assert.throws(() => verifyOfficialPhaseA3PostState({
    before,
    after: { ...after, variants: after.variants - 1 },
    plan,
    insertedIdCount: 11350,
    insertedSlugCount: 11350,
    targetDetailedCount: 1828,
  }), /post_verify_failed/);

  assert.throws(() => verifyOfficialPhaseA3PostState({
    before,
    after,
    plan,
    insertedIdCount: 11349,
    insertedSlugCount: 11350,
    targetDetailedCount: 1828,
  }), /post_verify_failed/);
});

test("commit-outcome-unknown can never validate as committed success", () => {
  const result = buildOfficialPhaseA3WriteResult({
    workflow: { run_id: "1", head_sha: HEAD },
    authorization: {
      head_sha: HEAD,
      audit_run_id: RUN_ID,
      plan_digest: DIGEST,
      expectation: { safe_records: 1828, safe_variants: 11350 },
    },
    plan: {
      plan_digest: DIGEST,
      target_series: 1828,
      target_variants: 11350,
      identity_disambiguations: 25,
    },
    transaction: {
      state: "commit_outcome_unknown",
      database_writes: 11350,
      rollback_attempted: false,
      rollback_verified: false,
    },
    before: {
      series: 10599, variants: 55300, provisional_variants: 7555,
      restock_events: 0, import_issues: 1726, official_without_real: 3017,
    },
    after: {
      series: 10599, variants: 66650, provisional_variants: 7555,
      restock_events: 0, import_issues: 1726, official_without_real: 1189,
    },
    postVerify: {
      ok: true,
      inserted_id_count: 11350,
      inserted_slug_count: 11350,
      target_detailed_count: 1828,
      expected: {
        series: 10599, variants: 66650, provisional_variants: 7555,
        restock_events: 0, import_issues: 1726, official_without_real: 1189,
      },
      observed: {
        series: 10599, variants: 66650, provisional_variants: 7555,
        restock_events: 0, import_issues: 1726, official_without_real: 1189,
      },
    },
    reasonCode: "phase_a3_commit_outcome_unknown",
    finalVerdict: "OFFICIAL_PHASE_A3_WRITE_COMMIT_OUTCOME_UNKNOWN",
  });
  assert.equal(result.final_verdict, "OFFICIAL_PHASE_A3_WRITE_COMMIT_OUTCOME_UNKNOWN");
  assert.equal(result.transaction.state, "commit_outcome_unknown");
  assert.equal(result.post_verify.ok, true);
});

test("Phase A3 writer workflow is manual-only, separately approved, and fail-closed", () => {
  const workflow = fs.readFileSync(".github/workflows/gacha-official-phase-a3-write.yml", "utf8");
  const script = fs.readFileSync("scripts/official-phase-a3-write.mjs", "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bschedule:|\bpush:|\bpull_request:|\bworkflow_run:|\brepository_dispatch:/);
  assert.match(workflow, /audit_run_id:/);
  assert.match(workflow, /plan_digest:/);
  assert.match(workflow, /approval:/);
  assert.match(workflow, /APPROVE_GACHA_PHASE_A3_WRITE/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /INGESTION_WRITE_DISABLED: "true"/);
  assert.match(workflow, /MARKET_BACKFILL_WRITE_DISABLED: "true"/);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /ensure-result/);
  assert.match(workflow, /gacha-official-phase-a3-main-preflight-/);
  assert.doesNotMatch(workflow, /db:upsert|ingest:official|official:bounded-write/);

  assert.match(script, /scanOfficialPhaseA3Residuals/);
  assert.match(script, /assertOfficialPhaseA3Expectation/);
  assert.ok((script.match(/exactCurrentMainSha\(\)/g) || []).length >= 2);
  assert.match(script, /executeOfficialPhaseA3VariantTransaction/);
  assert.match(script, /verifyDirectPostState/);
  assert.match(script, /commit_outcome_unknown/);
  assert.match(script, /committed_post_verify_failed/);
  assert.match(script, /findOfficialBoundedLeaks/);
  assert.doesNotMatch(script, /DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE/i);
});

test("SUPABASE_DB_URL is not job-global and execution remains variants-only", () => {
  const workflow = fs.readFileSync(".github/workflows/gacha-official-phase-a3-write.yml", "utf8");
  const jobEnv = workflow.match(/timeout-minutes: 150\r?\n    env:\r?\n([\s\S]*?)\r?\n\s*steps:/)?.[1] ?? "";
  assert.doesNotMatch(jobEnv, /SUPABASE_DB_URL/);
  assert.match(workflow, /SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);

  const postgres = fs.readFileSync("lib/server/official-phase-a3-postgres.js", "utf8");
  assert.match(postgres, /INSERT INTO public\.variants/);
  assert.doesNotMatch(postgres, /INSERT INTO public\.series|INSERT INTO public\.restock_events|UPDATE |DELETE FROM|TRUNCATE/i);
});

function auditFixture() {
  return {
    schema_version: 1,
    report_type: "official_phase_a3_preflight",
    workflow: {
      run_id: RUN_ID,
      head_sha: HEAD,
      event_name: "push",
    },
    execution: {
      mode: "read-only",
      writes_allowed: false,
      deletes_allowed: false,
      cleanup_enabled: false,
    },
    scan: {
      detail_fetch_limit: 3013,
      detail_fetched: 3013,
      known_priority_urls: 3013,
      held_shared_detailed_urls: 3,
      held_unsupported_provider_urls: 1,
      priority_scan_complete: true,
      fetch_issues: 811,
    },
    counts: {
      known_undetailed: 3017,
      safe_records: 1828,
      safe_variants: 11350,
      rerelease_records: 374,
      unresolved_records: 815,
    },
    providers: {
      safe_records: { gashapon: 680, takaratomy: 1148, other: 0 },
      rerelease_records: { gashapon: 374, takaratomy: 0, other: 0 },
      unresolved_records: { gashapon: 610, takaratomy: 204, other: 1 },
    },
    plan: {
      plan_digest: DIGEST,
      target_series: 1828,
      target_variants: 11350,
      identity_disambiguations: 25,
      writes: 11350,
      series_writes: 0,
      restock_event_writes: 0,
      import_issue_writes: 0,
      deletes: 0,
    },
    database: {
      before: {
        series: 10599,
        variants: 55300,
        provisional_variants: 7555,
        restock_events: 0,
        import_issues: 1726,
      },
      after: {
        series: 10599,
        variants: 55300,
        provisional_variants: 7555,
        restock_events: 0,
        import_issues: 1726,
      },
      delta: {
        series: 0,
        variants: 0,
        provisional_variants: 0,
        restock_events: 0,
        import_issues: 0,
      },
    },
    final_verdict: "OFFICIAL_PHASE_A3_PREFLIGHT_READY",
  };
}
