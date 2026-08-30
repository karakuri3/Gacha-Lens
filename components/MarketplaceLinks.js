import { buildMarketplaceLinks, hasAffiliateMarketplaceLinks } from "@/lib/domain/market-links";
import { buildObservedListingLinks } from "@/lib/domain/market-observed-listings";
import TrackedMarketLink from "@/components/TrackedMarketLink";

export default function MarketplaceLinks({ item }) {
  const observed = item.is_released ? buildObservedListingLinks(item, { limit: 5 }) : [];
  const links = item.is_released ? buildMarketplaceLinks(item) : [];
  if (!observed.length && !links.length && !item.official_url) return null;
  const hasAffiliate = hasAffiliateMarketplaceLinks(observed, links);

  return (
    <div className="marketplace-panel">
      {observed.length ? (
        <>
          <div className="marketplace-panel__head">
            <strong>確認できた出品</strong>
            <span>取得時点の価格。送料・在庫・販売状況はリンク先で確認</span>
          </div>
          <div className="market-actions" aria-label="確認できた出品">
            {observed.map((offer) => (
              <TrackedMarketLink key={offer.key} link={offer} variantId={item.variant_id}>
                <span>
                  {offer.marketplaceLabel}
                  {offer.storefrontLabel ? ` / ${offer.storefrontLabel}` : ""}
                </span>
                <strong>{offer.price.toLocaleString("ja-JP")}円 ↗</strong>
              </TrackedMarketLink>
            ))}
          </div>
        </>
      ) : null}

      {links.length ? (
        <>
          <div className="marketplace-panel__head">
            <strong>{observed.length ? "ほかの販売先も探す" : "販売先を比較"}</strong>
            <span>検索結果の価格・送料・在庫はリンク先で確認</span>
          </div>
          <div className="market-actions" aria-label="販売先を比較">
            {links.map((link) => (
              <TrackedMarketLink key={link.id} link={link} variantId={item.variant_id}>
                {link.label}
                <span aria-hidden="true">↗</span>
              </TrackedMarketLink>
            ))}
          </div>
        </>
      ) : null}

      {item.official_url ? (
        <div className="market-actions">
          <TrackedMarketLink
            className="market-action market-action--official"
            link={{ id: "official", href: item.official_url }}
            variantId={item.variant_id}
          >
            公式商品を見る
            <span aria-hidden="true">↗</span>
          </TrackedMarketLink>
        </div>
      ) : null}

      {hasAffiliate ? (
        <small className="marketplace-panel__disclosure">広告リンクを含みます</small>
      ) : null}
    </div>
  );
}
