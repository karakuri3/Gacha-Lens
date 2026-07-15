import Link from "next/link";

export default function Footer() {
  const amazonEnabled = Boolean(process.env.AMAZON_ASSOCIATE_TAG);
  return (
    <footer className="site-footer">
      <div className="site-shell site-footer__inner">
        <div>
          <strong>Gacha Lens</strong>
          <p>ガチャの新作と話題を追いかける、非公式のトレンドガイド。</p>
        </div>
        <nav aria-label="フッターメニュー">
          <Link href="/ranking">注目ランキング</Link>
          <Link href="/schedule">発売カレンダー</Link>
          <Link href="/series">ガチャ図鑑</Link>
        </nav>
        {amazonEnabled ? (
          <small>Amazonのアソシエイトとして、Gacha Lensは適格販売により収入を得ています。</small>
        ) : null}
      </div>
    </footer>
  );
}
