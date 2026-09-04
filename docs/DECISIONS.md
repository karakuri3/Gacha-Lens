# Gacha Lens Durable Decisions

Updated: 2026-09-05 JST — company infrastructure Final Release/Cutover complete

The complete decisions checkpoint immediately before this closeout is preserved byte-for-byte at `docs/history/2026-09-05-pre-final-cutover-DECISIONS.md`. Decisions D-001 through D-123 remain authoritative unless explicitly superseded below.

## Authoritative additions

### D-124 — Cloudflare is the Production web runtime and authoritative DNS for Gacha Lens

The Stage 4 Cloudflare runtime/P0 cache proof has been promoted to Production and the final domain cutover has passed.

Production web requests for `gachalens.com` terminate on Cloudflare and are served by Worker `gacha-lens`. The cutover verified Worker version `811ab60a` at 100% traffic, the apex Custom Domain, representative P0 routes, and the Japanese series URL that previously returned a Vercel `x-next-cache-tags` 500.

Future normal releases target Cloudflare. Vercel is not the routine Production runtime.

### D-125 — Domain registrar, authoritative DNS, and application runtime are intentionally separated

`gachalens.com` remains registered/renewed through Vercel while authoritative DNS is Cloudflare (`lady.ns.cloudflare.com`, `tony.ns.cloudflare.com`) and application runtime is Cloudflare Workers.

This separation does not weaken domain ownership and is intentional. `_domainconnect.gachalens.com -> _domainconnect.vercel-dns.com` may remain while Vercel is registrar because it is not a web-traffic dependency.

Mail/verification records must remain independent of hosting changes; ImproveMX MX/SPF, Google verification TXT, and CAA records were preserved during cutover.

### D-126 — `www` canonicalization is a Cloudflare edge redirect, not a Vercel fallback

`www.gachalens.com` uses a proxied placeholder A record (`192.0.2.1`) and an Active Cloudflare Redirect Rule issuing 301 to the apex while preserving path and query string.

Old Vercel `www` and wildcard web A records are removed. Arbitrary undeclared subdomains must not silently fall through to Vercel.

### D-127 — Automatic Vercel Git builds are disabled after cutover; Vercel is retained only as a non-live rollback artifact

The Vercel project is no longer live for `gachalens.com` and has no custom Production domain. To prevent migration completion from recreating avoidable Vercel build cost, repository `vercel.json` uses `ignoreCommand: "exit 0"`; Vercel documents exit code 0 as skipping the build.

The Vercel project and Vercel-owned deployment domains may remain temporarily as an explicit rollback/stabilization artifact. Routine Preview/Production builds must not be generated there. Any future reactivation is a deliberate rollback/platform decision, not normal release behavior.

### D-128 — Stage 5 Production hardening is independently durable and is not coupled to application rollback

The Production-recommended subset of Stage 5 was applied after fresh preflight and postflight:
- direct anon/authenticated grants removed from 13 server-only targets;
- service-role CRUD preserved 13/13;
- four intentional public tables preserved;
- scoped future-default Candidate A applied;
- unused `pg_graphql` removed non-CASCADE after zero dependency preflight.

These database controls are independently verified. Rolling back a Cloudflare application version does not imply rolling back database hardening. A DB rollback requires a concrete compatibility defect and the item-specific rollback contract.

The following remain HOLD: `pg_net` relocation, Candidate B global PUBLIC function-default revoke, FK/index work not separately prioritized for current scale, and unused-index cleanup.

### D-129 — Final infrastructure cutover completion unblocks normal development without closing unrelated reliability or approval gates

The company infrastructure migration is complete when Cloudflare Production/domain routing, scoped Supabase hardening, P0 smoke, rollback evidence, Vercel build-cost shutdown, and canonical state are all closed.

That completion means infrastructure migration no longer blocks normal development. It does **not** mean:
- Issue #219 billed Egress is proven solved;
- old Production/provider/write approvals become reusable;
- Stage 5 HOLD items are automatically authorized;
- monitoring debt must be fixed before all product work.

The existing prioritization remains:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

### D-130 — Cutover observability evidence must distinguish metrics from logs

At closeout, Cloudflare error metrics showed zero errors in the inspected window, but Workers Logs were disabled. Durable records must say exactly that; they must not claim a log-stream review that did not occur.

Deployment history/prior Worker versions are the primary immediate application rollback mechanism. Enabling Workers Logs/retention is separate observability work and should be justified by operational value/cost.

## Current durable state

- infrastructure migration: **COMPLETE**
- normal development: **READY**
- Production web runtime: Cloudflare Worker `gacha-lens`
- cutover Worker version: `811ab60a` at 100% traffic
- authoritative DNS: Cloudflare
- registrar: Vercel
- Vercel hosting: non-live rollback artifact; automatic Git builds skipped
- Supabase Production: `vxbrnvfhmzcxehuuzzum`
- Stage 5 recommended Production subset: applied/verified
- Stage 5 HOLD items: unchanged
- Issue #219: remains open pending measured Egress trajectory
- exact #228 authority: consumed/non-reusable

## Hard durable constraints

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- do not manually alter Supabase migration ledger identity/timestamps
- do not weaken strict market matching or identity guards for coverage
- completed sold evidence remains separate from asking-price evidence
- do not scrape Mercari or Amazon
- direct main pushes remain prohibited
- no paid/destructive action without applicable approval

## Canonical history

Immediate pre-final-cutover decisions snapshot:

`docs/history/2026-09-05-pre-final-cutover-DECISIONS.md`
