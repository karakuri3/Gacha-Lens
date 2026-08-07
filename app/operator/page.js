import Link from "next/link";
import LegalPage, { LegalSection } from "@/components/LegalPage";
import { buildPageMetadata } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title: "運営情報 | Gacha Lens",
  description: "Gacha Lensの運営方針、情報源、訂正方針、お問い合わせ窓口をご案内します。",
  path: "/operator",
});

export default function OperatorPage() {
  return (
    <LegalPage title="運営情報" lead="ガチャの情報を、探しやすく比較しやすい形で届けます。">
      <LegalSection title="サービス">
        <dl className="legal-facts">
          <div><dt>サービス名</dt><dd>Gacha Lens</dd></div>
          <div><dt>運営</dt><dd>Gacha Lens 運営事務局</dd></div>
          <div><dt>提供内容</dt><dd>ガチャの発売、価格動向、在庫・再入荷、トレンド情報</dd></div>
        </dl>
      </LegalSection>
      <LegalSection title="編集・掲載方針">
        <p>公式情報を商品マスタの基準とし、市場情報や利用者報告は商品・単品との対応を確認して掲載します。分類できない情報や根拠が不足する情報は、公開情報へ無理に混ぜず確認対象として扱います。</p>
      </LegalSection>
      <LegalSection title="訂正方針">
        <p>誤った商品情報、価格分類、画像、在庫情報等を確認した場合は、根拠を確認したうえで訂正します。修正依頼は<Link href="/contact">お問い合わせ</Link>からお送りください。</p>
      </LegalSection>
      <LegalSection title="非公式サービス">
        <p>当サイトは各メーカー、作品、販売事業者の公式サイトではありません。公式発表は各権利者の公式ページでご確認ください。</p>
      </LegalSection>
    </LegalPage>
  );
}
