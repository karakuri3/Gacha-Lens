import LegalPage, { LegalSection } from "@/components/LegalPage";
import { buildPageMetadata } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title: "お問い合わせ | Gacha Lens",
  description: "Gacha Lensへの掲載情報の訂正、権利関係、広告・運営に関するお問い合わせ窓口です。",
  path: "/contact",
});

export default function ContactPage() {
  const email = publicContactEmail();
  return (
    <LegalPage title="お問い合わせ" lead="掲載情報の訂正や権利関係のご連絡を受け付けています。">
      <LegalSection title="お問い合わせ窓口">
        {email ? (
          <p><a className="button-link" href={`mailto:${email}`}>{email}</a></p>
        ) : (
          <p>お問い合わせ窓口を準備中です。公開前に運営者が連絡先を設定します。</p>
        )}
      </LegalSection>
      <LegalSection title="ご連絡時のお願い">
        <p>対象ページのURL、商品名、訂正内容、確認できる公式情報等をお知らせください。個人情報や販売サービスのログイン情報は送信しないでください。</p>
      </LegalSection>
    </LegalPage>
  );
}

function publicContactEmail() {
  const value = String(process.env.NEXT_PUBLIC_CONTACT_EMAIL || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}
