# Monetization

The public product remains a capsule-toy trend and discovery guide. Monetization must not change rankings or forecast scores.

## Current flow

- Marketplace links open the provider search result directly.
- Outbound clicks are recorded in `outbound_clicks` without a redirect page or personal identifier.
- `AMAZON_ASSOCIATE_TAG` is optional. When it is set, Amazon links include the tag and the required disclosure appears in the footer.
- Amazon affiliate links use `rel="sponsored noopener noreferrer"`.
- Rakuten and Yahoo links remain ordinary search links until an approved provider-specific affiliate URL integration is configured. An ID alone never rewrites a public URL.
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
| `RAKUTEN_AFFILIATE_ID` | Records provider readiness; public search links remain non-affiliate until reviewed URL support exists |
| `YAHOO_AFFILIATE_TRACKING_ID` | Reserved for a reviewed Yahoo affiliate integration |

## External launch checklist

1. Point the production domain at the deployed Vercel project and set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin.
2. Publish a monitored contact address through `NEXT_PUBLIC_CONTACT_EMAIL`.
3. Add the site to Google Search Console, set `GOOGLE_SITE_VERIFICATION`, deploy, then submit `/sitemap.xml`.
4. Verify `/robots.txt`, representative product canonicals and Product structured data with Google tools.
5. Apply to each affiliate program and add only approved identifiers after reviewing that provider's link requirements.
6. Apply to AdSense only after the public catalog, legal pages, contact route and original editorial content are stable.
7. Review outbound-click totals by provider and product without adding affiliate commission to ranking logic.
