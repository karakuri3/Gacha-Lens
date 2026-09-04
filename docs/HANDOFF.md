# Gacha Lens Canonical Handoff

Updated: 2026-09-05 JST — company infrastructure Final Release/Cutover complete; normal development ready

The complete canonical checkpoint immediately before this closeout is preserved byte-for-byte at `docs/history/2026-09-05-pre-final-cutover-HANDOFF.md`. Earlier history remains linked from that snapshot.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/FINAL_CUTOVER_2026-09-05.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, open/recent Issues and PRs, current Cloudflare Production state, and only the minimum Supabase evidence needed for the next gate.
3. **Do not resume the Stage 4/Stage 5 migration. It is complete.** Cloudflare is now the Production web runtime and Cloudflare authoritative DNS is live.
4. Issue #219 Supabase Egress observation remains a separate reliability/cost lane. Final infrastructure cutover does not prove billed-byte recovery and does not close #219.
5. Production data writes, migrations/schema/backfills, approval-bound provider execution, workflow dispatch/change, Secrets/Variables, paid/destructive actions, and ineligible merges/releases still require their applicable approval. The consumed #228 authority remains non-reusable.
6. After each future major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major phase.

## Final Production infrastructure state

- Repository: `karakuri3/Gacha-Lens`
- Final cutover source main: `dfd70c59d1d880643f3658510a8a4c363eccc2a7`; always re-fetch current main after this canonical-sync PR merges.
- Production domain: `https://gachalens.com`
- Production web runtime: Cloudflare Worker `gacha-lens`.
- Verified active Cloudflare Worker version at cutover: `811ab60a`, 100% traffic.
- `gachalens.com`: Cloudflare Worker Custom Domain, Production.
- `www.gachalens.com`: Cloudflare proxied redirect host (`192.0.2.1`) with an Active 301 rule to apex; path and query string preservation verified for HTTP and HTTPS.
- Authoritative DNS: Cloudflare (`lady.ns.cloudflare.com`, `tony.ns.cloudflare.com`).
- Domain registrar/renewal: Vercel remains registrar. Registrar ownership is separate from DNS/runtime and must not be treated as a Production Vercel dependency.
- Mail/verification DNS preserved: ImproveMX MX, SPF TXT, Google site-verification TXT, and CAA records.
- `_domainconnect.gachalens.com -> _domainconnect.vercel-dns.com` is intentionally retained while Vercel remains registrar; it is not a web-traffic route.
- Vercel project `gachalens`: retained non-live as a rollback/stabilization artifact, with no `gachalens.com` custom Production domain. Automatic Git builds are disabled by repository `ignoreCommand: "exit 0"` after this closeout lands.
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1).
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` — never confuse with Production.

## Final Cutover verification

Verified after authoritative-DNS and Worker Custom Domain cutover:

- Cloudflare zone: Active.
- Worker Production deployment: active at 100% traffic.
- P0 live smoke: `/`, `/ranking`, `/schedule`, `/series`, `/stock`, `/restocks`, `/robots.txt`, `/sitemap.xml`.
- Representative `/series/[slug]` that previously returned a Vercel `x-next-cache-tags` 500 now renders successfully on `gachalens.com` through Cloudflare.
- `www` redirect: 301 to apex with path/query preserved on both HTTP and HTTPS.
- Old Vercel apex/www/wildcard web A records removed. A random undeclared subdomain now fails DNS resolution instead of reaching Vercel.
- Cloudflare error metrics showed zero errors in the inspected cutover window. Workers Logs are currently disabled, so do not claim a log-stream review that did not occur.
- Cloudflare prior versions remain available from Deployments as the primary application rollback path.

## Supabase Stage 5 Production result

The isolated PASS was converted to the scoped Production changes that were explicitly classified as recommended:

- server-only target tables with direct `anon`/`authenticated` API grants: **0**;
- `service_role` CRUD target coverage: **13/13** preserved;
- intentional public tables: **4/4** preserved;
- future-object default privileges: Candidate A only applied;
- `pg_graphql`: removed by non-CASCADE drop after fresh zero-dependency preflight;
- migration ledger/Git history synchronized for Production migrations `20260904152326`, `20260904152339`, `20260904152405`.

Still HOLD / not changed by this cutover:
- `pg_net` relocation;
- Candidate B role-global PUBLIC function-default revoke;
- FK-index work including `market_listings(series_id)` unless separately reprioritized;
- unused-index cleanup.

## Rollback boundaries

- Application rollback: use a known-good prior Cloudflare Worker version/deployment.
- DNS/runtime rollback: restore prior web records/provider routing only if a concrete incident requires it; do not casually revert authoritative DNS after successful cutover.
- Vercel remains available as a non-live rollback artifact during stabilization, but routine Production traffic must not be routed there.
- Stage 5 database hardening is independently verified and **must not be automatically rolled back** merely because application runtime is rolled back. Revert a DB hardening item only for a concrete compatibility defect with its own preflight/rollback contract.

## Normal-development gate

**PASS — normal development may resume.**

The company infrastructure migration is no longer a blocking project. Future work is prioritized under the existing model:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

Normal development does not loosen Production approval boundaries or authorize old/consumed market-write/provider/workflow permissions.

## Remaining operational lanes (non-blocking to infrastructure cutover)

- Issue #219: continue read-only Supabase Egress trajectory observation; do not claim solved until measured.
- Cloudflare Workers Logs are disabled; enabling/retention policy may be evaluated as separate observability work if justified.
- Stage 5 HOLD items remain separate debt and require fresh evidence/priority before Production changes.
- Old isolated Draft PRs may be closed/preserved as historical evidence; they must not be merged by implication.

## Canonical history

Immediate pre-final-cutover snapshot:
- `docs/history/2026-09-05-pre-final-cutover-HANDOFF.md`
