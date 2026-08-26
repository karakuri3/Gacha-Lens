# Gacha Lens Status

Updated: 2026-08-27 JST

This is the compact live-state companion to `docs/HANDOFF.md`.

## Repository

- repo: `karakuri3/Gacha-Lens`
- current verified main: `b6f702152a5e65c54738390455e4663cdf9c593c`
- latest merged PR: #91 `F3-C1: add series complete-set market evidence diagnostic`
- open implementation PRs at handoff: none

## Vercel

- project: `gachalens`
- project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`
- PR #91 merge Production deployment: READY
- aliases include `gachalens.com` and `www.gachalens.com`

## Supabase Production

Project: `vxbrnvfhmzcxehuuzzum`

Verified counts:

| Metric | Count |
| --- | ---: |
| series | 10,221 |
| variants | 23,708 |
| market_listings | 58 |
| market_listing_observations | 58 |
| restock_events | 0 |
| import_issues | 133 |
| review_required variants | 7,535 |
| provisional variants | 7,535 |
| single listings | 58 |
| complete_set listings | 0 |
| Qualia series | 1 |

## GSC

Property: `sc-domain:gachalens.com`

| Sitemap | Submitted | Pending | Warnings | Errors |
| --- | ---: | --- | ---: | ---: |
| `/series-sitemap.xml` | 2,703 | false | 0 | 0 |
| `/variant-sitemap.xml` | 16,173 | false | 0 | 0 |
| `/sitemap.xml` | 19,177 | false | 1 | 0 |

Do not interpret sitemap-summary `indexed=0` as whole-site unindexed without URL/performance evidence.

## Completed current phases

- F3-A Series-first discovery UX: complete / merged
- F2-E1 Qualia series-only plumbing: complete / merged
- Qualia read-only readiness audit: success
- Qualia one-series Production canary: success
- F3-B1 Series-first Indexation Observability: complete / merged
- GSC series/variant sitemap submission: complete
- F3-C1 Series Complete-Set read-only classifier/diagnostic: complete / merged

## Automatic lanes

### F0 Official

- bounded automatic Production path exists and has succeeded
- leave unchanged unless a verified defect requires work

### P3 V2 Market

- automatic Production path is active and working
- Production currently has 58 single listings / observations
- do not weaken single-item matcher

### Kitan

- manual canary succeeded
- auto gate remains NOT APPROVED

### Qualia

- one series-only Production canary succeeded
- auto rollout remains NOT APPROVED

## F3-C1 state

The code exists on `main`, but the new workflow has **not been dispatched**.

Workflow intent:

- read-only
- workflow_dispatch only
- Priority 3
- max 25 variants
- one variant per series
- planner APIs only
- zero database writes

Accepted complete-set evidence is series-level only:

- `listing_type=complete_set`
- `market_review_type=full_set`
- `variant_id=null`
- `matched_variant_id=null`

Production complete-set listings remain 0 until a later separately approved persistence phase.

## Immediate next boundary

Explicit approval is required to dispatch:

**Gacha Market Series Complete-Set Read-Only Diagnostic**

After dispatch, inspect the sanitized artifact and independently verify DB zero-delta before deciding the next implementation.

## Current business bottleneck

The platform, safety system, basic UX, official ingestion, and market-ingestion framework are largely built.

The main remaining business bottlenecks are:

1. market-evidence density
2. organic/indexed traffic growth
3. affiliate conversion volume
4. later AdSense readiness

Avoid broad infrastructure expansion unless it clearly supports these.