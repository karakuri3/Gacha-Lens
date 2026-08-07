import LegalPage, { LegalSection } from "@/components/LegalPage";
import { buildPageMetadata } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title: "プライバシーポリシー | Gacha Lens",
  description: "Gacha Lensにおける利用情報、投稿情報、外部送信、保存期間などの取り扱いを説明します。",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー" lead="サービス上で扱う情報と、その利用目的を明示します。">
      <LegalSection title="1. 取得する情報">
        <p>当サイトは、閲覧時の一般的なアクセスログ、エラー情報、端末・ブラウザに関する情報を、ホスティング事業者等を通じて取得する場合があります。</p>
        <p>販売先リンクの利用状況を把握するため、商品識別子、販売先、当サイト内のページパスを記録します。当サイトのクリック計測では氏名、メールアドレス等の直接的な個人識別情報を保存しません。</p>
        <p>価格・在庫情報を投稿した場合は、投稿内容、店舗・地域、参照URL、投稿日時等を確認・掲載のために取り扱います。</p>
      </LegalSection>
      <LegalSection title="2. 利用目的">
        <ul>
          <li>商品情報、価格傾向、在庫・再入荷情報の提供と品質改善</li>
          <li>不正利用、重複投稿、障害の検知と対応</li>
          <li>販売先リンクの利用状況の集計とサービス改善</li>
          <li>お問い合わせへの対応</li>
        </ul>
      </LegalSection>
      <LegalSection title="3. 外部サービスとCookie等">
        <p>当サイトは、ホスティング、データベース、アクセス解析、広告、アフィリエイト等の外部サービスを利用する場合があります。各サービスがCookieその他の技術を利用する場合、その取り扱いは各事業者の規約・ポリシーにも従います。</p>
        <p>Google AdSense等の第三者広告サービスを将来有効化した場合、Googleを含む第三者広告ベンダーが、広告配信のためにCookie、web beacon、IPアドレスその他の識別技術を使用する場合があります。Googleは過去のアクセス情報等を利用し、パーソナライズド広告を配信する場合があります。</p>
        <p>利用者は、<a href="https://myadcenter.google.com/" target="_blank" rel="noopener noreferrer">Google広告設定</a>から広告のパーソナライズを管理・無効化できます。Googleによるパートナーサイト利用時のデータ利用は、<a href="https://policies.google.com/technologies/partner-sites?hl=ja" target="_blank" rel="noopener noreferrer">Googleの説明</a>で確認できます。</p>
        <p>現時点でGoogle AdSenseや第三者広告コードを導入していない場合、上記の広告配信技術が当サイトで常時動作していることを示すものではありません。導入時には対象地域の同意要件と本ポリシーを改めて確認します。</p>
        <p>EEA、英国、スイス向けにGoogle広告を有効化する場合は、Googleの最新要件を確認し、必要な地域ではGoogle認定CMPを通じて同意の取得・撤回手段と広告技術プロバイダの情報を提供します。</p>
      </LegalSection>
      <LegalSection title="4. 保存・安全管理">
        <p>取得した情報は利用目的に必要な範囲で保存し、アクセス制限、権限分離、ログ監査等の合理的な安全管理措置を講じます。</p>
      </LegalSection>
      <LegalSection title="5. 開示・削除等">
        <p>ご本人に関する情報の開示、訂正、削除その他のご相談は、お問い合わせ窓口からご連絡ください。法令上対応できない場合を除き、合理的な範囲で対応します。</p>
      </LegalSection>
      <LegalSection title="6. 改定">
        <p>法令、利用サービス、提供機能の変更に応じて本ポリシーを改定することがあります。重要な変更は当サイト上で告知します。</p>
      </LegalSection>
    </LegalPage>
  );
}
