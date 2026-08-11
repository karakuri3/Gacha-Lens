# Production Launch Readiness

`npm run launch:check` is a local, read-only audit for the code and configuration
needed before an external Gacha Lens launch. It does not contact Supabase, Vercel,
Google, affiliate providers, or GitHub.

```bash
npm run launch:check
npm run launch:check -- --json
npm run launch:check -- --strict --json
```

Normal mode reports every check and exits successfully so it remains useful during
development. `--strict` exits nonzero only when a required condition is not ready.
Search Console and AdSense are intentionally review conditions, not automatic
activation conditions.

## Code-ready checks

- A canonical HTTPS production origin is configured through `NEXT_PUBLIC_SITE_URL`.
- A valid public contact address is configured through `NEXT_PUBLIC_CONTACT_EMAIL`.
- Robots point to the canonical sitemap and protect administration and API routes.
- The sitemap keeps its 50,000 URL cap and contains the public guides.
- Public catalog, discovery, legal, contact, and editorial guide routes are present.
- Affiliate configuration stays independent from ranking and forecast logic.
- AdSense remains inactive unless a later, separately reviewed activation is planned.

The audit reports only whether sensitive settings are configured. It never prints
verification tokens, affiliate IDs, API keys, or contact addresses.

## External configuration

These steps remain human-operated and are deliberately not marked complete by the
audit:

1. Connect the production domain to Vercel and set `NEXT_PUBLIC_SITE_URL` to its
   canonical HTTPS origin.
2. Set a monitored `NEXT_PUBLIC_CONTACT_EMAIL` address.
3. Create the Google Search Console property, set `GOOGLE_SITE_VERIFICATION`,
   deploy, and verify ownership.
4. Submit `/sitemap.xml` and inspect representative public URLs in Search Console.
5. Apply to affiliate programs and configure only identifiers and link formats that
   the provider has approved.
6. Keep AdSense and any CMP work as a later, separately approved launch gate.

The audit is evidence for readiness, not proof that a domain, Google property,
sitemap submission, affiliate account, or advertising account has been approved.
