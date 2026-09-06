import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAffiliateDemandProviderReadPlan,
  expectedAffiliateDemandProviderReadApproval,
} from "../lib/domain/affiliate-demand-provider-read.js";
import {
  buildAffiliateProviderReadAttemptCompletion,
  buildAffiliateProviderReadAttemptReservation,
  buildAffiliateProviderReadAuthorizationClaim,
  buildAffiliateProviderReadAuthorizationFinalization,
  expectedAffiliateProviderReadAuthorizationId,
  fingerprintAffiliateProviderReadResponse,
} from "../lib/domain/affiliate-provider-read-authorization-ledger.js";

const HEAD = "83b0b36e5d0172f3ea6964206edad6480a13b4bb";

function fixture() {
  const cohortPlan = {
    schema_version: 1,
    generated_at: "2026-09-06T12:00:00.000Z",
    mode: "planning_only",
    requested_cohort_size: 2,
    selected_count: 2,
    historical_clicks_represented: 3,
    targets: [
      {
        variant_id: "v-r",
        series_id: "s-r",
        provider: "rakuten",
        clicks_in_window: 2,
        latest_click_at: "2026-09-06T11:00:00.000Z",
        active_safe_listing_count: 1,
        listing_ids: ["r-1"],
        affiliate_provenance_present: false,
      },
      {
        variant_id: "v-y",
        series_id: "s-y",
        provider: "yahoo",
        clicks_in_window: 1,
        latest_click_at: "2026-09-06T10:00:00.000Z",
        active_safe_listing_count: 1,
        listing_ids: ["y-1"],
        affiliate_provenance_present: false,
      },
    ],
    execution: {
      provider_requests: 0,
      production_writes: 0,
      rpc_calls: 0,
      workflow_dispatches: 0,
      secrets_or_variables_changes: 0,
      approval_reusable: false,
    },
  };

  const variants = [
    { id: "v-r", series_id: "s-r", name: "おやすみ" },
    { id: "v-y", series_id: "s-y", name: "タイムふろしき" },
  ];
  const series = [
    { id: "s-r", name: "おさるのジョージ ジョージの一日フィギュア" },
    { id: "s-y", name: "ドラえもん ぬいぐるみマスコット" },
  ];
  const marketListings = [
    {
      id: "r-1",
      variant_id: "v-r",
      matched_variant_id: null,
      listing_type: "single",
      status: "active",
      review_required: false,
      source: "rakuten",
      source_url: "https://item.rakuten.co.jp/shop/item-1/",
      raw: { provider: "rakuten_ichiba", itemCode: "shop:1" },
    },
    {
      id: "y-1",
      variant_id: "v-y",
      matched_variant_id: null,
      listing_type: "single",
      status: "active",
      review_required: false,
      source: "yahoo_shopping",
      source_url: "https://store.shopping.yahoo.co.jp/shop/item-2.html",
      raw: { provider: "yahoo_shopping", code: "shop_item-2" },
    },
  ];

  const readPlan = buildAffiliateDemandProviderReadPlan({ headSha: HEAD, cohortPlan, variants, series, marketListings });
  const approval = expectedAffiliateDemandProviderReadApproval({ headSha: HEAD, readPlan });
  return { readPlan, approval };
}

function liveInvocation() {
  const { readPlan, approval } = fixture();
  return {
    mode: "provider-read",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    read_plan: readPlan,
    approval,
  };
}

test("claim payload consumes exact provider-read approval without carrying plaintext token", () => {
  const input = liveInvocation();
  const claim = buildAffiliateProviderReadAuthorizationClaim(input);

  assert.equal(claim.p_plan_kind, "affiliate_demand_provider_read_plan_v1");
  assert.equal(claim.p_head_sha, HEAD);
  assert.match(claim.p_batch_digest, /^[0-9a-f]{64}$/);
  assert.match(claim.p_approval_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(claim.p_target_count, 2);
  assert.equal(claim.p_logical_provider_http_requests, 4);
  assert.equal(claim.p_max_http_attempts, 12);
  assert.equal(claim.p_request_keys.length, 2);
  assert.equal(JSON.stringify(claim).includes(input.approval), false);

  const authorizationId = expectedAffiliateProviderReadAuthorizationId({
    headSha: claim.p_head_sha,
    batchDigest: claim.p_batch_digest,
  });
  assert.match(authorizationId, /^affiliate-provider-read-auth-[0-9a-f]{32}$/);
});

test("dry-run cannot be converted into a durable claim", () => {
  const { readPlan } = fixture();
  assert.throws(() => buildAffiliateProviderReadAuthorizationClaim({
    mode: "dry-run",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    read_plan: readPlan,
    approval: "",
  }), /requires provider-read mode/);
});

test("attempt reservation and completion stay strictly bounded", () => {
  const auth = "affiliate-provider-read-auth-0123456789abcdef0123456789abcdef";
  const request = "affiliate-read-0123456789abcdef0123";

  assert.deepEqual(buildAffiliateProviderReadAttemptReservation({
    authorizationId: auth,
    requestKey: request,
    phase: "discovery",
    attemptNo: 1,
  }), {
    p_authorization_id: auth,
    p_request_key: request,
    p_phase: "discovery",
    p_attempt_no: 1,
  });

  const fingerprint = fingerprintAffiliateProviderReadResponse({ status: 200, provider: "rakuten" });
  const completed = buildAffiliateProviderReadAttemptCompletion({
    authorizationId: auth,
    requestKey: request,
    phase: "affiliate_enrichment",
    attemptNo: 3,
    outcome: "success",
    responseFingerprint: fingerprint,
  });
  assert.equal(completed.p_attempt_no, 3);
  assert.equal(completed.p_outcome, "success");
  assert.equal(completed.p_response_fingerprint, fingerprint);

  assert.throws(() => buildAffiliateProviderReadAttemptReservation({
    authorizationId: auth,
    requestKey: request,
    phase: "discovery",
    attemptNo: 4,
  }), /invalid/);
  assert.throws(() => buildAffiliateProviderReadAttemptReservation({
    authorizationId: auth,
    requestKey: request,
    phase: "fallback",
    attemptNo: 1,
  }), /invalid/);
  assert.throws(() => buildAffiliateProviderReadAttemptCompletion({
    authorizationId: auth,
    requestKey: request,
    phase: "discovery",
    attemptNo: 1,
    outcome: "retry_everything",
  }), /outcome is invalid/);
});

test("terminalization uses fixed state/reason combinations and never exposes a reopen state", () => {
  const auth = "affiliate-provider-read-auth-abcdef0123456789abcdef0123456789";

  assert.deepEqual(buildAffiliateProviderReadAuthorizationFinalization({
    authorizationId: auth,
    terminalState: "completed",
    reasonCode: "completed",
  }), {
    p_authorization_id: auth,
    p_terminal_state: "completed",
    p_reason_code: "completed",
  });

  assert.deepEqual(buildAffiliateProviderReadAuthorizationFinalization({
    authorizationId: auth,
    terminalState: "failed_before_request",
    reasonCode: "configuration_preflight_failed",
  }).p_terminal_state, "failed_before_request");

  assert.throws(() => buildAffiliateProviderReadAuthorizationFinalization({
    authorizationId: auth,
    terminalState: "completed",
    reasonCode: "partial_batch",
  }), /finalization is invalid/);
  assert.throws(() => buildAffiliateProviderReadAuthorizationFinalization({
    authorizationId: auth,
    terminalState: "reopened",
    reasonCode: "completed",
  }), /finalization is invalid/);
});

test("response fingerprint is canonical and stable across object key order", () => {
  const a = fingerprintAffiliateProviderReadResponse({ provider: "yahoo", result: { code: "x", ok: true } });
  const b = fingerprintAffiliateProviderReadResponse({ result: { ok: true, code: "x" }, provider: "yahoo" });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});
