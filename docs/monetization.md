# Monetization

The public product remains a capsule-toy trend and discovery guide. Monetization must not change rankings or forecast scores.

## Current flow

- Marketplace links open the provider search result directly.
- Outbound clicks are recorded in `outbound_clicks` without a redirect page or personal identifier.
- `AMAZON_ASSOCIATE_TAG` is optional. When it is set, Amazon links include the tag and the required disclosure appears in the footer.
- Rakuten links remain ordinary search links until an approved affiliate integration is configured.

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
