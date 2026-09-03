# Gacha Lens Latest Thread Handoff

Updated: 2026-09-04 JST

A fresh ChatGPT thread that receives only **「Gacha Lens続けて」** must read, in this order:

1. `docs/COMPANY_INFRA_MIGRATION_PRIORITY.md` — company-level execution order; this wins over local P0 sequencing unless the user explicitly changes priorities.
2. this file.
3. `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`.
4. live GitHub / Vercel / Cloudflare / Supabase state before taking action.

## Company-level execution order

1. Stop avoidable Vercel spend — immediate incident containment DONE; keep cost-aware build discipline active.
2. Create Cloudflare parallel environments — substantially DONE.
3. Fully validate `beach-match-manager` on Cloudflare first — **CURRENT TOP EXECUTION PRIORITY**.
4. Validate Gacha Lens on Cloudflare including Next.js/vinext runtime compatibility.
5. Validate selected Supabase hardening in isolated/rehearsal environment.
6. If all gates pass, cut over `gachalens.com` with rollback ready.
7. Only after stable cutover/rollback proof, downgrade or cancel Vercel Pro.

Do not allow a project-local P0 to silently replace this company-level sequence again.

## Verified Cloudflare migration state

### Beach
- Cloudflare Pages project `beach-match-manager` exists and is deployed.
- Isolated POC production branch: `infra/cloudflare-poc`.
- Build: `npm run build`; output: `dist`.
- Browser-safe envs configured: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `VITE_R3_05_NATIVE_MATCH_WRITER=true`, `VITE_R3_05_NATIVE_HISTORY_EDITOR=false`.
- Public isolated URL: `https://beach-match-manager.pages.dev/`.
- Verified deployment source: `aebed0155ccef98cfff85547996b06ffab46ea64`.
- Draft PR #211 remains open and unmerged.
- App renders on Pages and direct `/mypage` navigation returns the SPA rather than a host-level 404.
- POC `_headers` preserves CSP, HSTS, nosniff, DENY framing, referrer policy, permissions policy, COOP and DNS-prefetch hardening.
- No custom domain is attached; public Production remains Vercel.

Beach Step 3 is **not closed yet**. Remaining acceptance: interactive auth/session/logout on the Cloudflare origin; representative Supabase-backed read/write flow including native match writer; confirm native history editor remains OFF; representative auth-dependent flows; Sentry/CSP smoke; served-header verification; final diff/main-drift review and acceptance record.

### Gacha
- Draft Cloudflare PR #235 remains open and unmerged.
- Exact-head vinext compatibility/build previously passed at `3c541b07dc3776b0c5bab6c660dbaa15ce7722db`.
- POC separated Node-only child-process ingestion execution from the web runtime; scheduled ingestion remains owned by GitHub Actions.
- Real `workers.dev` runtime parity is not yet proven.
- No `gachalens.com` DNS/custom-domain cutover has occurred.

## Current Gacha Supabase egress P0

The repeated public product-detail Supabase read problem remains real and must be resolved before final Gacha acceptance if still reproducible, but it is now explicitly subordinate to the company roadmap above.

Draft PR #240: `fix: bound public Supabase reads to ingestion cadence`
- branch: `fix/p0-public-data-cache-30m`
- current PR head at this handoff: `a1b0dea74c04f1ed9175a767b63d5c3407707e71` (latest change is documentation/priority state)
- base main at last check: `da506232472c22c909f95e5a855b1cfed8889e73`
- PR remains Draft and MUST NOT be merged without backend-load proof and applicable Production approval.
- P0 implementation Issue #239; parent reliability/cost Issue #219.

Rejected experiments that must not be repeated:
1. `revalidate=1800` alone — backend reads repeated.
2. full-route `force-static + revalidate=1800` — Japanese slug HTTP 500 / invalid cache tags.
3. operation-scoped custom fetch cache — Japanese route worked, Supabase full read set repeated.
4. `unstable_cache` facade via alias — read set repeated.
5. instrumented `unstable_cache` facade — runtime proved facade executed, but identical second request re-ran the same origin callbacks and Supabase reads.
6. module-scope `unstable_cache` candidate also failed: identical second request still emitted the same variant/related origin markers and repeated Supabase product-detail reads. Do not spend more builds on `unstable_cache`/alias variants.

The P0 solution should be portable toward Cloudflare; do not add a paid Vercel-only dependency without explicit approval. Candidate directions remain response/CDN-safe public boundary caching, a portable cache adapter, or reshaping/precomputing the public read model. Re-evaluate after Beach Cloudflare acceptance unless a Beach blocker directly requires Gacha work.

## Safety state

- No Production DB/schema/data write, DNS change, Auth change, secrets/variables change, paid action, or direct-main push is authorized by this handoff.
- Do not merge PR #211, #235, or #240 merely because CI is green.
- Keep `gachalens.com` on Vercel until Beach + Gacha + Supabase rehearsal + rollback gates pass.
- Do not downgrade/cancel Vercel Pro before post-cutover stability is proven.
- Do not mechanically change RLS, SECURITY DEFINER functions, extensions, or indexes based only on advisor warnings.
- Never expose service-role secrets in browser-visible variables.

## Immediate resume instruction

If this conversation disappears now, start a new thread with:

**「Gacha Lens続けて。`docs/COMPANY_INFRA_MIGRATION_PRIORITY.md` と `docs/HANDOFF_LATEST.md` を正本として、Beach Cloudflare完全検証から再開して」**

The assistant must re-fetch live state first. The immediate next action is Step 3: finish Beach Cloudflare validation. No user re-explanation should be required.
