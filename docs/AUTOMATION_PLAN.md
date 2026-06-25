# Automation Plan

更新日: 2026-06-25

この計画は、現在の UI と Supabase 接続を壊さず、実運用に耐える自動収集へ段階的に近づけるための優先順位です。Phase 0 ではコード変更を入れず、次に着手すべき作業を安全順に整理します。

## 1. 基本方針

- 単品 variant 主役を維持する。
- 公式 master を最優先し、market / X / stock は公式 master に紐付ける。
- 発売予定に相場/利益を出さない。
- 不明・曖昧なものは `unknown` / `review_required` / `import_issues` に逃がす。
- 市場データは無制御 scraping ではなく、承認済み API/feed/export から始める。
- `/review` は管理用のまま公開導線に出さない。

## 2. 現在の自動化資産

### GitHub Actions

ファイル: `.github/workflows/gacha-ingestion.yml`

- 日次で `npm run db:upsert-all`
- manual dispatch 可能
- ingestion log artifact 保存

役割: 保険・日次復旧・ログ比較。

### App ingestion endpoint

ファイル: `app/api/ingest/[task]/route.js`

- `POST /api/ingest/official`
- `POST /api/ingest/market`
- `POST /api/ingest/x`
- `POST /api/ingest/stock`
- `POST /api/ingest/all`

認証: `INGEST_CRON_TOKEN` または `REVIEW_ADMIN_TOKEN`

役割: Edge Function / 管理実行の入口。

### Supabase Edge Function

ファイル: `supabase/functions/ingest/index.ts`

- `CRON_SHARED_SECRET` で Edge Function 呼び出し元を検証
- `INGEST_CRON_TOKEN` で Next app の `/api/ingest/:task` に転送

役割: Supabase Cron から呼ぶ主系統。

### Supabase Cron template

ファイル: `supabase/cron-ingestion.sql`

- official: `7 * * * *`
- market: `*/15 * * * *`
- x: `*/10 * * * *`
- stock: `5,20,35,50 * * * *`

役割: 高頻度実行設定の SQL template。

## 3. 優先度つき次フェーズ

### P0: 本番反映と保護の最終確認

目的: 「作ったが動いていない」を避ける。

作業:

1. Vercel の最新 deployment が main 最新 commit を拾っているか確認。
2. 本番 env に以下が入っているか確認。
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GACHA_DATA_SOURCE=supabase`
   - `INGEST_CRON_TOKEN`
   - `REVIEW_ADMIN_TOKEN`
3. Supabase Edge Function secrets を確認。
   - `APP_INGEST_BASE_URL`
   - `INGEST_CRON_TOKEN`
   - `CRON_SHARED_SECRET`
4. `CRON_SHARED_SECRET` が未設定の状態で Cron を始めない。
5. `/supabase-series` を削除、または管理/debug 用へ移動。

完了条件:

- 本番 `/ranking`, `/schedule`, `/series`, `/series/[slug]` が 200。
- `/review` は token なしで内容を見られない。
- `/api/import-issues` は token なしで 401。

### P1: Edge Function task の実行確認

目的: Supabase Cron 登録前に個別 task が成功することを確認する。

作業:

1. Edge Function 経由で `official` 実行。
2. Edge Function 経由で `x` 実行。
3. Edge Function 経由で `market` 実行。
4. Edge Function 経由で `stock` 実行。
5. 最後に `all` 実行。
6. 実行後に `/review` と `/api/import-issues?format=csv` を確認。

完了条件:

- task ごとの HTTP status が 200。
- 失敗時は `failedStep` と `errorOutput` が読める。
- DB に `series`, `variants`, `market_listings`, `x_reactions`, `restock_events`, `stock_reports`, `import_issues` が意図通り入る。

### P2: Supabase Cron 本登録

目的: GitHub Actions ではなく Supabase Cron を主系統にする。

作業:

1. `supabase/cron-ingestion.sql` の `<PASTE_CRON_SHARED_SECRET_HERE>` を本番値に置換して Supabase SQL editor で実行。
2. Cron run history を確認。
3. Edge Function logs を確認。
4. GitHub Actions は日次保険として残す。

推奨 job:

- official: hourly
- market: every 15 minutes
- x: every 10 minutes
- stock: every 15 minutes

完了条件:

- Cron が各 job を予定通り呼ぶ。
- Edge Function が Next app に転送できる。
- `/review` に unknown/review_required が蓄積される。

### P3: official fetcher の安定化

目的: 単品 master を公式由来で安定更新する。

対象:

- `lib/fetchers/official-fetcher.js`
- `scripts/collect-official-data.mjs`
- `scripts/upsert-official-data.mjs`

作業:

1. `OFFICIAL_SOURCE_URLS=https://gashapon.jp/schedule/` を主入力にする。
2. detail fetch limit と delay を適切に設定。
3. schedule-only record が大量に review を汚さないか確認。
4. official product detail から variant 画像、価格、発売月、発売週、公式 URL が取れているか確認。

完了条件:

- 公式 raw から `series` と `variants` が生成される。
- `import_issues` は「本当に人間確認が必要なもの」に絞られる。
- 公式 master なしで market/X/stock が先に走っても誤分類しない。

### P4: X fetcher の実運用化

目的: 発売予定スコアとトレンド検知を早くする。

対象:

- `lib/fetchers/x-fetcher.js`
- `scripts/collect-x-reactions.mjs`
- `scripts/upsert-x-reactions.mjs`
- `lib/domain/forecast-score.js`
- `lib/domain/trend-summary.js`

推奨:

- 最初は `X_SEARCH_QUERIES` 優先。
- `X_MONITOR_ACCOUNTS` は公式/店舗アカウントが固まってから追加。

理由:

- forecast には公式告知だけでなく、一般ユーザーの「欲しい」「回したい」「全部欲しい」「ミニチュアに使える」反応が必要。
- 監視アカウントだけでは購買意欲の文脈が狭くなる。

完了条件:

- `x_reactions.intent_tags` が forecast に反映される。
- variant 未特定は `import_issues` に落ちる。
- 公開 UI には intent の細かい内訳を出さず、期待値/狙い目度に反映される。

### P5: market data の安全接続

目的: 相場と利益目安を実用水準にする。

対象:

- `lib/fetchers/market-fetcher.js`
- `scripts/collect-market-data.mjs`
- `scripts/upsert-market-data.mjs`
- `lib/domain/listing-classifier.js`
- `lib/domain/market-summary.js`

方針:

- `MARKET_RAW_FEED_URLS` に承認済み JSON/API/export を入れる。
- marketplace の HTML scraping を主系統にしない。
- `single`, `rare_or_secret`, `full_set`, `partial_set`, `unknown` の分類を守る。
- セットと単品を混ぜない。

完了条件:

- 発売中 variant の `market_summary.single`, `complete_set`, `rare_single`, `secret_single`, `partial_set`, `popular_set` が更新される。
- `listing_count`, `sold_count`, `active_listing_count`, `last_observed_at`, `price_confidence` が公開 UI の判断材料になる。
- 発売予定 variant には相場/利益が出ない。

### P6: stock/restock feed 接続の強化

目的: 在庫・再入荷シグナルを実データで増やす。

現状:

- `scripts/collect-stock-data.mjs` は存在。
- `lib/fetchers/stock-fetcher.js` は存在。
- `scripts/run-stock-ingestion.mjs` が `collect-stock-data.mjs` -> `upsert-stock-data.mjs` を実行する。
- `restock_events` / `stock_reports` への保存経路はある。

作業:

1. `STOCK_RAW_FEED_URLS` に公式/店舗 X feed/API/export など、利用許可が明確な入力元を追加する。
2. feed の形が揺れる場合は `lib/fetchers/stock-fetcher.js` の `normalizeContainer` を拡張する。
3. review_required の増え方を見て variant alias を補強する。

完了条件:

- `availability_summary` が DB 由来で継続更新される。
- 在庫あり、残り少ない、売り切れ、再入荷、補充が分類される。
- 曖昧な報告は `import_issues` に逃がす。

### P7: 品質と保守性

作業:

1. `next/image` 化済みの画像表示を本番画像 URL で継続確認する。
2. `typecheck` script を追加。
3. 最小テストを追加。
   - market classifier
   - forecast score
   - release upcoming に相場/利益を出さない制御
   - import issue grouping
4. `/supabase-series` を削除または管理 route 化。
5. README をプロジェクト用に更新。

完了条件:

- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run db:check-schema`

が全て意味のある確認になる。

## 4. 最初に着手すべき作業

次の実装フェーズで最初にやるべきことは、P0 と P1 です。

具体的には:

1. `/supabase-series` の扱いを決める。
2. Vercel 本番 URL で公開 UI と `/review` 保護を確認する。
3. Edge Function 経由で `official`, `x`, `market`, `stock`, `all` を個別確認する。
4. 成功後に Supabase Cron を本登録する。

これが終わると、「半自動で常に回る」状態の土台が固まります。その後、相場精度を上げるなら P5、在庫/再入荷を強くするなら P6 に進むのが安全です。

## 5. 完璧なサイトに近づけるために残るもの

### データ面

- 安全に使える market feed/API/export
- X API の安定運用枠
- stock/restock の許諾済み入力元
- 公式 detail の取得率向上
- unknown/review_required を日次で減らす運用

### UI面

- 取得元や分類理由は `/review` に閉じ、公開 UI は価格・相場・利益・在庫・売れ行き・期待値にさらに絞る。
- データ不足時の表示を「未取得」「データ不足」で統一する。
- スマホ幅でカード密度を定期確認する。

### 運用面

- Cron run history と Edge Function logs の日次確認
- GitHub Actions fallback の週次確認
- `db:check-schema` の定期実行
- `/api/import-issues?format=csv` の review archive

## 6. 手作業で最後に必要なもの

Secrets の実値は repo に入れない。

必要な入力:

- Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GACHA_DATA_SOURCE=supabase`
  - `INGEST_CRON_TOKEN`
  - `REVIEW_ADMIN_TOKEN`
  - official / X / market 関連 env
- Supabase Edge Function:
  - `APP_INGEST_BASE_URL`
  - `INGEST_CRON_TOKEN`
  - `CRON_SHARED_SECRET`
- Supabase SQL:
  - `supabase/cron-ingestion.sql` の `<PASTE_CRON_SHARED_SECRET_HERE>`
- X:
  - `X_BEARER_TOKEN`
  - `X_SEARCH_QUERIES`
  - 必要なら `X_MONITOR_ACCOUNTS`
- Market:
  - `MARKET_RAW_FEED_URLS`

## 7. 完了判定

この計画の P0 から P2 が終わると、実運用としては「常に回る状態」に近づきます。

P3 から P6 が安定すると、サイト価値の中心である「今出回っている商品」「相場」「発売予定の期待値」「トレンド検知」が実データで更新される状態になります。
