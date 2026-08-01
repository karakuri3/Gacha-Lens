# Market source reliability

## Audit artifact diagnostics

Schema version 1 remains unchanged. New manual dry-run artifacts optionally include
`request_diagnostics` with aggregate, provider, query, and per-attempt diagnostics.
Artifacts created before Phase 6-A.1 remain valid when this field is absent.

Only provider identity, a sanitized search query, query index, HTTP status,
retry/timeout/rate-limit state, duration, and allowlisted failure categories are
stored. API URLs, endpoint query strings, credentials, headers, cookies, seller
data, environment values, and raw response bodies are never stored.

The aggregate is derived from provider query diagnostics and validated again when
an artifact is created or read. A no-retry run with zero retry counters is normal.
Reviewers can validate the JSON without job logs by comparing provider totals with
the aggregate and inspecting each query's attempts, delays, and final state.

Run `30697724263` demonstrated the previous gap: ten requests succeeded and the
aggregate appeared in job logs, but query diagnostics were absent from its
artifact. Phase 6-A.1 closes that verification gap without authorizing the
historical run for a canary write.

楽天市場APIとYahoo!ショッピングAPIは、同じ境界の再試行・重複排除・診断を使用します。公開商品レコード、candidate key、分類器、タイトル安全判定は変更しません。

## Request policy

- 既定の最大試行回数は3回です。
- 既定の再試行間隔は500msから始まり、指数バックオフと小さなjitterを適用します。
- 待機は最大5,000msです。
- `Retry-After`は秒数とHTTP-dateを解釈し、最大待機時間以内で尊重します。
- 再試行対象はnetwork/DNS/connection、timeout、HTTP `408`, `425`, `429`, `500`, `502`, `503`, `504`だけです。
- HTTP `400`, `401`, `403`, `404`, `409`, `422`、invalid JSON、設定・認証・安全判定エラーは再試行しません。
- 一部queryだけ成功した場合は成功レコードを保持します。設定済みplanner API requestが全件失敗した場合はaudit/write前に停止します。

## Configuration

```text
MARKET_API_MAX_ATTEMPTS=3
MARKET_API_RETRY_BASE_DELAY_MS=500
MARKET_API_RETRY_MAX_DELAY_MS=5000
```

`MARKET_API_MAX_ATTEMPTS`は1〜3、base delayは0〜5,000msに制限されます。provider固有timeoutは従来の`RAKUTEN_REQUEST_TIMEOUT_MS`と`YAHOO_SHOPPING_REQUEST_TIMEOUT_MS`を使用します。

## Query deduplication

QueryはNFKC、trim、連続空白の圧縮、lowercase化を行い、同じvariant IDとseries IDの組み合わせで重複排除します。最初のqueryと順序を保持し、providerのquery上限は重複排除後に適用します。別variantまたは別seriesの正式queryは統合しません。

## Monitoring

各requestには次のsanitized diagnosticsを残します。

```text
attempt_count
retry_count
retried
recovered_after_retry
failure_category
final_status
timed_out
rate_limited
duration_ms
retry_delays_ms
```

Run単位では次を集計します。

```text
requests_retried
retry_attempts_total
transient_failures_recovered
requests_timed_out
requests_rate_limited
requests_permanently_failed
duplicate_queries_skipped
```

Diagnosticsにはcredential、query付き完全URL、seller情報、raw response bodyを含めません。認証エラー増加はcredentialをログへ出さずに設定を確認し、`429`増加時はprovider quotaと実行頻度を確認してください。

## Failure response

1. `transient_failures_recovered`が増えた場合はprovider障害を監視し、成功データはそのまま利用します。
2. `requests_rate_limited`が増えた場合はquery数・実行頻度を下げます。
3. `requests_permanently_failed`が認証系statusで増えた場合はsecret設定を確認します。
4. 全planner API request失敗時はaudit artifactやProduction writeへ進めません。原因を解消後、別の明示承認で新しいmanual dry-runを行います。

Production workflowの状態、手動audit workflowの承認境界、canary writeのfail-closed要件は変更しません。
