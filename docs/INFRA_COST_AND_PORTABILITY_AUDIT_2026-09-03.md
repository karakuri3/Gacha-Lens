# Infra Cost & Portability Audit — 2026-09-03

## Decisions

- Keep current Vercel Production until a parallel alternative is proven.
- Do not change `gachalens.com` DNS during migration validation.
- Skip Vercel builds for docs-only changes using the previous successful deployment SHA, not only `HEAD^`, so multi-commit pushes cannot hide code changes.
- Batch remote pushes at reviewable validation checkpoints; local commits/tests may remain fine-grained.
- Treat hosting portability, recurring cost, observability cost, and deployment churn as release-quality concerns.

## Migration gate

An alternative host must pass at least:

1. build and runtime compatibility,
2. all public routes and API routes,
3. Supabase connectivity and auth boundaries,
4. caching / ISR semantics used by production,
5. sitemap / robots / metadata and canonical URLs,
6. security headers,
7. environment variable separation,
8. error monitoring,
9. rollback path,
10. custom-domain cutover rehearsal without changing production DNS.

Only after these checks pass may `gachalens.com` DNS be considered for cutover.
