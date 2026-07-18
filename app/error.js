"use client";

import Link from "next/link";

export default function ErrorPage({ reset }) {
  return (
    <main className="site-main">
      <div className="site-shell">
        <div className="card empty error-state">
          <strong>ページを読み込めませんでした</strong>
          <span>一時的な通信エラーの可能性があります。もう一度お試しください。</span>
          <div className="tag-row">
            <button type="button" className="button-link button-link--accent" onClick={() => reset()}>再読み込み</button>
            <Link href="/" className="button-link">ホームへ戻る</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
