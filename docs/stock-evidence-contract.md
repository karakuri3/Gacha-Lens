# Stock evidence contract

Issue #439 is blocked on provider permission/feed access, but provider stock evidence can still be modeled safely before activation.

## Root cause

The legacy stock path ultimately tried to resolve every stock/restock record to a concrete variant. Text matching used the first matching variant. That is unsafe for provider evidence whose granularity is only **series/product x store**: a known series must never be converted into an arbitrary capsule variant.

## Normalized contract

`lib/domain/stock-evidence-contract.js` defines contract version 1 with:

- `evidence_scope`: `series`, `variant`, `provider_product`, or `unresolved`;
- local `series_id` / `variant_id` identity kept separately;
- provider product ID, JAN/GTIN-compatible identity, and provider store ID;
- source URL;
- provider reported/updated timestamps;
- fetch timestamp;
- structured provenance;
- stock state;
- raw evidence;
- confidence plus explicit review reasons.

An explicit local ID is authoritative enough to validate, not enough to invent. If both local IDs are supplied they must agree with the official catalog.

## Resolution rules

- Valid variant ID -> exact variant, with series membership checked when `series_id` is also present.
- Valid series ID and no variant ID -> series-level evidence. Text is **not** used to pick a child variant.
- Invalid explicit series/variant IDs -> fail closed.
- Provider identity only -> retained for later mapping, but no local series/variant is invented.
- Legacy records with no local/provider identity may still use text matching for backward compatibility, but only when exactly one variant matches.
- Multiple text matches -> `ambiguous_variant_text`; the previous first-match behavior is forbidden.

## Persistence boundary

The current tables contain `series_id`, but the existing public stock path is variant-oriented and does not carry an explicit evidence-scope discriminator. Until a schema/public-read migration is deliberately approved, **series-level and provider-only evidence must not be written as normal stock/restock rows**.

The ingestion boundary therefore keeps the normalized contract in raw evidence and emits a precise `import_issues` reason such as:

- `series_level_persistence_unsupported`
- `provider_identity_unresolved`
- `invalid_series_id`
- `invalid_variant_id`
- `variant_series_mismatch`

This guarantees fake variant mapping remains zero.

## Future migration note

After provider permission/feed access exists, a future migration can add an explicit evidence-scope/provider-identity persistence model (either dedicated inventory-evidence storage or explicit columns plus public-read rules). That migration must separately define how series-level evidence is rendered and must not make it appear as variant-level availability.

No schema, RLS, Production DB, provider request, or provider execution is part of this change.
