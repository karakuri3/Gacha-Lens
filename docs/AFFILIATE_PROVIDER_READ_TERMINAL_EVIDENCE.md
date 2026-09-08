# Affiliate Provider-Read Terminal Evidence Contract

Issue: #268

Parent design: `docs/AFFILIATE_PROVIDER_READ_AUTHORIZATION_LEDGER.md`

Status: repository-only hardening; no Production/provider authorization

## Why this guard exists

The authorization ledger already stops new reservations after a terminal/ambiguous attempt or after a phase exhausts its third retryable attempt. Strengthened self-review found that the final audit reason was less strict than the execution state: a retry-exhausted batch could be terminalized with `provider_terminal_failure` even though no attempt had outcome `terminal_failure`.

That did not allow more provider requests or make an approval reusable, but it weakened forensic accuracy. A durable audit ledger should not permit a specific failure reason that contradicts its own attempt rows.

## Final evidence binding

Migration `20260907023700_affiliate_provider_read_terminal_reason_evidence_guard.sql` keeps the existing terminal states and budgets, and adds one explicit reason:

- `retry_exhausted`

For `partial_or_ambiguous`, the database now binds specific reasons to durable attempt evidence:

- `provider_terminal_failure` requires at least one `terminal_failure` attempt;
- `ambiguous_transport` requires at least one `ambiguous` or still-`reserved` attempt. A reserved attempt is intentionally accepted because a process may crash after network I/O but before it can durably record the outcome;
- `retry_exhausted` requires an attempt with `attempt_no = 3` and outcome `retryable_failure`.

`partial_batch` and `operator_stopped_after_attempt` remain intentionally generic operator/orchestration classifications after at least one attempt. They do not override the one-time-consumption or request-budget guards.

Reason/evidence mismatch fails closed with `affiliate_provider_read_authorization_reason_evidence_mismatch`.

## Identifier normalization

The original approval-fingerprint constraint name exceeds PostgreSQL's 63-byte identifier limit and is implicitly truncated on creation. The hardening migration renames the generated truncated identifier to the stable explicit name:

`affiliate_provider_read_auth_approval_fp_check`

This is catalog hygiene only; the constraint expression is unchanged.

## Threat-model boundary

This ledger is designed to prevent replay, accidental over-budget execution, sequencing errors, and ambiguous reuse through the reviewed service-role RPC path. It is not intended to defend against an actor who already has arbitrary trusted `service_role` SQL capability and deliberately bypasses the RPC contract.

The tables therefore remain in non-public `private`, with RLS enabled and no client grants, while the RPCs remain `SECURITY INVOKER` with empty `search_path`. The service role necessarily retains the table privileges needed by those invoker RPCs.

Likewise, the database verifies the approval fingerprint against exact `(head_sha, batch_digest)` but does not recompute the full #267 canonical plan digest from every plan field. Full plan/request binding is validated in the app-side #267/#269 adapter before the RPC payload is built. A future executor must use that reviewed path rather than arbitrary direct service-role SQL.

## Production preflight

A 2026-09-08 SELECT-only Production check found no existing schema named `private`. Therefore the current draft's `create schema if not exists private` / schema privilege lock-down has no present collision with unrelated Production objects.

This observation is not reusable indefinitely. Immediately before any future Production migration, recheck schema existence/ownership/contents and abort on unexpected drift.

## Required isolated proof

Before independent review is considered complete, disposable Supabase must prove from an empty database that:

1. all migrations apply, including the terminal-evidence guard;
2. mismatched specific reason/evidence pairs fail;
3. terminal failure can finalize only as its matching specific reason (or an intentionally generic allowed operator classification);
4. three retryable failures can finalize as `retry_exhausted`;
5. a still-reserved uncertain attempt can finalize as `ambiguous_transport`;
6. the stable constraint name exists and the implicitly truncated name does not;
7. existing one-time claim, replay denial, attempt ceilings, anon denial, lint and build remain green.

No Production DB change, provider request, hosted paid branch, Secret/Variable change, workflow mutation/dispatch, or main merge is authorized by this document.
