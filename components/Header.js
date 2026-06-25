import Link from "next/link";

const navItems = [
  { label: "ランキング", href: "/ranking" },
  { label: "トレンド", href: "/trends" },
  { label: "スケジュール", href: "/schedule" },
  { label: "単品一覧", href: "/series" },
];

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-shell site-header__inner">
        <Link href="/" className="site-logo">
          Gacha Lens
        </Link>
        <nav className="site-nav" aria-label="サイトメニュー">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          <Link href="/series" className="button-link button-link--dark">
            探す
          </Link>
        </nav>
      </div>
    </header>
  );
}
