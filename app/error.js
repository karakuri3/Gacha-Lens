"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="site-main">
      <div className="site-shell">
        <div className="card empty error-state">
          <strong>商品情報を取得できません</strong>
          <span>一時的な通信エラーの可能性があります。時間をおいて再度お試しください。</span>
          <div className="tag-row">
            <button type="button" className="button-link button-link--accent" onClick={() => reset()}>再試行</button>
            <Link href="/" className="button-link">ホームへ戻る</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
