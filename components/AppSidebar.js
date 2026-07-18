"use client";

import Link from "next/link";
import { Activity, CalendarDays, ChartNoAxesCombined, Home, Library, MapPin, PackageSearch, RefreshCcw, SearchCheck, Shapes, Star } from "lucide-react";
import { usePathname } from "next/navigation";

const primaryItems = [
  { label: "ホーム", href: "/", icon: Home, exact: true },
  { label: "相場ランキング", href: "/ranking", icon: ChartNoAxesCombined },
  { label: "新作・発売予定", href: "/schedule", icon: CalendarDays },
  { label: "ガチャ一覧", href: "/series", icon: Library },
  { label: "カテゴリ一覧", href: "/categories", icon: Shapes },
  { label: "再販・再入荷", href: "/restocks", icon: RefreshCcw },
  { label: "在庫目撃情報", href: "/stock", icon: MapPin },
  { label: "お気に入り", href: "/favorites", icon: Star },
];

const discoveryItems = [
  { label: "今出回っている", href: "/series?filter=circulating&sort=watch", icon: Activity },
  { label: "相場データあり", href: "/series?filter=market&sort=market", icon: SearchCheck },
  { label: "発売中を探す", href: "/series?filter=released&sort=recommended", icon: PackageSearch },
];

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      <SidebarGroup label="メニュー" items={primaryItems} pathname={pathname} />
      <SidebarGroup label="ガチャを探す" items={discoveryItems} pathname={pathname} />
    </aside>
  );
}

function SidebarGroup({ label, items, pathname }) {
  return (
    <section className="sidebar-group">
      <h2>{label}</h2>
      <nav aria-label={label}>
        {items.map(({ label: itemLabel, href, icon: Icon, exact }) => {
          const targetPath = href.split("?")[0];
          const active = exact ? pathname === targetPath : pathname.startsWith(targetPath) && !href.includes("?");
          return (
            <Link key={href} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>
              <Icon size={18} strokeWidth={2} aria-hidden="true" />
              <span>{itemLabel}</span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
