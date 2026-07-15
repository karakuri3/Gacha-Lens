import Link from "next/link";

const navItems = [
  { label: "いま熱い", href: "/ranking" },
  { label: "トレンド", href: "/trends" },
  { label: "発売カレンダー", href: "/schedule" },
  { label: "ガチャ図鑑", href: "/series" },
];

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-shell site-header__inner">
        <Link href="/" className="site-logo">
          <strong>Gacha Lens</strong>
          <span>CAPSULE TREND GUIDE</span>
        </Link>
        <nav className="site-nav" aria-label="サイトメニュー">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
