# Variant parent-image copy cleanup audit

This Phase 1 audit is intentionally read-only.

A cleanup candidate must satisfy all of the following:

- variant row has a non-empty ID;
- `source_type = official_site`;
- variant image and parent series image are both non-empty;
- the two image URL strings are exactly equal after outer whitespace trimming;
- variant type is one of `provisional`, `normal`, `rare`, or `secret`.

The audit does not update, delete, or upsert any row. It produces deterministic candidate IDs, per-type counts, rejection reasons, and a SHA-256 over the sorted candidate IDs.

## Production read-only baseline — 2026-09-24 JST

Using the exact candidate predicate above against `gacha-lens-tokyo`:

- total candidates: 7,072
- provisional: 3,570
- normal: 3,492
- rare: 5
- secret: 5
- review_required: 3,570
- sorted candidate-ID SHA-256:
  `fb9dded1fcf82bf646e20425ffd9f886aa8ef6346fc712f135f1c5867efe09e0`

This baseline is evidence only. It does not authorize Production cleanup.

Any later write phase must be separately approval-gated, target only the reviewed candidate IDs, and verify exact pre/post counts before and after each bounded chunk.
