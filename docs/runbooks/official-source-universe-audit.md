# Official Source Universe Audit

`official-source-universe-audit` is a manual, read-only contract for proving the finite official Kitan Club / Qualia product universe visible on public first-party pages at an as-of timestamp. It is intentionally separate from the Production collectors, bounded canaries, F0, schema-v6 planner inputs, database writes, provider mutations, deploys, and scheduling.

## Target and proof rules

The initial target is `2026-10+`.

Kitan year archives are discovered dynamically from official navigation on `https://kitan.jp/products/`; the contract never guesses a future year URL. It records the discovered archive range, chooses only exposed target-year-or-newer archives, fully enumerates the target planning year, classifies every target-year product as `before_target`, `target_period`, `undated`, or `rejected`, and records the current-root/archive union and diff. An undated target-year record is a completeness blocker.

Qualia month archives are discovered dynamically from `https://www.qualia-45.jp/product.html`; the contract never probes guessed future months. It traverses every month archive actually exposed by official navigation so historical archive membership can classify root/category products without an unnecessary detail fetch. `archive_month` and `detail_release_month` remain separate evidence fields. A target-period archive membership is sufficient to retain target-period membership when the detail release month is null. Detail fetches are reserved for products with no official month-archive membership; a product with neither archive-month nor detail-month evidence remains `undated` and blocks completeness.

Qualia category classes are discovered from the official root navigation when present. If the root HTML omits numeric category hrefs, the existing reviewed `12..19` site contract is used explicitly as a fallback and the manifest records the reason plus fail-closed conditions. Category pagination supports the site-style route/query forms discovered in public links and is traversed until the discovered page set is exhausted or a cap/fetch failure is reached.

The Qualia `distinations` formal-Lineup archive is not required to prove the product universe. Product-universe completeness and formal-lineup completeness are separate statuses. This audit performs zero lineup requests.

## Request budget

The global hard cap defaults to 150 request attempts. The sanitized manifest records expected and actual request counts separately for:

- Kitan list/root
- Kitan year archives
- Kitan details
- Qualia root
- Qualia all officially exposed month archives
- Qualia category pages
- Qualia details
- Lineup requests (always 0 for this contract)

The audit uses the existing conservative retry boundary (at most one retry), a 15-second timeout, and a 750ms retry delay by default. If full classification would exceed the hard cap, the provider fails closed before the expensive detail phase.

## Sanitized artifact

The artifact contains timestamps, retrieval plane, public source URLs, SHA-256 content identities, counts, canonical product identities/URLs, source membership, release evidence, classification, termination reason, completeness status, and blocking reasons. It does not persist raw HTML, secrets, private API data, cookies, or database credentials.

Every provider manifest includes `database_writes: 0`; the top-level artifact also records `provider_mutations: 0`, `f0_activations: 0`, and `production_integration_enabled: false`.

## Manual execution

```bash
node scripts/official-source-universe-audit.mjs \
  --target-month=2026-10 \
  --global-hard-cap=150 \
  --output-dir=/tmp/gacha-official-source-universe-audit
```

The command is report-only. Do not use it to update schema-v6, set `unsupported_source_universe_known=true`, run Kitan/Qualia canaries, activate F0, change schedules/caps, deploy, or write Production data.


## Undated blocker disposition follow-up

The one-time full universe authorization that produced the preserved Phase 2D artifact is consumed. Do not rerun the full universe audit under that authorization.

The Kitan false product was caused by accepting generic `href` values under `/products/<segment>/`. The blocker-disposition rule now accepts only canonical product-detail anchors, requires exactly one product path segment with no query/hash, and rejects known WordPress pseudo-route segments such as `feed`, `embed`, and `trackback`.

The seven unresolved Qualia IDs remain fail-closed unless official release evidence is observed. Repository fixtures prove the normal official field shape only: a `dt/dd` definition-list field labeled `発売日`, normalized for HTML entities/whitespace and parsed as `YYYY年M月(D日)`. Existing code/fixtures do not establish a release date/month for IDs `1266, 1813, 1814, 1817, 2065, 2068, 2069`, so ID ordering, category-only membership, and absence from month archives must not be used as release inference.

A future HQ-approved targeted diagnostic can inspect exactly these seven canonical URLs and nothing else:

```bash
node scripts/official-source-universe-audit.mjs \
  --mode=qualia-undated-blockers \
  --target-month=2026-10 \
  --global-hard-cap=14 \
  --retrieval-plane=network_capable_read_only \
  --output-dir=/tmp/gacha-qualia-undated-blocker-diagnostic
```

**Do not run that command without a new HQ network approval.** The targeted contract has exactly seven URLs, no root/month/category/lineup discovery, a maximum of one retry, default 750ms pacing, and an absolute 14-attempt cap. It performs zero database writes, provider mutations, F0 activations, and lineup requests.

Its sanitized artifact stores only: source product ID, canonical URL, HTTP outcome, SHA-256 content identity, observed official field labels, sanitized `発売日` value, parsed release date/month, structured `releaseDate` evidence if present, canonical/OG URL signals, a classification candidate, and an exact unresolved reason. Raw HTML, cookies, credentials, secrets, and unsanitized response bodies are not retained.
