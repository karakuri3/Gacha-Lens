# Gacha Lens Status

Updated: 2026-09-05 JST — Final Release/Cutover complete; normal development ready

The complete status checkpoint immediately before this closeout is preserved byte-for-byte at `docs/history/2026-09-05-pre-final-cutover-STATUS.md`.

## Company infrastructure migration — COMPLETE

Final state:
- Stage 1 Vercel waste control: complete; after this closeout automatic Vercel Git builds are unconditionally skipped.
- Stage 2 Cloudflare parallel environment: complete.
- Stage 3 Beach Cloudflare parity: previously passed/separated from this repository.
- Stage 4 Gacha Lens Cloudflare runtime + portable P0 cache: PASS and released.
- Stage 5 Supabase hardening isolated: PASS; scoped Production-recommended hardening applied and verified.
- Final Release/Cutover: **PASS**.
- Normal development gate: **OPEN / READY**.

## Current Production runtime

- Production URL: `https://gachalens.com`
- Runtime: Cloudflare Worker `gacha-lens`
- Verified cutover Worker version: `811ab60a` at 100% traffic
- Cloudflare authoritative DNS: Active
- Nameservers: `lady.ns.cloudflare.com`, `tony.ns.cloudflare.com`
- apex: Worker Custom Domain -> `gacha-lens`
- `www`: Cloudflare proxied `192.0.2.1` + Active 301 redirect to apex, preserving path/query
- Vercel web A/wildcard routes: removed
- Vercel remains domain registrar and non-live rollback artifact only
- Supabase Production: `vxbrnvfhmzcxehuuzzum`

## Final web verification

PASS after cutover:
- `/`
- `/ranking`
- `/schedule`
- `/series`
- `/stock`
- `/restocks`
- `/robots.txt`
- `/sitemap.xml`
- representative Japanese `/series/[slug]` that previously failed on Vercel with an invalid `x-next-cache-tags` 500
- `www` HTTP/HTTPS 301 redirect with path/query preservation

Negative routing proof:
- removed Vercel wildcard DNS no longer catches arbitrary subdomains; an undeclared cutover-test hostname fails DNS resolution.

Production observability at closeout:
- Cloudflare error metrics: zero in the inspected cutover window.
- Workers Logs: disabled; therefore log-stream review is not claimed.
- Cloudflare deployment history exposes prior versions for rollback.

## Supabase hardening — Production verified

Applied/verified:
- direct `anon`/`authenticated` grants on 13 server-only target tables: 0
- `service_role` CRUD target coverage: 13/13
- intentional public tables preserved: 4/4
- future default privileges: scoped Candidate A
- unused `pg_graphql`: removed non-CASCADE after fresh dependency preflight
- Production migration history synchronized to Git

HOLD / intentionally not applied:
- `pg_net` relocation
- global Candidate B PUBLIC function-default revoke
- FK/index optimizations not independently prioritized for current scale
- unused-index cleanup

## Vercel state

Vercel is no longer Production hosting for Gacha Lens.

- Project `gachalens` is `live: false` in the connected project snapshot.
- No `gachalens.com` custom Production domain remains on the project; only Vercel-owned `.vercel.app` domains remain.
- Latest observed target-production deployment was canceled/non-live.
- Repository `vercel.json` is changed in this closeout to `ignoreCommand: "exit 0"`, so automatic Git-triggered Vercel builds are skipped. Manual rollback action is separate and explicit.
- Registrar/renewal remains at Vercel; this is intentional and independent of web runtime.

## Current operational priority after cutover

Infrastructure migration itself no longer blocks work. The existing priority model remains:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

Issue #219 Supabase uncached-Egress / Fair Use risk remains **open until read-only post-release measurement proves the trajectory is controlled**. The Cloudflare cutover and portable cache materially change the runtime architecture, but they do not by themselves prove billed-byte recovery.

If Egress remains materially high, continue bounded attribution/mitigation as P0. If it normalizes, reassess the next product/business experiment instead of automatically returning to Data Scale depth work.

## Existing approval boundaries remain

- exact #228 R4 authority remains consumed/non-reusable
- no provider refresh/write by implication
- no workflow dispatch/change by implication
- no Secrets/Variables change by implication
- no paid/destructive action without applicable approval
- no automatic RPC retry
- keep `.github/workflows/gacha-ingestion.yml` disabled
- never touch `supabase/.temp/cli-latest`
- no direct main push

## Separate non-blocking debt

- Workers Logs/observability policy
- Stage 5 HOLD items
- cleanup/closure of historical isolated Draft PRs
- Vercel rollback artifact retirement after an appropriate stabilization period, if/when separately approved

## Canonical history

`docs/history/2026-09-05-pre-final-cutover-STATUS.md`
