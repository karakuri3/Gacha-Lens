# Variant image conflict readiness

This tool is the safety gate for the existing rows where a variant image may have
been copied from its parent series image.

It does **not** connect to Supabase, load environment files, make network
requests, or write Production data. It accepts a prepared JSON snapshot only.

## Why exact URL equality is not enough

A parent/variant image equality is strong evidence of false variant provenance
when a series has multiple variants, but it is not sufficient for an automatic
rewrite in every case.

The readiness classifier therefore uses these rules:

- multi-variant series + same normalized parent image + no explicit
  `image_scope=variant` => safe clear candidate;
- provisional variant in the same situation => separately counted safe clear
  candidate;
- explicit `image_scope=variant` conflict => manual review;
- one-variant series => manual review;
- missing/unknown sibling count => manual review;
- distinct image => no action.

"Safe clear" means only that a future reviewed cleanup may clear the variant
image column so presentation falls back honestly to the parent image. It does
not authorize a database write.

## Input

```json
{
  "schema_version": 1,
  "records": [
    {
      "variant": {
        "id": "optional-id",
        "image": "https://images.example/series.jpg",
        "variant_type": "normal",
        "image_scope": "series"
      },
      "parent": {
        "id": "optional-series-id",
        "image_url": "https://images.example/series.jpg"
      },
      "sibling_count": 4
    }
  ]
}
```

Run:

```bash
node scripts/variant-image-conflict-readiness.mjs --input=prepared-input.json
node scripts/variant-image-conflict-readiness.mjs --input=prepared-input.json --json
```

The command accepts up to 20,000 records and 4 MiB. Output contains aggregate
counts and record indexes only; it does not echo IDs or URLs.

## Safety boundary

This change is intentionally preparation-only:

- Production reads: 0
- Production writes: 0
- credential reads: 0
- network requests: 0
- cleanup execution: not implemented

A separate exact-head, read-only extraction/audit must establish the real
Production bucket counts before any write-capable cleanup is designed.
