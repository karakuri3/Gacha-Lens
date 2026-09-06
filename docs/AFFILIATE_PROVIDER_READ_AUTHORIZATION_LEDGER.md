# Affiliate Provider-Read Authorization Ledger

Issue: #268

Stacked after: Draft PR #267 / Issue #266

Status: repository-only, non-Production prerequisite

## Purpose

Draft #267 already binds a future affiliate-demand provider read to an exact current-main SHA, canonical plan digest, exact request keys, exact provider/search/listing identities, bounded request budgets, and a human approval token.

That pure binding is not durable one-time consumption. This layer closes that specific gap before any provider executor is allowed to exist.

## Core rule

The first durable write in any future provider-read execution must be an atomic authorization claim. After that claim succeeds, the authorization is permanently consumed.

There is intentionally no automatic reclaim, reopen, reset, whole-batch retry, or approval-reuse path.

A crash after claim but before the first HTTP request can therefore waste an approval. That is acceptable. Reusing an authorization after an ambiguous crash is not acceptable.

## Storage boundary

The migration creates:

- `private.affiliate_provider_read_authorizations`
- `private.affiliate_provider_read_attempts`

The `private` schema is not intended to be a public Data API surface. Both tables:

- have RLS enabled;
- revoke access from `public`, `anon`, and `authenticated`;
- grant only the minimum `select/insert/update` privileges needed by `service_role` for `SECURITY INVOKER` RPCs;
- intentionally grant no delete/truncate path for normal execution.

The RPCs remain `SECURITY INVOKER` with an empty `search_path`. No `SECURITY DEFINER` shortcut is used.

## Claim contract

`claim_affiliate_provider_read_authorization_v1(...)` accepts only:

- plan kind `affiliate_demand_provider_read_plan_v1`;
- exact 40-character head SHA;
- exact 64-character #267 batch digest;
- SHA-256 fingerprint of the already validated human approval token;
- 1..10 bound request keys;
- target count equal to request-key count;
- exactly 2 logical provider phases per target;
- exactly 3 maximum attempts per logical phase.

The plaintext approval token is never sent to or stored in the ledger.

The database recomputes the expected fingerprint of:

`APPROVE_AFFILIATE_DEMAND_PROVIDER_READ_V1:<head>:<batch_digest>`

and fails closed on mismatch.

The fingerprint is audit/binding evidence, not cryptographic proof that a human typed the token. Human approval provenance remains an orchestration boundary outside the database.

Authorization identity is deterministic from:

- `gacha-lens`
- authorization contract kind
- exact head SHA
- exact batch digest

Both authorization ID and batch digest are unique. Any concurrent or later duplicate claim fails as replay.

## Attempt reservation contract

Before each future provider HTTP attempt, the executor must call:

`reserve_affiliate_provider_read_attempt_v1(...)`

The ledger enforces:

- authorization is still in `claimed` state;
- request key belongs to the claimed #267 plan;
- phase is exactly `discovery` or `affiliate_enrichment`;
- attempt number is 1..3;
- only one outstanding reserved attempt exists for the entire tiny cohort;
- `affiliate_enrichment` cannot start until the same request's `discovery` phase has succeeded;
- a successful phase cannot be retried;
- attempt N>1 requires attempt N-1 to have finished specifically as `retryable_failure`;
- any `terminal_failure` or `ambiguous` result stops further reservations for the batch.

This deliberately serializes the first experiment. The cohort is tiny and safety/replay clarity is more important than parallel throughput.

## Attempt completion contract

`finish_affiliate_provider_read_attempt_v1(...)` can finish only an existing `reserved` row exactly once.

Allowed outcomes:

- `success`
- `retryable_failure`
- `terminal_failure`
- `ambiguous`

Successful responses require a SHA-256 response fingerprint. Raw provider payloads, credentials, tokens, cookies, authorization headers, or secret values do not belong in this ledger.

If a process dies after network I/O but before completion is durably recorded, the attempt remains `reserved`. That is intentionally ambiguous and blocks every subsequent reservation under the same approval.

## Terminalization contract

A consumed authorization can move only once from `claimed` to one of:

- `completed`
- `failed_before_request`
- `partial_or_ambiguous`

There is no transition back to `claimed` and no fresh/reusable state.

### `completed`

Allowed only when every bound request key has exactly one successful `discovery` and one successful `affiliate_enrichment` phase, with no outstanding/terminal/ambiguous attempt.

Prior `retryable_failure` attempts are permitted as long as the phase later succeeds within the 3-attempt ceiling.

### `failed_before_request`

Allowed only when zero provider-attempt rows exist. Intended for configuration or executor preflight failures after authorization claim but before any network attempt.

### `partial_or_ambiguous`

Requires at least one reserved/finished attempt and permanently closes the approval after partial, terminal, ambiguous, or operator-stopped execution.

Recovery requires a completely fresh data/head rebind and a new human approval. The old authorization is evidence only.

## App-side pure contract

`lib/domain/affiliate-provider-read-authorization-ledger.js` builds sanitized RPC payloads from the already validated #267 invocation.

It:

- refuses dry-run claims;
- verifies #267 counters remain zero for Production writes/RPC/workflow/Secrets changes;
- returns only approval fingerprint, never plaintext approval;
- validates authorization/request IDs, phases, attempt ceilings, outcomes, and terminal state/reason combinations;
- provides deterministic response fingerprinting for bounded evidence.

It performs no I/O.

## Production and provider boundaries

This implementation authorizes none of the following:

- applying the migration to Production;
- calling Rakuten or Yahoo;
- reading or changing Secrets/Variables;
- activating Yahoo ValueCommerce or any affiliate account/configuration;
- persisting provider-issued affiliate provenance;
- modifying public CTA/ranking/trend/forecast behavior;
- dispatching or changing workflows;
- merging to `main` while #219/#238 remain active.

The ledger migration itself is a future Production schema change and therefore requires its own explicit approval and exact isolated validation before application.

## Isolated verification limitation

At implementation time, the connected Supabase project reports no existing development branches. Creating a new Supabase branch requires a cost confirmation flow, so no branch is created by implication.

Until an approved non-Production Supabase branch exists, validation is limited to repository tests/static migration hardening review plus exact-head CI. This must not be represented as successful migration/RPC execution proof.

## Future executor gate

A live executor may be built only after this ledger contract is independently reviewed and migration/RPC behavior is proven in an approved isolated Supabase environment.

The required order remains:

1. fresh #264 cohort recompute;
2. fresh #267 provider-read plan bound to then-current main;
3. configuration preflight without exposing secret values;
4. exact human provider-read approval;
5. durable ledger claim;
6. reserve one attempt immediately before each provider HTTP attempt;
7. finish each attempt with outcome/fingerprint;
8. terminalize the authorization;
9. separately review provider evidence;
10. request a separate Production-write approval before any affiliate-provenance persistence.
