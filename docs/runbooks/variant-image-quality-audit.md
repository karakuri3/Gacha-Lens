# Offline variant image-quality audit

`npm run image:audit` classifies prepared variant and parent image records with the
same presentation helper used by the application. It is local-only: the command
does not load a catalog, environment file, credential, database, or network URL.

Pass exactly one explicit JSON file or use `-` to read JSON from stdin:

```bash
npm run image:audit -- --input=tests/fixtures/variant-image-quality-audit.json
npm run image:audit -- --input=tests/fixtures/variant-image-quality-audit.json --json
node scripts/variant-image-quality-audit.mjs --input=- --json < prepared-input.json
```

The input contract is:

```json
{
  "schema_version": 1,
  "records": [
    {
      "variant": {
        "id": "optional-local-id",
        "image": "https://images.example/variant.jpg",
        "variant_type": "normal"
      },
      "parent": {
        "id": "optional-parent-id",
        "brand": "バンダイ",
        "image_url": "https://images.example/series.jpg"
      },
      "sibling_count": 4
    }
  ]
}
```

The accepted image aliases match the presentation helper: variants may use
`image`, `image_url`, or `imageUrl`; parents may use `image_url` or `imageUrl`.
`variant.image_scope` and `variant.raw.image_scope` are also accepted. Unknown
fields, malformed values, more than 10,000 records, and inputs over 1 MiB fail
closed with exit code 2.

Successful audits exit 0 even when records are missing images or suppress an
untrusted candidate. Human and JSON modes report only record indexes, bounded
outcome counts, and generated/provisional suppression flags. They deliberately
do not echo IDs, names, image URLs, input paths, or environment values.

Outcomes are derived from `buildVariantImagePresentation`:

- `trusted_variant`: a proven variant-scoped image
- `series_fallback`: a parent/series image used without claiming variant scope
- `missing`: no usable presentation image

Generated-placeholder and provisional counts can overlap. They explain the two
directly detectable fail-closed suppressions without replacing the authoritative
presentation outcome.

File input rejects URL, UNC, and Windows device paths. The command writes only to
stdout/stderr and performs zero network requests, credential reads, Production
reads, or database writes.
