import { buildMarketplaceLinks } from "@/lib/domain/market-links";
import TrackedMarketLink from "@/components/TrackedMarketLink";

export default function MarketplaceLinks({ item }) {
  const links = item.is_released ? buildMarketplaceLinks(item) : [];
  if (!links.length && !item.official_url) return null;

  return (
    <div className="market-actions" aria-label="販売先を探す">
      {links.map((link) => (
        <TrackedMarketLink key={link.id} link={link} variantId={item.variant_id}>
          {link.label}
          <span aria-hidden="true">↗</span>
        </TrackedMarketLink>
      ))}
      {item.official_url ? (
        <TrackedMarketLink
          className="market-action market-action--official"
          link={{ id: "official", href: item.official_url }}
          variantId={item.variant_id}
        >
          公式商品を見る
          <span aria-hidden="true">↗</span>
        </TrackedMarketLink>
      ) : null}
    </div>
  );
}
