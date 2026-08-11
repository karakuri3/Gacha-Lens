import Link from "next/link";
import { getAffiliateProviderConfig, hasActiveAffiliateProvider } from "@/lib/domain/affiliate-providers";

export default function Footer() {
  const affiliateConfig = getAffiliateProviderConfig();
  const affiliateEnabled = hasActiveAffiliateProvider(affiliateConfig);
  return (
    <footer className="site-footer">
      <div className="site-shell site-footer__inner">
        <div>
          <strong>Gacha Lens</strong>
          <p>ガチャの新作と話題を追いかける、非公式のトレンドガイド。</p>
        </div>
        <div className="site-footer__links">
          <nav aria-label="サイトメニュー">
            <Link href="/ranking">ランキング</Link>
            <Link href="/schedule">発売予定</Link>
            <Link href="/series">ガチャ一覧</Link>
            <Link href="/guides">ガイド</Link>
            <Link href="/categories">カテゴリ</Link>
            <Link href="/restocks">再販・再入荷</Link>
            <Link href="/stock">在庫情報</Link>
          </nav>
          <nav aria-label="運営・ポリシー">
            <Link href="/operator">運営情報</Link>
            <Link href="/privacy">プライバシー</Link>
            <Link href="/terms">利用規約</Link>
            <Link href="/disclaimer">免責事項</Link>
            <Link href="/affiliate-disclosure">広告について</Link>
            <Link href="/contact">お問い合わせ</Link>
          </nav>
        </div>
        <small>
          当サイトはアフィリエイト広告を利用する場合があります。商品評価やランキングは広告報酬と切り離して決定します。
          {affiliateEnabled && affiliateConfig.amazon.active ? " Amazonのアソシエイトとして、Gacha Lensは適格販売により収入を得ています。" : ""}
        </small>
        <small className="site-footer__provider-credit">
          <a href="https://developers.rakuten.com/" target="_blank" rel="noopener noreferrer">Supported by Rakuten Developers</a>
        </small>
      </div>
    </footer>
  );
}
