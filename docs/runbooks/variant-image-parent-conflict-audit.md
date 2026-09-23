# Variant parent-image conflict audit

This audit is Phase 1 of #421. It is intentionally offline and read-only.

## Purpose

Classify prepared variant/parent records where a persisted single-item image may actually be the parent-series image.

A row becomes a cleanup candidate only when all of these are true:

- variant, series and relationship identifiers are valid;
- the row is owned by `official_site`;
- both image values are valid absolute HTTP(S) URLs;
- the persisted variant image is an exact string match for the parent series image;
- there is no explicit `variant` image scope;
- the existing application presentation helper classifies the image as `series_fallback`, not as a trusted variant image.

This deliberately fails closed for ambiguous cases such as a one-item series where the same image could legitimately represent both series and item.

## Run

```bash
npm run image:parent-conflict-audit -- --input=prepared-input.json
```

The output contains deterministic candidate IDs, type counts, rejection counts, and a SHA-256 digest of the sorted candidate ID set.

## Safety

The command itself:

- makes no network requests;
- reads no credentials;
- reads no Production database;
- performs no database writes.

Preparing Production input or applying any cleanup is a separate approval-gated operation. Do not add UPDATE/DELETE/UPSERT behavior to this audit command.
