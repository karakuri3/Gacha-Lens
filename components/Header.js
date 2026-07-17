import Link from "next/link";
import { CalendarDays, ChartNoAxesCombined, CircleDotDashed, Library, Search } from "lucide-react";

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-logo" aria-label="Gacha Lens ホーム">
          <span className="site-logo__mark" aria-hidden="true"><CircleDotDashed size={25} strokeWidth={2.2} /></span>
          <span className="site-logo__copy">
            <strong>Gacha Lens</strong>
            <small>ガチャの話題・価格・発売情報</small>
          </span>
        </Link>

        <form className="global-search" action="/series" method="get" role="search">
          <Search size={18} aria-hidden="true" />
          <input name="q" aria-label="ガチャを検索" placeholder="ガチャ名・キャラクター名で検索" />
          <button type="submit" aria-label="検索する" title="検索する"><Search size={19} /></button>
        </form>

        <nav className="header-actions" aria-label="クイックメニュー">
          <Link href="/ranking" title="ランキング"><ChartNoAxesCombined size={19} /><span>ランキング</span></Link>
          <Link href="/schedule" title="発売予定"><CalendarDays size={19} /><span>発売予定</span></Link>
          <Link href="/series" title="ガチャ図鑑"><Library size={19} /><span>図鑑</span></Link>
        </nav>
      </div>
    </header>
  );
}
