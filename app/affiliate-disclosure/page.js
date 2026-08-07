import LegalPage, { LegalSection } from "@/components/LegalPage";
import { buildPageMetadata } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title: "広告・アフィリエイトについて | Gacha Lens",
  description: "Gacha Lensの広告掲載、アフィリエイトリンク、ランキングの独立性について説明します。",
  path: "/affiliate-disclosure",
});

export default function AffiliateDisclosurePage() {
  return (
    <LegalPage title="広告・アフィリエイトについて" lead="広告の有無と商品評価を分離して運営します。">
      <LegalSection title="アフィリエイト広告">
        <p>当サイトは、商品検索や販売先へのリンクにアフィリエイト広告を利用する場合があります。リンクを経由した購入等により、当サイトが紹介料を受け取ることがあります。利用者の購入価格が当サイトへの紹介料を理由に上乗せされるものではありません。</p>
      </LegalSection>
      <LegalSection title="ランキングと予測の独立性">
        <p>ランキング、注目度、価格情報、発売前予測は、アフィリエイト報酬の有無や料率を評価要素に含めません。広告契約のない販売先も、利用者の比較に役立つ場合は同じ基準で掲載します。</p>
      </LegalSection>
      <LegalSection title="販売先リンク">
        <p>各販売先の価格、在庫、送料、ポイント、取引条件はリンク先でご確認ください。当サイトの表示とリンク先の情報が異なる場合は、リンク先の最新表示が優先されます。</p>
      </LegalSection>
      <LegalSection title="Amazonアソシエイト">
        <p>Amazonアソシエイト・プログラムを有効にした場合、Gacha LensはAmazonのアソシエイトとして適格販売により収入を得ます。</p>
      </LegalSection>
    </LegalPage>
  );
}
