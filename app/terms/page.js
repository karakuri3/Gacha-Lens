import LegalPage, { LegalSection } from "@/components/LegalPage";
import { buildPageMetadata } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title: "利用規約 | Gacha Lens",
  description: "Gacha Lensの利用条件、禁止事項、投稿情報の扱いなどを定めます。",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage title="利用規約" lead="Gacha Lensをご利用いただく際の条件です。">
      <LegalSection title="1. 適用">
        <p>本規約は、Gacha Lensが提供するウェブサイトおよび関連機能の利用に適用されます。利用者は本規約と関連ポリシーに同意したうえで本サービスを利用するものとします。</p>
      </LegalSection>
      <LegalSection title="2. 提供情報">
        <p>掲載する価格、発売、在庫、再入荷、注目度等は、公開情報、外部サービスのデータ、利用者からの報告等を整理した参考情報です。正確性、完全性、最新性、商品の入手可能性を保証するものではありません。</p>
      </LegalSection>
      <LegalSection title="3. 禁止事項">
        <ul>
          <li>法令または公序良俗に反する行為</li>
          <li>虚偽、権利侵害、個人情報を含む投稿</li>
          <li>サービスや第三者のシステムへ過度な負荷を与える行為</li>
          <li>データの不正取得、改変、再販売、アクセス制御の回避</li>
          <li>他の利用者または第三者に不利益を与える行為</li>
        </ul>
      </LegalSection>
      <LegalSection title="4. 投稿情報">
        <p>利用者は、投稿に必要な権利を有し、内容が正確であることを確認して投稿してください。当サイトは品質・安全性確保のため、投稿を審査、非掲載、修正または削除できるものとします。</p>
      </LegalSection>
      <LegalSection title="5. サービスの変更・停止">
        <p>保守、障害、外部サービスの仕様変更その他の事情により、事前通知なく機能の変更または提供停止を行う場合があります。</p>
      </LegalSection>
      <LegalSection title="6. 知的財産権">
        <p>商品名、画像、商標等の権利は各権利者に帰属します。当サイト独自の文章、構成、プログラム等の権利は運営者または正当な権利者に帰属します。</p>
      </LegalSection>
      <LegalSection title="7. 準拠法">
        <p>本規約は日本法に準拠します。本サービスに関する紛争は、法令に従い管轄裁判所を定めます。</p>
      </LegalSection>
    </LegalPage>
  );
}
