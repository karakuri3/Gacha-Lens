# Ingestion recommendations

These are the recommended first production values for the high-frequency ingestion phase. The goal is to move toward always-on collection without weakening variant-first review safety.

## Official source recommendation

Use these first:

```bash
OFFICIAL_SOURCE_URLS=https://gashapon.jp/schedule/
OFFICIAL_DETAIL_FETCH_LIMIT=20
OFFICIAL_DETAIL_FETCH_DELAY_MS=150
OFFICIAL_STRICT_DETAIL_REVIEW=false
```

Decision:

- Primary: `https://gashapon.jp/schedule/`
- Secondary later: detail URLs discovered from the schedule page

Why:

- The schedule page is the most natural official master source because it exposes release timing by week.
- The current fetcher can parse schedule cards and then follow linked product detail pages to generate variant names and images.
- Detail following is capped by `OFFICIAL_DETAIL_FETCH_LIMIT`, so high-frequency cron jobs stay predictable.
- Detail requests are lightly delayed with `OFFICIAL_DETAIL_FETCH_DELAY_MS` to avoid bursty polling.

## X source recommendation

Use `X_SEARCH_QUERIES` as the primary method.

```bash
X_SEARCH_QUERIES="ガシャポン OR gashapon OR ガチャガチャ"
X_MONITOR_ACCOUNTS=
X_SEARCH_MAX_RESULTS=25
```

Decision:

- Primary: `X_SEARCH_QUERIES`
- Secondary later: `X_MONITOR_ACCOUNTS`

Why:

- Forecast scoring needs intent phrases such as "全部欲しい", "回したい", "○○だけ欲しい", "ドール小物に使える", and "ミニチュア".
- Account monitoring is cleaner, but it mostly captures announcements. Search captures demand and compatibility signals.
- Keep the first query broad but still domain-specific. After one week, narrow it by official product names if `unknown_variant` grows too quickly.

Later, add trusted accounts only after confirming handles manually:

```bash
X_MONITOR_ACCOUNTS=gashapon_official
```

## Cron recommendation

Use four Supabase Cron jobs:

```text
official: 7 * * * *
market:   */15 * * * *
x:        */10 * * * *
stock:    5,20,35,50 * * * *
```

Decision:

- Keep official hourly. Official pages do not need minute-level pressure.
- Keep X every 10 minutes because reaction windows move faster.
- Keep market and stock at 15 minutes, but market remains upsert-only until an approved source is selected.
- Stagger stock at minute 5/20/35/50 to avoid every job starting at exactly the same minute.

## Final environment names

Set these on the Next app:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GACHA_DATA_SOURCE=supabase
INGEST_CRON_TOKEN=
REVIEW_ADMIN_TOKEN=
OFFICIAL_SOURCE_URLS=https://gashapon.jp/schedule/
OFFICIAL_DETAIL_FETCH_LIMIT=20
OFFICIAL_DETAIL_FETCH_DELAY_MS=150
OFFICIAL_STRICT_DETAIL_REVIEW=false
X_BEARER_TOKEN=
X_SEARCH_QUERIES="ガシャポン OR gashapon OR ガチャガチャ"
X_MONITOR_ACCOUNTS=
X_RAW_FEED_URLS=
X_SEARCH_MAX_RESULTS=25
MARKET_RAW_FEED_URLS=
```

Set these on the Supabase Edge Function:

```bash
APP_INGEST_BASE_URL=
INGEST_CRON_TOKEN=
CRON_SHARED_SECRET=
```

Set these on GitHub Actions:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Values the operator must still decide

- Actual deployed app URL for `APP_INGEST_BASE_URL`.
- Random secret values for `INGEST_CRON_TOKEN`, `REVIEW_ADMIN_TOKEN`, and `CRON_SHARED_SECRET`.
- Whether X API access is available. If not, use `X_RAW_FEED_URLS` with an approved internal JSON feed instead of `X_BEARER_TOKEN`.
- Whether to add monitored X accounts after the first week.
- Which safe market source to use later: approved API, manual export, or reviewed JSON feed.
