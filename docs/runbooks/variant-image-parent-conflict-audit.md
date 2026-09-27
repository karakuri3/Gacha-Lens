# Variant parent-image conflict audit (GL-049)

This audit is the read-only classification phase for parent-series images already persisted in variant image fields. GL-048 prevents new parent artwork from being copied into new variant image values; GL-049 only identifies which existing rows are safe cleanup candidates.

## Safety contract

The audit command is intentionally offline:

- network requests: 0
- credential reads: 0
- Production reads: 0
- database writes: 0

Production extraction is a separate SELECT-only step. The audit command never performs UPDATE, DELETE, INSERT, UPSERT, migrations, schema changes, or RLS changes.

## Candidate contract

A row is a cleanup candidate only when all of the following are true:

1. the variant ID, parent series ID, and variant-to-series relationship are valid;
2. \`source_type = official_site\`;
3. both variant and parent image values are valid absolute HTTP(S) URLs;
4. the variant image and parent image are exact string matches;
5. there is no explicit \`variant\` image scope;
6. the current presentation helper reports \`series_fallback\` and no trusted variant image;
7. the series contains more than one variant.

Singletons fail closed as \`singleton_ambiguous\`, including provisional singletons whose presentation path would otherwise suppress the variant image.

## Deterministic output

Candidate IDs are sorted by raw UTF-8 byte order, not locale-aware collation. The candidate-set digest is:

\`\`\`text
sha256(JSON.stringify(sortedCandidateIds))
\`\`\`

A PostgreSQL extraction that needs to reproduce the ordering should use \`COLLATE "C"\`.

The report exposes:

- \`candidate_count\`
- \`candidate_type_counts\`
- fixed \`candidate_type_buckets\` for provisional / normal / rare / secret / other
- \`other_variant_type_counts\`
- \`rejection_counts\`
- \`candidate_set_sha256\`

## Run

\`\`\`bash
npm run image:parent-conflict-audit -- --input=prepared-input.json
\`\`\`

Input schema:

\`\`\`json
{
  "schema_version": 1,
  "records": [
    {
      "variant": {
        "id": "variant-id",
        "series_id": "series-id",
        "source_type": "official_site",
        "variant_type": "normal",
        "image": "https://example.test/image.jpg",
        "raw": { "image_scope": null }
      },
      "parent": {
        "id": "series-id",
        "brand": "Example",
        "image_url": "https://example.test/image.jpg"
      },
      "sibling_count": 4
    }
  ]
}
\`\`\`

## Production SELECT-only evidence — 2026-09-28

Project: \`gacha-lens-tokyo\` (\`vxbrnvfhmzcxehuuzzum\`), region \`ap-northeast-1\`.

The current exact-conflict census is 7,077 rows:

- provisional: 3,570
- normal: 3,497
- rare: 5
- secret: 5
- other variant types: 0

All 7,077 exact-conflict rows are the audit input. Classification result:

- safe cleanup candidates: 5,885
- provisional candidates: 2,383
- normal candidates: 3,492
- rare candidates: 5
- secret candidates: 5
- other-type candidates: 0
- rejected: 1,192
  - \`singleton_ambiguous\`: 1,187
  - \`invalid_or_blank_image_url\`: 5
  - all other rejection reasons: 0
- candidate set SHA-256: \`sha256:5f5ce212e4e8518df554b16c3342a3cea6fa154c35238e344586715f14fdf4c9\`

The five invalid image rows are exact empty-string matches between variant and parent image fields, so they are not HTTP(S) URLs and are rejected. All 1,187 singleton exact-conflict rows are provisional and remain excluded from cleanup candidates.

No Production row was changed while obtaining this evidence.
