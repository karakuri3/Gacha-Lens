import LegalPage, { LegalSection } from "@/components/LegalPage";
import { buildPageMetadata } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title: "免責事項 | Gacha Lens",
  description: "Gacha Lensが掲載する価格、発売予定、在庫、予測情報等に関する免責事項です。",
  path: "/disclaimer",
});

export default function DisclaimerPage() {
  return (
    <LegalPage title="免責事項" lead="掲載情報は購入・売却を保証するものではありません。">
      <LegalSection title="参考情報としての提供">
        <p>価格、出品・成約件数、在庫、再入荷、発売予定、ランキング、予測スコア等は、取得時点のデータに基づく参考情報です。市場価格や在庫は常に変動し、取得遅延や誤分類が生じる場合があります。</p>
      </LegalSection>
      <LegalSection title="取引・購入の判断">
        <p>当サイトは商品の販売者、買取業者、投資助言業者ではありません。購入、売却、応募、来店その他の判断は、公式情報と販売先の表示を確認し、利用者ご自身の責任で行ってください。</p>
      </LegalSection>
      <LegalSection title="発売前予測">
        <p>発売前の期待度や注目度は、公開情報等から算出した予測であり、将来の価格、人気、希少性、入手難度を保証しません。発売前商品には成約相場や利益情報を表示しない方針です。</p>
      </LegalSection>
      <LegalSection title="外部サイト">
        <p>外部サイトの内容、在庫、価格、取引、安全性について当サイトは保証しません。外部サイトの利用条件とプライバシーポリシーをご確認ください。</p>
      </LegalSection>
      <LegalSection title="権利関係">
        <p>Gacha Lensは非公式の情報サービスです。各メーカー、作品、販売事業者その他の権利者とは、明示がある場合を除き提携・承認関係にありません。</p>
      </LegalSection>
    </LegalPage>
  );
}
