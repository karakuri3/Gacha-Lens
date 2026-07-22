import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ChartNoAxesCombined, Home, Library, MapPin, Menu, RefreshCcw, Search, Shapes, Star } from "lucide-react";

const menuItems = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/ranking", label: "相場ランキング", icon: ChartNoAxesCombined },
  { href: "/schedule", label: "新作・発売予定", icon: CalendarDays },
  { href: "/series", label: "ガチャ一覧", icon: Library },
  { href: "/categories", label: "カテゴリ一覧", icon: Shapes },
  { href: "/restocks", label: "再販・再入荷", icon: RefreshCcw },
  { href: "/stock", label: "在庫目撃情報", icon: MapPin },
];

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-logo" aria-label="Gacha Lens ホーム">
          <span className="site-logo__mark" aria-hidden="true">
            <Image src="/brand/gacha-lens-logo.png" alt="" width={44} height={44} priority />
          </span>
          <span className="site-logo__copy">
            <strong>Gacha Lens</strong>
            <small>ガチャの話題・価格・発売情報</small>
          </span>
        </Link>

        <form className="global-search" action="/series" method="get" role="search">
          <Search size={18} aria-hidden="true" />
          <input name="q" aria-label="ガチャを検索" placeholder="商品名・作品名・キャラクター名で検索" />
          <button type="submit" aria-label="検索する" title="検索する"><Search size={19} /></button>
        </form>

        <nav className="header-actions" aria-label="クイックメニュー">
          <Link href="/favorites" title="お気に入り"><Star size={19} /><span>お気に入り</span></Link>
          <details className="header-menu">
            <summary aria-label="メニューを開く" title="メニュー"><Menu size={20} /><span>メニュー</span></summary>
            <nav aria-label="サイトメニュー">
              {menuItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}><Icon size={17} aria-hidden="true" /><span>{label}</span></Link>
              ))}
            </nav>
          </details>
        </nav>
      </div>
    </header>
  );
}
