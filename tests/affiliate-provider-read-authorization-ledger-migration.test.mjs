import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260907023500_affiliate_provider_read_authorization_ledger.sql", import.meta.url);

async function migration() {
  return readFile(migrationUrl, "utf8");
}

test("authorization ledger stays private, RLS-enabled and service-role-only", async () => {
  const sql = await migration();

  assert.match(sql, /create schema if not exists private;/i);
  assert.match(sql, /create table if not exists private\.affiliate_provider_read_authorizations/i);
  assert.match(sql, /create table if not exists private\.affiliate_provider_read_attempts/i);
  assert.match(sql, /alter table private\.affiliate_provider_read_authorizations enable row level security;/i);
  assert.match(sql, /alter table private\.affiliate_provider_read_attempts enable row level security;/i);
  assert.match(sql, /revoke all on table private\.affiliate_provider_read_authorizations from anon;/i);
  assert.match(sql, /revoke all on table private\.affiliate_provider_read_authorizations from authenticated;/i);
  assert.match(sql, /revoke all on table private\.affiliate_provider_read_attempts from anon;/i);
  assert.match(sql, /revoke all on table private\.affiliate_provider_read_attempts from authenticated;/i);
  assert.match(sql, /grant select, insert, update on table private\.affiliate_provider_read_authorizations to service_role;/i);
  assert.match(sql, /grant select, insert, update on table private\.affiliate_provider_read_attempts to service_role;/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /security invoker/gi);
  assert.match(sql, /set search_path = ''/gi);
});

test("claim is exact-digest-bound and permanently rejects replay", async () => {
  const sql = await migration();

  assert.match(sql, /APPROVE_AFFILIATE_DEMAND_PROVIDER_READ_V1:/);
  assert.match(sql, /affiliate_provider_read_authorization_approval_mismatch/);
  assert.match(sql, /affiliate_provider_read_authorization_replay/);
  assert.match(sql, /batch_digest text not null unique/i);
  assert.match(sql, /logical_provider_http_requests = target_count \* 2/);
  assert.match(sql, /max_http_attempts = logical_provider_http_requests \* 3/);
  assert.match(sql, /approval_reusable', false/);
  assert.doesNotMatch(sql, /function\s+(?:public|private)\.(?:reclaim|reopen|reset)_affiliate_provider_read/i);
});

test("attempt reservations enforce exact phases, three-attempt ceiling and serial recovery", async () => {
  const sql = await migration();

  assert.match(sql, /phase in \('discovery', 'affiliate_enrichment'\)/);
  assert.match(sql, /attempt_no between 1 and 3/);
  assert.match(sql, /affiliate_provider_read_attempt_outstanding_reservation/);
  assert.match(sql, /affiliate_provider_read_attempt_batch_requires_terminalization/);
  assert.match(sql, /affiliate_provider_read_attempt_discovery_not_complete/);
  assert.match(sql, /affiliate_provider_read_attempt_phase_already_succeeded/);
  assert.match(sql, /affiliate_provider_read_attempt_previous_not_retryable/);
  assert.match(sql, /affiliate_provider_read_attempt_replay/);
});

test("terminalization is monotonic and distinguishes no-call from partial or ambiguous execution", async () => {
  const sql = await migration();

  assert.match(sql, /'completed', 'failed_before_request', 'partial_or_ambiguous'/);
  assert.match(sql, /affiliate_provider_read_authorization_already_finalized/);
  assert.match(sql, /affiliate_provider_read_authorization_has_provider_attempts/);
  assert.match(sql, /affiliate_provider_read_authorization_missing_success_phase/);
  assert.match(sql, /affiliate_provider_read_authorization_no_partial_attempt/);
  assert.match(sql, /ambiguous_transport/);
  assert.match(sql, /provider_terminal_failure/);
});
