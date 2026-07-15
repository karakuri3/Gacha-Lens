# Current State

Product direction: see `docs/PRODUCT_VISION.md`. The site is a gachapon market intelligence service for quickly finding hot, profitable, scarce, or high-buyback-value items.

更新日: 2026-06-25

このドキュメントは、リポジトリを読み、実装済みの範囲と動作確認済みの範囲を分けて整理したものです。2026-06-25 の仕上げ作業で `db:upsert-all` まで実行し、Supabase への upsert 経路も確認済みです。

## 1. 全体像

Gacha Lens は、ガチャ商品を「シリーズ」ではなく「単品 variant」主役で見せる Next.js アプリです。公開 UI は `/ranking`、`/schedule`、`/series`、`/series/[slug]` を中心に、発売中は価格・単品相場・利益目安・在庫・売れ行き、発売予定は期待値・価格上昇期待・流通の少なさ・狙い目度を見せる構成になっています。

データは `lib/series.js` が集約し、`GACHA_DATA_SOURCE=supabase` かつ Supabase env がある場合は Supabase を優先します。DB が空、未接続、または取得失敗の場合は file/mock に fallback します。

## 2. 技術スタック

- Next.js 16.2.1 / React 19.2.4: `package.json`
- App Router: `app/`
- Supabase JS 2.100.0: `lib/supabase.js`
- Tailwind CSS 4 / global CSS: `app/globals.css`
- ESLint 9: `npm run lint`
- Node 24 前提の運用: `.github/workflows/gacha-ingestion.yml`

Next.js 16 系のルール確認として、実装確認前に `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` を読み、`app/**/page.js` と `layout.js` の App Router 構成を前提に確認しました。

## 3. 確認した主要ファイル

- アプリ UI: `app/page.js`, `app/ranking/page.js`, `app/schedule/page.js`, `app/series/page.js`, `app/series/[slug]/page.js`, `components/Header.js`, `components/SeriesCard.js`
- 管理 UI/API: `app/review/page.js`, `app/review/login/route.js`, `app/review/logout/route.js`, `app/api/import-issues/route.js`, `lib/admin-auth.js`
- データ集約: `lib/series.js`, `lib/data/supabase-gacha-repository.js`, `lib/data/gacha-repository.js`, `lib/data/ingestion-adapters.js`
- ドメインロジック: `lib/domain/market-summary.js`, `lib/domain/trend-summary.js`, `lib/domain/stock-summary.js`, `lib/domain/forecast-score.js`, `lib/domain/public-display.js`, `lib/domain/listing-classifier.js`
- fetcher: `lib/fetchers/official-fetcher.js`, `lib/fetchers/x-fetcher.js`, `lib/fetchers/market-fetcher.js`, `lib/fetchers/stock-fetcher.js`
- upsert/ingestion: `scripts/run-ingestion.mjs`, `scripts/run-official-ingestion.mjs`, `scripts/run-market-ingestion.mjs`, `scripts/run-x-ingestion.mjs`, `scripts/run-stock-ingestion.mjs`, `scripts/upsert-official-data.mjs`, `scripts/upsert-market-data.mjs`, `scripts/upsert-x-reactions.mjs`, `scripts/upsert-stock-data.mjs`
- Supabase: `supabase/schema.sql`, `supabase/functions/ingest/index.ts`, `supabase/cron-ingestion.sql`
- 運用: `.github/workflows/gacha-ingestion.yml`, `docs/supabase-cron-ingestion.md`, `docs/fetchers.md`, `docs/daily-operations-checklist.md`

## 4. 実装済みと確認できたこと

### 公開 UI

- `/ranking` は発売中/発売予定タブを持ち、カード全体が `/series/[slug]` にリンクします。
- `/schedule` は固定月ではなく、発売予定 variant の `schedule_month` から月タブを生成します。
- `/series` は単品一覧として扱われます。
- `/series/[slug]` は発売中と発売予定で表示ブロックを分けています。発売予定側では相場/利益ではなく期待値系のメトリクスを表示します。
- `components/Header.js` のナビは `/ranking`, `/schedule`, `/series` の公開導線のみで、`/review` は出していません。

### データ設計

`supabase/schema.sql` に以下のテーブルがあります。

- `source_weights`
- `series`
- `variants`
- `market_listings`
- `x_reactions`
- `restock_events`
- `stock_reports`
- `import_issues`
- `forecast_snapshots`

`market_listings`, `x_reactions`, `restock_events`, `stock_reports` には `matched_variant_id` があり、remote schema check でも存在確認済みです。

### データ入力

- 静的公式入力: `lib/data/official-input.js`
  - `officialProducts`: 4 件
  - variant 合計: 18 件
- 静的 market raw: `lib/data/market-input.js`
  - `marketListingsRaw`: 8 件
- 静的 X raw: `lib/data/x-input.js`
  - `xReactionsRaw`: 5 件
- 静的 stock/restock raw: `lib/data/stock-input.js`
  - `restockEventsRaw`: 4 件
  - `stockReportsRaw`: 4 件

公式入力と market 入力は Node で直接 import して件数と日本語文字列を確認済みです。`x-input.js` と `stock-input.js` は Next/Bundler 前提の拡張子なし import を含むため、素の Node 直接 import では落ちますが、upsert script 側ではファイルを読み込んで import 行を除去する処理があります。

### fetch / normalize / upsert

- official: `scripts/run-official-ingestion.mjs` が `collect-official-data.mjs` -> `upsert-official-data.mjs` を実行します。
- market: `scripts/run-market-ingestion.mjs` が `collect-market-data.mjs` -> `upsert-market-data.mjs` を実行します。
- x: `scripts/run-x-ingestion.mjs` が `collect-x-reactions.mjs` -> `upsert-x-reactions.mjs` を実行します。
- stock: `lib/ingestion-runner.js` では `run-stock-ingestion.mjs` を実行し、`collect-stock-data.mjs` -> `upsert-stock-data.mjs` の順で処理します。現状の fetcher は承認済み JSON feed (`STOCK_RAW_FEED_URLS`) 専用です。
- all: `scripts/run-ingestion.mjs` は無料運用時に official -> market -> stock の順で実行します。`X_FETCH_ENABLED=true` の場合だけ X を含めます。

### 管理 review

- `/review` は `REVIEW_ADMIN_TOKEN` または `ADMIN_REVIEW_TOKEN` を使う簡易認証つきです。
- `metadata.robots` は noindex/nofollow です。
- `/api/import-issues` は review cookie または token がない場合 401 になります。
- `/api/import-issues?format=csv` で CSV 出力できます。

### 自動実行

- GitHub Actions: `.github/workflows/gacha-ingestion.yml`
  - daily schedule: `10 18 * * *`
  - `npm run db:upsert-all` を実行
  - log artifact を保存
- App API: `app/api/ingest/[task]/route.js`
  - POST: `official`, `market`, `x`, `stock`, `all`
  - `INGEST_CRON_TOKEN` または `REVIEW_ADMIN_TOKEN` で保護
- Supabase Edge Function: `supabase/functions/ingest/index.ts`
  - `CRON_SHARED_SECRET` が設定されている場合、`x-cron-secret` を検証
  - `APP_INGEST_BASE_URL` の `/api/ingest/:task` に転送
- Supabase Cron template: `supabase/cron-ingestion.sql`
  - official: hourly
  - market: every 30-60 minutes
  - x: disabled by default / optional
  - stock: every 30-60 minutes

## 5. 実行して確認した結果

### build

`npm run build`: 成功

確認時の主な出力:

- Next.js 16.2.1
- `Compiled successfully`
- App routes:
  - `/`
  - `/ranking`
  - `/schedule`
  - `/series`
  - `/series/[slug]`
  - `/review`
  - `/api/import-issues`
  - `/api/ingest/[task]`
  - `/supabase-series`

### schema check

`npm run db:check-schema`: 成功

確認済み:

- `market_listings.matched_variant_id`: ok
- `x_reactions.matched_variant_id`: ok
- `restock_events.matched_variant_id`: ok
- `stock_reports.matched_variant_id`: ok

### lint

`npm run lint`: 成功。`components/ProductImage.js` への集約と `next/image` 化により、既存の `<img>` warning は解消済みです。

### typecheck / test

- `npm run typecheck --if-present`: script 未定義のため実質未実行
- `npm run test --if-present`: script 未定義のため実質未実行

## 6. 未確認または注意が必要なこと

### 本番 UI / Vercel

今回の Phase 0 では、Vercel の最新 deployment が main 最新 commit を拾っているかは未確認です。確認には Vercel 側の deployment URL または `vercel`/dashboard 情報が必要です。

### Supabase Edge Function 実行

`supabase functions deploy ingest` 済みという前提はユーザー報告として確認していますが、今回の Phase 0 では Edge Function 経由の `official`, `market`, `x`, `stock`, `all` 実行は再実行していません。DB を変更する可能性があるためです。

### stock/restock の自動取得

stock/restock は `scripts/collect-stock-data.mjs` と `lib/fetchers/stock-fetcher.js` を持ち、`STOCK_RAW_FEED_URLS` から承認済み JSON feed を生成 snapshot に落として upsert できます。無制御な shop/SNS scraping は主系統にしていません。

### market の安全性

`lib/fetchers/market-fetcher.js` は `MARKET_RAW_FEED_SOURCES_JSON` / `MARKET_RAW_FEED_URLS` から承認済み JSON/API/export feed を読む方針です。無制御な marketplace scraping は主系統にしていません。これは安全面では良い状態ですが、相場精度を上げるには信頼できる feed/API/export が必要です。

### `/supabase-series`

`app/supabase-series/page.js` はファイル削除が Windows/OneDrive 側で弾かれたため、現在は `notFound()` で 404 化しています。公開 debug として DB 情報は返しません。

### Node 直 import の注意

`lib/series.js` など Next/Bundler 前提の一部ファイルは、素の Node ESM で直接 import すると拡張子なし import の解決で落ちます。アプリ build は通っています。検証は `npm run build`、アプリ route、または既存 script 経由で行うのが安全です。

## 7. 現在のデータフロー

```text
official fetch/static input
  -> official raw
  -> upsert-official
  -> series / variants / import_issues

market approved raw feed/static input
  -> classify listing
  -> upsert-market
  -> market_listings / import_issues

X API/raw feed/static input
  -> intent classification + variant matching
  -> upsert-x
  -> x_reactions / import_issues

stock/restock approved raw feed/static raw
  -> generated stock raw
  -> normalize + variant matching
  -> upsert-stock
  -> restock_events / stock_reports / import_issues

Supabase/file/mock
  -> lib/series.js
  -> market_summary / trend_summary / availability_summary / forecast_summary
  -> public UI
```

## 8. 公開 UI の表示ルール

`lib/series.js` で発売前 variant には market summary を空にし、相場/利益系を 0 または未取得扱いにしています。

該当箇所:

- `market_summary: variant.released ? marketSummary : {}`
- `profit_estimate: variant.released ? ... : null`
- `listing_count`, `sold_count`, `active_listing_count`: 発売予定は 0
- `price_confidence`: 発売予定は `{ score: 0, label: "未取得", reason: "upcoming" }`

公開 UI 側は `lib/domain/public-display.js` の `buildReleasedCustomerMetrics` と `buildUpcomingCustomerMetrics` に分かれています。内部の source_type、matched keywords、classification reason などは `/review` 側で見る設計です。

## 9. セキュリティと運用の現状

- `/review` は公開ヘッダーに出ていません。
- `/review` は token cookie 認証と noindex があります。
- `/api/import-issues` は認証必須です。
- `/api/ingest/[task]` は server-side token 必須です。
- Edge Function は `CRON_SHARED_SECRET` が設定されている場合だけ cron secret を検証します。未設定の場合は Edge Function 自体の secret 検証はスキップされ、下流の app ingest token に依存します。
- `supabase/config.toml` の function 設定は別途確認対象です。Edge Function を public に置く場合、`CRON_SHARED_SECRET` は必ず設定する前提にしてください。

## 10. 既存ドキュメント

- `docs/supabase-connection.md`: Supabase 接続手順
- `docs/supabase-cron-ingestion.md`: Edge Function / Cron 運用
- `docs/fetchers.md`: official / X / market / stock fetcher 方針
- `docs/ingestion-recommendations.md`: ingestion 推奨方針
- `docs/daily-operations-checklist.md`: 日次運用チェック

## 11. Phase 0 結論

アプリ本体、Supabase schema、ingestion runner、GitHub Actions、Edge Function/Cron template は一通り揃っています。`npm run build` と `npm run db:check-schema` は成功しています。

一方で、実運用で「常にデータが増え、相場とトレンドが強くなる」状態にするには、次の不足があります。

1. stock/restock は fetcher ができたが、安全な feed/API/export 接続待ち。
2. market は安全な feed/API/export 接続待ちで、無制御 scraping は未採用。
3. `/supabase-series` は 404 化済みだが、ファイル削除自体は未完了。
4. typecheck/test script がない。
5. Vercel 本番反映と Edge Function task 実行は今回未確認。
