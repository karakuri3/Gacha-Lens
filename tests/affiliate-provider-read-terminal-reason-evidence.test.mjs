import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAffiliateProviderReadAuthorizationFinalization } from "../lib/domain/affiliate-provider-read-authorization-ledger.js";

const GUARD = new URL(
  "../supabase/migrations/20260907023700_affiliate_provider_read_terminal_reason_evidence_guard.sql",
  import.meta.url,
);

const AUTHORIZATION_ID = "affiliate-provider-read-auth-0123456789abcdef0123456789abcdef";

test("app finalization contract exposes retry exhaustion only as a partial-or-ambiguous reason", () => {
  assert.deepEqual(buildAffiliateProviderReadAuthorizationFinalization({
    authorizationId: AUTHORIZATION_ID,
    terminalState: "partial_or_ambiguous",
    reasonCode: "retry_exhausted",
  }), {
    p_authorization_id: AUTHORIZATION_ID,
    p_terminal_state: "partial_or_ambiguous",
    p_reason_code: "retry_exhausted",
  });

  assert.throws(() => buildAffiliateProviderReadAuthorizationFinalization({
    authorizationId: AUTHORIZATION_ID,
    terminalState: "completed",
    reasonCode: "retry_exhausted",
  }), /finalization is invalid/);
});

test("terminal reason evidence guard binds specific audit reasons and normalizes the long constraint name", async () => {
  const sql = await readFile(GUARD, "utf8");

  assert.match(sql, /'retry_exhausted'/);
  assert.match(sql, /p_reason_code = 'provider_terminal_failure'/);
  assert.match(sql, /a\.outcome = 'terminal_failure'/);
  assert.match(sql, /p_reason_code = 'ambiguous_transport'/);
  assert.match(sql, /a\.outcome in \('ambiguous', 'reserved'\)/);
  assert.match(sql, /p_reason_code = 'retry_exhausted'/);
  assert.match(sql, /a\.attempt_no = 3/);
  assert.match(sql, /a\.outcome = 'retryable_failure'/);
  assert.match(sql, /affiliate_provider_read_authorization_reason_evidence_mismatch/);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /revoke execute .* from public;/i);
  assert.match(sql, /grant execute .* to service_role;/i);
  assert.match(sql, /affiliate_provider_read_authorization_approval_fingerprint_chec/);
  assert.match(sql, /affiliate_provider_read_auth_approval_fp_check/);
  assert.doesNotMatch(sql, /security definer/i);
});
