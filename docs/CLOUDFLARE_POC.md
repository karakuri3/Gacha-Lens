# Cloudflare Workers POC

Status: non-Production compatibility proof. Do not attach `gachalens.com`, change DNS, or remove the current Vercel Production deployment until every acceptance gate passes.

## Target

- Platform: Cloudflare Workers
- Migration path: vinext
- Source repository: `karakuri3/Gacha-Lens`
- POC branch: `infra/cloudflare-poc`
- Node: 24 for repository CI and batch ingestion

## Architecture change under proof

Scheduled ingestion is already owned by `.github/workflows/gacha-ingestion.yml`. Production Supabase currently has no deployed Edge Functions and no `cron.job` entries for the retired Supabase ingestion path.

The previous `/api/ingest/[task]` implementation launched repository scripts through `node:child_process`. A Cloudflare Worker cannot execute local child processes, so the POC removes this batch executor from the web runtime. The endpoint remains authenticated but returns HTTP 410 and points operators to the GitHub Actions ingestion workflow.

The POC also removes ingestion script directories from Next.js output-file tracing because those scripts are batch-worker assets, not web-serving assets.

## Compatibility CI

`.github/workflows/cloudflare-vinext-poc.yml` performs a compile-only proof and does not deploy anything:

1. install exact repository dependencies,
2. run `vinext@1.0.0-beta.8 check`,
3. generate an ephemeral Cloudflare configuration using `vinext init`,
4. use only non-Production placeholder bindings,
5. build the Worker artifact,
6. require `dist/server/wrangler.json` to exist.

No Cloudflare account credentials, production DNS, or custom-domain mutations are used by this workflow.

## Acceptance gates before a real preview deployment

1. Existing Next.js tests, lint and build remain green.
2. The vinext compatibility workflow passes on the exact POC head.
3. App Router pages, Route Handlers, SSR/SSG/ISR behavior used by Gacha Lens compile and execute in a Cloudflare preview.
4. Supabase public/server access preserves the current security boundary; no service-role or database credential reaches the browser.
5. Admin/review authorization, cookies and timing-safe token checks work in the Worker runtime.
6. All public pages, search/filter, market data, restock data, community reports and outbound affiliate flows pass smoke tests.
7. SEO metadata, sitemap, robots behavior and canonical URLs match Production.
8. The GitHub Actions ingestion workflow continues to operate independently of the web host.
9. Response/security headers and observability are equivalent or stronger than Production.
10. A rollback path to the existing Vercel deployment is documented and rehearsed before DNS changes.

## Cutover rule

`gachalens.com` stays pointed at Vercel throughout the POC. Only after an independent Cloudflare preview passes all gates may DNS be changed. Vercel Pro is cancelled only after the Cloudflare Production cutover is verified and rollback evidence is captured.
