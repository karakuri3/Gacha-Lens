# Daily operations checklist

This project is intentionally semi-automated. Official master data stays first, and loose market, X, restock, and stock signals must pass through review before they can be trusted.

## Every morning

1. Open the latest GitHub Actions run for `Gacha ingestion`.
2. Confirm `npm run db:upsert-all` finished successfully.
3. If it failed, download `ingestion-log` and check the `failedStep` field.
4. Open `/review` with the admin token.
5. Clear or annotate `high` issues first, especially official master or missing variant records.
6. Check `medium` unknown variant issues for market, X, restock, and stock rows.
7. Leave truly ambiguous records unresolved until the source can be verified.

## What good looks like

- Official upsert runs before market, X, and stock.
- `db:check-schema` returns `ok: true`.
- New `import_issues` are explainable by source quality, not schema errors.
- `unknown_variant` counts do not grow for the same product name every day.
- Ranking and schedule pages still show variant-first data.

## If ingestion fails

1. Read the `failedStep` in the final JSON log.
2. Fix missing env or source data first.
3. If the error mentions a missing column, re-apply `supabase/schema.sql`, then run `npm run db:check-schema`.
4. Rerun the GitHub Action manually.
5. Open `/review` and check whether duplicated unresolved records were created.

## Weekly sanity check

- Confirm official product rows still create the expected `series` and `variants`.
- Confirm market listings still split into single, set, rare/secret, and unknown.
- Confirm X reactions affect forecast axes without showing market price on unreleased variants.
- Confirm restock and stock reports feed `availability_summary`.
- Export `/api/import-issues?format=csv` for a quick review archive.
