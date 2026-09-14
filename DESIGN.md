# Gacha Lens — Design Contract

Status: canonical UI/UX contract for new design work. Production changes require visual QA before merge.

## Primary job
Help a user identify a physical capsule-toy item, understand its current market situation, and decide whether to buy, wait, or keep watching.

## Product personality
Collector / Editorial / Data-rich / Precise / Playful-with-restraint.

Not: generic SaaS, crypto dashboard, neon tech, luxury marketplace, toy-store chaos.

## Three art directions considered

### A — Market Terminal
Dense price tables, sharp grid, highly utilitarian. Strong for experts, weaker for casual discovery.

### B — Collector Editorial — SELECTED
Object-first photography, magazine-like hierarchy, strong price typography, compact market evidence, series context. Familiar commerce/market patterns with a distinctive capsule-collector rhythm.

### C — Capsule Pop
More expressive capsule-derived geometry and color. Strong identity, but too easy to become decorative and childish.

Selected direction: **B — Collector Editorial**, borrowing the scan efficiency of A and only subtle visual cues from C.

## Product signatures
The UI should remain recognizably Gacha Lens without the logo because of at least these signatures:
1. product image and object identity dominate before generic feature chrome;
2. price / retail price / movement / evidence are treated as a compact market-reading system;
3. series and collection relationships are visible as part of the browsing language;
4. ranking and circulation information read like collector intelligence, not dashboard KPI cards.

## Primary hierarchy
For item/detail contexts:
`Object image > Item name > Current market evidence > Retail price > Change > Listing/circulation evidence > Series context > Secondary metadata`

For discovery:
`Search intent > Object/ranking results > Price/status evidence > Filters > Editorial/supporting content`

## Visual principles
- Object first. Do not lead app pages with generic marketing heroes.
- Prefer editorial grouping, rows, separators and image/number rhythm over card-per-section composition.
- Cards are allowed for a single meaningful object or a genuinely independent module; they are not page separators.
- Price and percentage values use tabular numerals.
- Use compact information density. Empty space must serve hierarchy, not imitate a premium SaaS landing page.
- One restrained red accent may express movement/action; neutral ink and rules carry the structure.
- Capsule references should be abstract: circular crop logic, machine-label-like numeric treatment, series markers, collection state. Do not decorate every surface with capsule illustrations.

## Tokens
### Type roles
- display/object title: 28–36px, heavy, compact line-height
- market primary: 24–32px, heavy, tabular numerals
- section title: 15–18px, bold
- body: 14–16px
- metadata: 11–13px

### Spacing
`4 / 8 / 12 / 16 / 24 / 32 / 48`

### Radius
- data/image micro-surface: 3–5px
- input/control: 6–8px
- independent object/module: 8–10px
- overlay/dialog only: 14–18px

No universal rounded-xl/2xl styling.

### Elevation
Flat by default. Ordinary modules use borders/separators, not shadows. Shadows are reserved for overlays.

## Component rules
### Home
- Search is a functional discovery tool, not a hero CTA.
- Spotlight must read as one real item with real market evidence.
- Rankings should emphasize image + item + value; not five identical feature cards.
- Right rail may group independent streams but should not become KPI-card chrome.

### Product detail
- Product image and market evidence are the visual anchor.
- Do not insert generic benefit copy between object identity and price evidence.
- Market chart appears because the data exists, never as decorative finance theater.

### Status / chips
Badges are allowed only for real status, rank, category, stock/circulation state, or evidence quality. Decorative badges are forbidden.

### Icons
Use one icon family. Text labels win whenever an icon would be ambiguous.

## Copy
Use natural Japanese and actual domain language. Avoid generic English SaaS slogans and placeholder claims.

## State matrix
Every redesigned core screen must be reviewed with:
- normal data;
- no market evidence;
- missing image;
- very long Japanese item/series name;
- high/low price extremes;
- empty ranking/list;
- loading;
- error;
- narrow mobile.

## AI-template rejection
Fail review when several appear without a domain reason:
- generic centered hero;
- feature-card rows;
- KPI cards detached from shopping/collector decisions;
- excessive pills/badges;
- generic purple/blue gradient;
- glow/glassmorphism;
- every section boxed in the same rounded white card;
- icons added for decoration;
- fake market data or fake charts.

## Visual QA / Definition of Done
Before merge of visual work:
1. render/search-test at mobile and desktop widths;
2. use real Japanese Gacha Lens data, not dummy names/prices;
3. verify normal/empty/loading/error/long-text states;
4. grayscale hierarchy check;
5. logo-removal identity check: at least 3 Gacha Lens signatures remain;
6. screenshot compare against the approved visual baseline;
7. accessibility: visible focus, target size, contrast and no color-only state;
8. no unintentional visual diff.

## Agent instruction
Read this file before changing UI. Treat it as a hard product contract. Do not redesign Gacha Lens from generic SaaS conventions. Preserve object-first hierarchy and real market evidence. Do not add decoration merely to create polish. Any visual change must be justified by collector discovery, price interpretation, or interaction clarity.