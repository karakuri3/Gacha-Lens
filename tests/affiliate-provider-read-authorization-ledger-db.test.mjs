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

function approvalFingerprint(head, digest) {
  return sha256(`APPROVE_AFFILIATE_DEMAND_PROVIDER_READ_V1:${head}:${digest}`);
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

async function claim(client, { digest, requestKeys }) {
  const result = await client.query(
    `select public.claim_affiliate_provider_read_authorization_v1(
      $1::text, $2::text, $3::text, $4::text,
      $5::integer, $6::integer, $7::integer, $8::text[]
    ) as result`,
    [
      PLAN_KIND,
      HEAD,
      digest,
      approvalFingerprint(HEAD, digest),
      requestKeys.length,
      requestKeys.length * 2,
      requestKeys.length * 6,
      requestKeys,
    ],
  );
  return result.rows[0].result;
}

test("disposable Supabase enforces one-time claim, bounded retry, completion and replay rejection", { skip: !DB_AVAILABLE }, async () => {
  const client = new Client();
  await client.connect();
  await client.query("begin");

  try {
    await client.query("set local role service_role");

    const digest = "1".repeat(64);
    const requestKey = "affiliate-read-0123456789abcdef0123";
    const claimed = await claim(client, { digest, requestKeys: [requestKey] });

    assert.equal(claimed.state, "claimed");
    assert.equal(claimed.target_count, 1);
    assert.equal(claimed.logical_provider_http_requests, 2);
    assert.equal(claimed.max_http_attempts, 6);
    assert.equal(claimed.approval_reusable, false);
    assert.match(claimed.authorization_id, /^affiliate-provider-read-auth-[0-9a-f]{32}$/);

    await expectDbError(
      client,
      `select public.claim_affiliate_provider_read_authorization_v1(
        $1::text, $2::text, $3::text, $4::text,
        1, 2, 6, $5::text[]
      )`,
      [PLAN_KIND, HEAD, digest, approvalFingerprint(HEAD, digest), [requestKey]],
      /affiliate_provider_read_authorization_replay/,
    );

    const reserved1 = await client.query(
      "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 1) as result",
      [claimed.authorization_id, requestKey],
    );
    assert.equal(reserved1.rows[0].result.state, "reserved");

    await expectDbError(
      client,
      "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'affiliate_enrichment', 1)",
      [claimed.authorization_id, requestKey],
      /outstanding_reservation|discovery_not_complete/,
    );

    await client.query(
      "select public.finish_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 1, 'retryable_failure', null)",
      [claimed.authorization_id, requestKey],
    );

    const reserved2 = await client.query(
      "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 2) as result",
      [claimed.authorization_id, requestKey],
    );
    assert.equal(reserved2.rows[0].result.attempt_no, 2);

    const discoveryFingerprint = sha256("discovery-success");
    await client.query(
      "select public.finish_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 2, 'success', $3)",
      [claimed.authorization_id, requestKey, discoveryFingerprint],
    );

    await client.query(
      "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'affiliate_enrichment', 1)",
      [claimed.authorization_id, requestKey],
    );
    const affiliateFingerprint = sha256("affiliate-success");
    await client.query(
      "select public.finish_affiliate_provider_read_attempt_v1($1, $2, 'affiliate_enrichment', 1, 'success', $3)",
      [claimed.authorization_id, requestKey, affiliateFingerprint],
    );

    const finalized = await client.query(
      "select public.finalize_affiliate_provider_read_authorization_v1($1, 'completed', 'completed') as result",
      [claimed.authorization_id],
    );
    assert.equal(finalized.rows[0].result.state, "completed");
    assert.equal(finalized.rows[0].result.approval_reusable, false);

    await expectDbError(
      client,
      "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 3)",
      [claimed.authorization_id, requestKey],
      /authorization_terminal/,
    );

    const persisted = await client.query(
      "select state, terminal_reason from private.affiliate_provider_read_authorizations where authorization_id = $1",
      [claimed.authorization_id],
    );
    assert.deepEqual(persisted.rows[0], { state: "completed", terminal_reason: "completed" });
  } finally {
    await client.query("rollback");
    await client.end();
  }
});

test("disposable Supabase fails closed after ambiguous transport and supports consumed no-call terminalization", { skip: !DB_AVAILABLE }, async () => {
  const client = new Client();
  await client.connect();
  await client.query("begin");

  try {
    await client.query("set local role service_role");

    const ambiguousRequest = "affiliate-read-abcdef0123456789abcd";
    const ambiguous = await claim(client, { digest: "2".repeat(64), requestKeys: [ambiguousRequest] });
    await client.query(
      "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 1)",
      [ambiguous.authorization_id, ambiguousRequest],
    );
    await client.query(
      "select public.finish_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 1, 'ambiguous', null)",
      [ambiguous.authorization_id, ambiguousRequest],
    );

    await expectDbError(
      client,
      "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 2)",
      [ambiguous.authorization_id, ambiguousRequest],
      /batch_requires_terminalization/,
    );

    const ambiguousFinal = await client.query(
      "select public.finalize_affiliate_provider_read_authorization_v1($1, 'partial_or_ambiguous', 'ambiguous_transport') as result",
      [ambiguous.authorization_id],
    );
    assert.equal(ambiguousFinal.rows[0].result.state, "partial_or_ambiguous");

    const noCallRequest = "affiliate-read-fedcba9876543210fedc";
    const noCall = await claim(client, { digest: "3".repeat(64), requestKeys: [noCallRequest] });
    const noCallFinal = await client.query(
      "select public.finalize_affiliate_provider_read_authorization_v1($1, 'failed_before_request', 'configuration_preflight_failed') as result",
      [noCall.authorization_id],
    );
    assert.equal(noCallFinal.rows[0].result.state, "failed_before_request");

    await expectDbError(
      client,
      "select public.finalize_affiliate_provider_read_authorization_v1($1, 'completed', 'completed')",
      [noCall.authorization_id],
      /already_finalized/,
    );
  } finally {
    await client.query("rollback");
    await client.end();
  }
});

test("disposable Supabase stops the whole batch after a phase exhausts all three retryable attempts", { skip: !DB_AVAILABLE }, async () => {
  const client = new Client();
  await client.connect();
  await client.query("begin");

  try {
    await client.query("set local role service_role");

    const firstRequest = "affiliate-read-11112222333344445555";
    const secondRequest = "affiliate-read-66667777888899990000";
    const exhausted = await claim(client, {
      digest: "5".repeat(64),
      requestKeys: [firstRequest, secondRequest],
    });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await client.query(
        "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'discovery', $3)",
        [exhausted.authorization_id, firstRequest, attempt],
      );
      await client.query(
        "select public.finish_affiliate_provider_read_attempt_v1($1, $2, 'discovery', $3, 'retryable_failure', null)",
        [exhausted.authorization_id, firstRequest, attempt],
      );
    }

    await expectDbError(
      client,
      "select public.reserve_affiliate_provider_read_attempt_v1($1, $2, 'discovery', 1)",
      [exhausted.authorization_id, secondRequest],
      /batch_requires_terminalization/,
    );

    const terminal = await client.query(
      "select public.finalize_affiliate_provider_read_authorization_v1($1, 'partial_or_ambiguous', 'retry_exhausted') as result",
      [exhausted.authorization_id],
    );
    assert.equal(terminal.rows[0].result.state, "partial_or_ambiguous");
    assert.equal(terminal.rows[0].result.reason_code, "retry_exhausted");
  } finally {
    await client.query("rollback");
    await client.end();
  }
});

test("anon cannot access private ledger or execute authorization RPC", { skip: !DB_AVAILABLE }, async () => {
  const client = new Client();
  await client.connect();
  await client.query("begin");

  try {
    await client.query("set local role anon");
    await expectDbError(
      client,
      "select count(*) from private.affiliate_provider_read_authorizations",
      [],
      /permission denied|does not exist/,
    );
    await expectDbError(
      client,
      `select public.claim_affiliate_provider_read_authorization_v1(
        $1::text, $2::text, $3::text, $4::text,
        1, 2, 6, $5::text[]
      )`,
      [PLAN_KIND, HEAD, "4".repeat(64), approvalFingerprint(HEAD, "4".repeat(64)), ["affiliate-read-00112233445566778899"]],
      /permission denied/,
    );
  } finally {
    await client.query("rollback");
    await client.end();
  }
});
