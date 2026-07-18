import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="site-main">
      <div className="site-shell">
        <div className="card empty error-state">
          <strong>商品またはページが見つかりません</strong>
          <span>URLが変わったか、掲載前の商品である可能性があります。</span>
          <div className="tag-row">
            <Link href="/series" className="button-link button-link--accent">ガチャ一覧で探す</Link>
            <Link href="/" className="button-link">ホームへ戻る</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
