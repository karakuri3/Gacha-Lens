# Monetization

The public product remains a capsule-toy trend and discovery guide. Monetization must not change rankings or forecast scores.

## Current flow

- Marketplace links open the provider search result directly.
- Outbound clicks are recorded in `outbound_clicks` without a redirect page or personal identifier.
- `AMAZON_ASSOCIATE_TAG` is optional. When it is set, Amazon links include the tag and the required disclosure appears in the footer.
- Amazon affiliate links use `rel="sponsored noopener noreferrer"`.
- Rakuten API discovery omits `affiliateId` and keeps its ordinary `itemUrl` and `itemCode` as listing and candidate identity. When `RAKUTEN_AFFILIATE_ID` is configured, a bounded second request enriches the discovery result by exact `itemCode`; only the official affiliate-enabled `itemUrl === affiliateUrl` contract is preserved as separate sanitized provenance. Automatic bounded persistence carries that provenance without changing the durable listing ID. A released variant uses it only when the current listing is linked, active, non-review-required, single-item data from the Rakuten API.
- When no verified API-derived Rakuten affiliate URL exists, the public CTA remains an ordinary, non-affiliate Rakuten search link. An ID alone never rewrites a generic URL.
- Yahoo Shopping discovery likewise keeps the ordinary Item Search v3 `url` and exact item `code` as stable identity. When `YAHOO_AFFILIATE_TRACKING_ID` is configured, one same-query enrichment request may return a ValueCommerce destination; it is joined only by exact item code and stored as separate `yahoo_api` provenance.
- A Yahoo direct sponsored CTA is used only for a released, linked, active, non-review-required single item whose API destination targets the same ordinary Yahoo Shopping item URL. Missing, failed, conflicting, manual, or unsafe provenance falls back to a non-affiliate Yahoo Shopping search.
- The public footer always links to the privacy policy, terms, disclaimer, advertising disclosure, operator information, and contact page.
- Rankings and forecast scores never receive an affiliate-provider or commission input.

## Useful queries

Provider usage for the last 30 days:

```sql
select provider, count(*) as clicks
from outbound_clicks
where clicked_at >= now() - interval '30 days'
group by provider
order by clicks desc;
```

Products that lead to the most marketplace searches:

```sql
select variant_id, count(*) as clicks
from outbound_clicks
where clicked_at >= now() - interval '30 days'
group by variant_id
order by clicks desc
limit 50;
```

## Operating rules

- Keep affiliate status out of ranking and trend calculations.
- Label links by destination and open the real provider URL.
- Do not collect IP addresses, user agents, or account identifiers for click analytics.
- Review provider terms before adding or changing affiliate parameters.

## Public configuration

The following environment variables are code-side integration points. Do not commit real values.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin used by metadata, JSON-LD, robots and sitemap |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Public correction and rights-contact address |
| `GOOGLE_SITE_VERIFICATION` | Google Search Console verification token |
| `NEXT_PUBLIC_GOOGLE_ADSENSE_ACCOUNT` | Optional `google-adsense-account` metadata value |
| `AMAZON_ASSOCIATE_TAG` | Enables Amazon tag attribution and sponsored-link disclosure |
| `RAKUTEN_APPLICATION_ID` | Rakuten Web Service application identifier used by the Item Search API |
| `RAKUTEN_ACCESS_KEY` | Rakuten Web Service access key required with the application identifier |
| `RAKUTEN_AFFILIATE_ID` | Optional Rakuten Affiliate identifier sent to the API; only the API-returned affiliate URL is published as sponsored |
| `RAKUTEN_REQUEST_ORIGIN` | Optional request Origin/Referer override; defaults through `NEXT_PUBLIC_SITE_URL` to `https://gachalens.com` |
| `YAHOO_AFFILIATE_TRACKING_ID` | Optional server-side ValueCommerce tracking value used only for Yahoo Item Search v3 enrichment |

## External launch checklist

Run `npm run launch:check -- --strict --json` before treating the site as ready
for external launch. The audit checks code-side readiness and reports missing
configuration without contacting external services or changing Production.

1. Point the production domain at the deployed Vercel project and set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin.
2. Publish a monitored contact address through `NEXT_PUBLIC_CONTACT_EMAIL`.
3. Add the site to Google Search Console, set `GOOGLE_SITE_VERIFICATION`, deploy, then submit `/sitemap.xml`.
4. Verify `/robots.txt`, representative product canonicals and Product structured data with Google tools.
5. Apply to each affiliate program and add only approved identifiers after reviewing that provider's link requirements.
6. Apply to AdSense only after the public catalog, legal pages, contact route and original editorial content are stable.
7. Review outbound-click totals by provider and product without adding affiliate commission to ranking logic.

## Rakuten activation boundary

- Code readiness does not activate Rakuten Affiliate in Production.
- Configure the real `RAKUTEN_AFFILIATE_ID` only in the approved server-side Production environments after merge approval. Never place it in source, test fixtures, PR comments, or diagnostic artifacts.
- Keep the Web Service Application ID, Access Key, and Affiliate ID as three separate credentials.
- After deployment, observe a natural ingestion run and verify that a real API-derived Rakuten URL is used on one released variant. Do not use a manual ingestion dispatch for activation verification.
- The footer keeps the Rakuten Developers credit visible without implying that Rakuten operates or endorses Gacha Lens.

## Yahoo / ValueCommerce activation boundary

- Code readiness does not activate Yahoo Shopping affiliate links in Production.
- After ValueCommerce account and program review, create the official free-text link, take its referral URL through `&vc_url=`, URL-encode that value exactly as Yahoo documents, and store only that encoded value in `YAHOO_AFFILIATE_TRACKING_ID`.
- Never place the real tracking value in source, test fixtures, PR comments, diagnostics, audit artifacts, or database raw fields. The persisted provider destination may contain provider-issued tracking, but no separate Affiliate ID, Application ID, header, cookie, or API response is stored.
- Automatic bounded workflow Secret wiring, Production environment configuration, and live verification require separate approval after this code PR is reviewed and merged.
- Verify activation through a natural scheduled run: ordinary item identity must stay unchanged and only a genuine API-issued destination may become sponsored.

See [Production Launch Readiness](./launch-readiness.md) for the complete
code-ready versus human-operated checklist.

## AdSense activation gate

- This PR does not load Google AdSense or any other advertising code.
- A consent management platform (CMP) is not implemented in this PR.
- EEA・英国・スイス向けにGoogle広告を有効化する前に、Googleの最新要件を再確認する。
- 必要な地域ではGoogle認定CMPを導入する。
- Verify consent capture, a usable consent-withdrawal path, and disclosure of advertising technology providers.
- Keep AdSense activation disabled in Production until these checks and the public privacy disclosure are complete.
