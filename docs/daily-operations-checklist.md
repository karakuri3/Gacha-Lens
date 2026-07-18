# Daily operations checklist

## Community reports

- Open `/review` and check `Community submissions` first.
- Approve only reports whose product, price/status, and evidence URL are consistent.
- Approved price reports become reviewed market signals; approved availability reports become stock/restock signals.
- Reject duplicates, unverifiable claims, personal information, and unrelated URLs.
- Keep the pending queue below 30 items so operational health stays green.

This project is designed for always-on ingestion with a review safety layer. Official master data stays first, and loose market, X, restock, and stock signals must pass through review before they can be trusted.

Until Supabase Cron is registered again, GitHub Actions runs official hourly, market every 30 minutes, and stock hourly. After Supabase Cron is confirmed healthy for a full day, reduce the GitHub schedule back to a daily fallback to avoid duplicate provider queries.

## Every morning

1. Check Supabase Cron run history for the four ingestion jobs.
2. Check the `ingest` Edge Function logs for non-200 responses.
3. If the primary Cron path failed, open the latest GitHub Actions run for `Gacha ingestion`.
4. Confirm `npm run db:upsert-all` finished successfully as the fallback.
5. If it failed, download `ingestion-log` and check the `failedStep` field.
6. Open `/review` with the admin token and check the `Operational health` score.
7. If needed, call `/api/ops-health` with the review token to inspect machine-readable health JSON.
8. In `Ingestion history`, confirm official, market, and stock have a recent `succeeded` run. A failed run is more urgent than an unchanged record count.
8. Run `npm run data:audit` when source coverage or generated raw counts look wrong.
9. Run `npm run data:audit-remote` to compare actual Supabase counts, variant linkage, and unresolved review totals.
10. Clear or annotate `high` issues first, especially official master or missing variant records.
11. Check `medium` unknown variant issues for market, X, restock, and stock rows.
12. Leave truly ambiguous records unresolved until the source can be verified.

## What good looks like

- Official upsert runs before market, X, and stock.
- `db:check-schema` returns `ok: true`.
- `npm run data:audit` shows configured official/X/stock automation sources, or an intentional approved market feed gap.
- New `import_issues` are explainable by source quality, not schema errors.
- `unknown_variant` counts do not grow for the same product name every day.
- `/review` health is `ok` or has only explainable `warning` states.
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
- Confirm `/api/ops-health` readiness score is improving as real market, X, and stock feeds grow.
- Treat X as optional while `X_FETCH_ENABLED=false`. The default `all` task runs official, market, and stock only; `--task=x` remains available for a future API connection.
- Export `/api/import-issues?format=csv` for a quick review archive.
