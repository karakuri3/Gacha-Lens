import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const DB_AVAILABLE = Boolean(process.env.PGHOST && process.env.PGPORT && process.env.PGDATABASE && process.env.PGUSER);
const HEAD = "83b0b36e5d0172f3ea6964206edad6480a13b4bb";
const PLAN_KIND = "affiliate_demand_provider_read_plan_v1";

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function approvalFingerprint(digest) {
  return sha256(`APPROVE_AFFILIATE_DEMAND_PROVIDER_READ_V1:${HEAD}:${digest}`);
}

async function claim(client, digest, requestKey) {
  const result = await client.query(
    `select public.claim_affiliate_provider_read_authorization_v1(
      $1::text, $2::text, $3::text, $4::text,
      1, 2, 6, $5::text[]
    ) as result`,
    [PLAN_KIND, HEAD, digest, approvalFingerprint(digest), [requestKey]],
  );
  return result.rows[0].result;
}

async function expectDbError(client, query, params, pattern) {
  await client.query("savepoint expected_failure");
  try {
    await client.query(query, params);
    assert.fail(`Expected database error matching ${pattern}.`);
  } catch (error) {
    assert.match(String(error?.message ?? error), pattern);
  } finally {
    await client.query("rollback to savepoint expected_failure");
    await client.query("release savepoint expected_failure");
  }
}

test("disposable Supabase binds terminal reason codes to durable attempt evidence", { skip: !DB_AVAILABLE }, async () => {
  const client = new Client();
  await client.connect();
  await client.query("begin");

  try {
    await client.query("set local role service_role");

    const terminalRequest = "affiliate-read-a1111111111111111111";
    const terminal = await claim(client, "6".repeat(64), terminalRequest);
    await client.query(
      "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 1)",
      [terminal.authorization_id, terminalRequest],
    );
    await client.query(
      "select public.finish_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 1, 'terminal_failure', null)",
      [terminal.authorization_id, terminalRequest],
    );

    await expectDbError(
      client,
      "select public.finalize_affiliate_provider_read_authorization_v1($1, 'partial_or_ambiguous', 'ambiguous_transport')",
      [terminal.authorization_id],
      /reason_evidence_mismatch/,
    );

    const terminalFinal = await client.query(
      "select public.finalize_affiliate_provider_read_authorization_v1($1, 'partial_or_ambiguous', 'provider_terminal_failure') as result",
      [terminal.authorization_id],
    );
    assert.equal(terminalFinal.rows[0].result.reason_code, "provider_terminal_failure");

    const exhaustedRequest = "affiliate-read-b2222222222222222222";
    const exhausted = await claim(client, "7".repeat(64), exhaustedRequest);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await client.query(
        "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'discovery', $3)",
        [exhausted.authorization_id, exhaustedRequest, attempt],
      );
      await client.query(
        "select public.finish_affiliate_provider_read_attempt_v1($1, $2, 'discovery', $3, 'retryable_failure', null)",
        [exhausted.authorization_id, exhaustedRequest, attempt],
      );
    }

    await expectDbError(
      client,
      "select public.finalize_affiliate_provider_read_authorization_v1($1, 'partial_or_ambiguous', 'provider_terminal_failure')",
      [exhausted.authorization_id],
      /reason_evidence_mismatch/,
    );

    const exhaustedFinal = await client.query(
      "select public.finalize_affiliate_provider_read_authorization_v1($1, 'partial_or_ambiguous', 'retry_exhausted') as result",
      [exhausted.authorization_id],
    );
    assert.equal(exhaustedFinal.rows[0].result.reason_code, "retry_exhausted");

    const ambiguousRequest = "affiliate-read-c3333333333333333333";
    const ambiguous = await claim(client, "8".repeat(64), ambiguousRequest);
    await client.query(
      "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 1)",
      [ambiguous.authorization_id, ambiguousRequest],
    );

    const ambiguousFinal = await client.query(
      "select public.finalize_affiliate_provider_read_authorization_v1($1, 'partial_or_ambiguous', 'ambiguous_transport') as result",
      [ambiguous.authorization_id],
    );
    assert.equal(ambiguousFinal.rows[0].result.reason_code, "ambiguous_transport");

    const constraintNames = await client.query(`
      select c.conname
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'private'
        and r.relname = 'affiliate_provider_read_authorizations'
        and c.conname in (
          'affiliate_provider_read_authorization_approval_fingerprint_chec',
          'affiliate_provider_read_auth_approval_fp_check'
        )
      order by c.conname
    `);
    assert.deepEqual(constraintNames.rows, [{ conname: "affiliate_provider_read_auth_approval_fp_check" }]);
  } finally {
    await client.query("rollback");
    await client.end();
  }
});
