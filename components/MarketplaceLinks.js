import { buildMarketplaceLinks } from "@/lib/domain/market-links";

export default function MarketplaceLinks({ item }) {
  const links = buildMarketplaceLinks(item);
  if (!links.length && !item.official_url) return null;

  return (
    <div className="market-actions" aria-label="販売先を探す">
      {links.map((link) => (
        <a key={link.id} className="market-action" href={link.href} target="_blank" rel="noopener noreferrer">
          {link.label}<span aria-hidden="true">↗</span>
        </a>
      ))}
      {item.official_url ? (
        <a className="market-action market-action--official" href={item.official_url} target="_blank" rel="noopener noreferrer">
          公式商品を見る<span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </div>
  );
}
