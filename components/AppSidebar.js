"use client";

import Link from "next/link";
import { Activity, CalendarDays, ChartNoAxesCombined, Home, Library, PackageSearch, SearchCheck, Star } from "lucide-react";
import { usePathname } from "next/navigation";

const primaryItems = [
  { label: "ホーム", href: "/", icon: Home, exact: true },
  { label: "注目ランキング", href: "/ranking", icon: ChartNoAxesCombined },
  { label: "新作・発売予定", href: "/schedule", icon: CalendarDays },
  { label: "ガチャ図鑑", href: "/series", icon: Library },
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
      <div className="sidebar-status">
        <span className="sidebar-status__dot" aria-hidden="true" />
        <div><strong>データ更新中</strong><small>公式・市場・在庫情報を反映</small></div>
      </div>
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
