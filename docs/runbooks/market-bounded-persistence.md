# Market bounded persistence

Phase 6-D adds a fail-closed persistence path for at most two reviewed-safe market candidates. The path exists in code but is disabled by default. It is not a replacement for manual canary writes or normal ingestion.

## Final arming gate

All of the following must match in the same scheduled `market` run:

- event: `schedule`
- ref: `refs/heads/main`
- schedule: `17,47 * * * *`
- stage: `market-bounded`
- `AUTOMATIC_INGESTION_WRITE_ENABLED=true`
- `AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED=true`
- configured policy digest equals the SHA-256 of the policy file on main
- `AUTOMATIC_INGESTION_BOUNDED_APPROVAL=APPROVE_MARKET_BOUNDED:<policy_digest>:<head_sha>`
- concurrency clear, circuit closed, throttle clear, durable run store available, and Production snapshot available

The approval comparison trims only leading and trailing whitespace and otherwise requires an exact, case-sensitive match. The approval value is never written to logs, database rows, or artifacts. A main SHA or policy change invalidates it.

## Bound evidence

The candidate audit is hashed from its saved bytes. The plan stores that `audit_digest`, a canonical `plan_digest`, and a 15-minute expiry. Persistence recomputes both digests and requires the audit Run ID, attempt, head SHA, event, plan stage, and policy digest to match the current workflow.

The plan's selected candidate keys must exactly equal the recomputed safe set. Candidates are re-evaluated immediately before row construction. Zero eligible candidates is a successful no-op; silent truncation or replacement is prohibited.

## Rows and idempotency

The bounded path uses the existing marketplace provider normalization, listing ID, public URL sanitizer, status normalization, and a bounded-only URL identity comparison. It creates at most two listing rows and two observation rows, with schema fallback disabled.

For identity comparison only, Phase 6-D.1 removes query strings, fragments, and non-root trailing slashes after the public URL sanitizer has accepted the URL. This permits a stored Rakuten or Yahoo URL with harmless tracking parameters to match the fresh canonical product URL. Scheme, host, path case, internal duplicate slashes, and percent encoding remain significant. Credential-bearing URLs, provider or external-ID drift, different product paths, malformed raw chains, cycles, and chains reaching depth 128 fail closed. Candidate-key generation, canary identity matching, and stored public URL behavior are unchanged.

Observation IDs bind workflow Run ID, attempt, policy digest, candidate key, and listing ID. Re-running the same Run/attempt with identical content is unchanged. Conflicting content, provider identity, external ID, URL, variant, or series fails before persistence.

Bounded rows use `raw.automatic_rollout`. They do not use or imply human-reviewed canary markers.

## Verification and rollback

The fixed order is listing upsert, listing verification, observation upsert, durable run finalization, full row verification, and nine-count delta verification. Import issues and review-required counts must remain unchanged.

After the first write attempt, any failure triggers compensating rollback. Newly inserted bounded observations are removed first, existing rows are restored, and newly inserted listings are removed only after checking that no unrelated observation references them. Restored rows and all counts are verified. Rollback is not retried automatically.

## Artifacts

`market-bounded-result.json` and `.md` contain only allowlisted identity, operation, verification, rollback, delta, and reason-code fields. Approval text, credentials, seller data, raw API responses, HTTP bodies, stacks, and environment inventories are excluded.

The preview command writes both preview files and both result files on success and on a guarded failure. A failed preview reports `preview_report_generated=true`, `preview_generated=false`, the allowlisted reason/category, zero database writes, and at most a sanitized candidate key, conflict field, provider, and listing ID. It then exits nonzero, so the existing enforcement step remains fail closed while the `always()` artifact upload preserves the diagnostic evidence.

The Rollout Simulation workflow generates a row and idempotency preview with zero writes. It fixes both bounded persistence settings off and contains no persistence command.

## Activation boundary

Enabling the Production workflow, changing Repository Variables, or executing bounded persistence requires a separate explicit approval after a merged-main Simulation preview succeeds. Do not activate from a pull request or a stale plan.
