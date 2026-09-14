# Gacha Lens Design QA Findings — 2026-09-14

Scope: current live `gachalens.com` structure reviewed before merging `design/product-specific-ui-contract`.

## Findings and decisions

### P0 — Search intent was duplicated
The global header already provides the main catalog search. The home page repeated another large search section with a `DISCOVER` eyebrow and the same search intent.

Decision: keep the global search as the primary search affordance. Replace the duplicate home hero/search with a compact domain navigation for category / upcoming / release month.

### P0 — Empty market modules were rendered as chrome
The home structure could render modules such as high-price or upcoming sections even when their data collection was empty.

Decision: independent market modules render only when they contain evidence. If the core hot-item set itself is empty, show one explicit editorial empty state instead of empty dashboard furniture.

### P0 — Missing evidence was over-promoted
The spotlight used a fixed six-cell metric grid, which could prominently repeat `データ不足` and zero counts. Ranking tiles could likewise use missing evidence as a large value.

Decision: spotlight metrics are now evidence-driven. Market price/change/sold/listing values render only when meaningful. Ranking falls back to retail price and real series/release context instead of treating missing evidence as the main visual value.

### P1 — Stock/circulation language could overstate evidence
The stock rail previously fell back to general hot items and could show `流通あり` when no direct stock/restock signal existed.

Decision: the stock rail now receives only items passing the actual availability-signal predicate. No fallback item is labelled as stock movement without evidence.

### P1 — Generic dashboard grammar
The baseline already had a relatively dense market layout, but ordinary panels still carried dashboard shadow/radius conventions and English editorial labels such as `TODAY'S PICK`.

Decision: use flat collector-market modules, compact rules/radii, real object imagery, Japanese domain copy, and tabular price numerals. Remove decorative English label from the spotlight.

## Remaining gate
This branch is not visually approved until exact branch renders are reviewed for:
- home;
- search/results;
- product detail;
- ranking;
- no-market-evidence;
- missing image;
- long Japanese name;
- loading/error;
- 360px / 390px / desktop.

Production remains unchanged until those states pass.