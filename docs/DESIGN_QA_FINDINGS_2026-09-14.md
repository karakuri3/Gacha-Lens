# Gacha Lens Design QA Findings — 2026-09-14

Scope: current live `gachalens.com` structure reviewed before merging `design/product-specific-ui-contract`, followed by exact non-Production Cloudflare Preview inspection of the design branch.

## Findings and decisions

### P0 — Search intent was duplicated
The global header already provides the main catalog search. The home page repeated another large search section with a `DISCOVER` eyebrow and the same search intent.

Decision: keep the global search as the primary search affordance. Replace the duplicate home hero/search with a compact domain navigation for category / upcoming / release month.

### P0 — Empty market modules were rendered as chrome
The home structure could render modules such as high-price or upcoming sections even when their data collection was empty.

Decision: independent market modules render only when they contain evidence. If the core hot-item set itself is empty, show one explicit editorial empty state instead of empty dashboard furniture.

### P0 — Missing evidence was over-promoted
The spotlight used a fixed six-cell metric grid, which could prominently repeat `データ不足` and zero counts. Ranking tiles and variant-detail KPI boxes could likewise promote unavailable values as if they were useful market evidence.

Decision: spotlight/detail/card metrics are evidence-driven. Market price/change/sold/listing values render only when meaningful. `未取得`, `データ不足`, `算出待ち`, and `0点` are not promoted as collector metrics. Missing states remain explanatory text when the absence itself matters.

### P0 — Variant detail still used KPI-dashboard grammar
The first exact Preview review exposed a remaining product-detail problem: a row of equal KPI boxes could show `定価 / データ不足 / 未取得 / データ不足 / 注目度`, which contradicted the Collector Editorial hierarchy even after the home-page cleanup.

Decision: flatten the variant detail into one collector record. The object identity comes first, followed by actual market evidence and marketplace offers. Missing stock/history states become quiet explanatory copy rather than KPI furniture, and zero-value popularity metrics are suppressed.

### P1 — Stock/circulation language could overstate evidence
The stock rail previously fell back to general hot items and could show `流通あり` when no direct stock/restock signal existed.

Decision: the stock rail now receives only items passing the actual availability-signal predicate. No fallback item is labelled as stock movement without evidence.

### P1 — Generic dashboard grammar
The baseline already had a relatively dense market layout, but ordinary panels still carried dashboard shadow/radius conventions and English editorial labels such as `TODAY'S PICK`.

Decision: use flat collector-market modules, compact rules/radii, real object imagery, Japanese domain copy, and tabular price numerals. Remove decorative English label from the spotlight.

## Exact non-Production Preview evidence

Cloudflare generated an immutable Preview version for the UI-bearing design commit:

- UI-bearing commit: `7fc845328c1655c180c7ab5f16445a978c7074c3`
- Preview version: `a5326460`
- Preview root: `https://a5326460-gacha-lens.senpingxingzuo.workers.dev/`
- environment: non-Production Cloudflare version URL

The current PR head after that UI commit contains only design-contract test maintenance; comparison from `7fc8453` to the later tested head changes `tests/design-contract.test.mjs` only. The immutable Preview is therefore render-equivalent to the current application code.

### Desktop home evidence
The exact Preview home was rendered with live public data. Confirmed:

- global search remains the search entry point; the duplicated home search hero is absent;
- the home starts with collector context and real objects rather than a generic SaaS hero;
- empty market furniture is not rendered merely to preserve a dashboard slot;
- the spotlight/ranking structure uses object and market context rather than repeated missing-value KPI cells.

### Desktop variant-detail evidence
The exact Preview was inspected on a real variant (`伏黒恵`). Confirmed:

- the old equal-weight KPI strip is gone;
- object identity and image lead the page;
- actual market evidence is visible as price/listing evidence;
- marketplace offer actions remain attached to observed evidence;
- insufficient price-history evidence is stated as explanatory text rather than as a fake metric card;
- a direct rendered-tree check finds no `注目度 0点` value;
- missing/zero evidence is no longer visually promoted above verified market information.

## Automated gate evidence
After the final zero-value metric filtering change, the design-contract test was updated to assert the stronger contract instead of the old source-string shape. PR Code Quality run `#381` completed successfully on the resulting head.

Cloudflare runtime-smoke failure is not treated as a design regression here: that gate intentionally compares the PR head against the currently deployed Production runtime, and Production cutover is not authorized by this design PR.

## Remaining gate
This branch remains **not fully visually approved** until exact rendered branch evidence covers:

- search/results;
- ranking beyond the home snapshot;
- no-market-evidence;
- missing image;
- long Japanese name / extreme price;
- loading/error;
- 360px / 390px mobile layouts;
- final desktop regression after the state matrix is complete.

The desktop home and real variant-detail gates above are complete. Production remains unchanged until the remaining state/mobile evidence passes.