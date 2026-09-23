import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ChartNoAxesCombined, Library, MapPin, Menu, RefreshCcw, Search, Shapes, Star } from "lucide-react";

const primaryNav = [
  { href: "/series", label: "ガチャを探す" },
  { href: "/schedule", label: "発売予定" },
  { href: "/categories", label: "カテゴリ" },
  { href: "/ranking", label: "相場" },
];

const menuItems = [
  { href: "/series", label: "ガチャ一覧", icon: Library },
  { href: "/schedule", label: "新作・発売予定", icon: CalendarDays },
  { href: "/categories", label: "カテゴリ一覧", icon: Shapes },
  { href: "/ranking", label: "相場ランキング", icon: ChartNoAxesCombined },
  { href: "/restocks", label: "再販・再入荷", icon: RefreshCcw },
  { href: "/stock", label: "在庫目撃情報", icon: MapPin },
  { href: "/favorites", label: "お気に入り", icon: Star },
];

export default function Header() {
  return (
    <header className="site-header consumer-header">
      <div className="consumer-header__inner">
        <Link href="/" className="site-logo consumer-logo" aria-label="Gacha Lens ホーム">
          <span className="site-logo__mark" aria-hidden="true">
            <Image src="/brand/gacha-lens-mark.png" alt="" width={42} height={42} priority />
          </span>
          <span className="site-logo__copy">
            <strong>Gacha Lens</strong>
            <small>ガチャを見つける・比べる</small>
          </span>
        </Link>

        <nav className="consumer-primary-nav" aria-label="メインメニュー">
          {primaryNav.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>

        <form className="global-search consumer-global-search" action="/series" method="get" role="search">
          <Search size={18} aria-hidden="true" />
          <input name="q" type="search" aria-label="ガチャを検索" placeholder="ガチャ名・作品・メーカーで検索" />
          <button type="submit" aria-label="検索する" title="検索する"><Search size={19} aria-hidden="true" /></button>
        </form>

        <nav className="header-actions consumer-header-actions" aria-label="クイックメニュー">
          <Link href="/favorites" title="お気に入り"><Star size={19} aria-hidden="true" /><span>お気に入り</span></Link>
          <details className="header-menu">
            <summary aria-label="メニューを開く" title="メニュー"><Menu size={20} aria-hidden="true" /><span>メニュー</span></summary>
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
