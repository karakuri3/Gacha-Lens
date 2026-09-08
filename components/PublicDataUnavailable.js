import Link from "next/link";

export const PUBLIC_DATA_DEGRADED_MARKER = "data-source-error-503-v1";

export default function PublicDataUnavailable() {
  return (
    <main className="site-main" data-gacha-degraded={PUBLIC_DATA_DEGRADED_MARKER}>
      <div className="site-shell">
        <div className="card empty error-state">
          <strong>商品情報を取得できません</strong>
          <span>一時的な通信エラーの可能性があります。時間をおいて再度お試しください。</span>
          <div className="tag-row">
            <Link href="/" className="button-link button-link--accent">再試行</Link>
            <Link href="/guides" className="button-link">ガイドを見る</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
