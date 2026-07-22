import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getSeriesCatalogPage, getUpcomingScheduleMonths } from "@/lib/series";
import { variantHref } from "@/lib/variant-url";
import {
  formatCatalogMonth,
  normalizeCatalogMonth,
  shiftCatalogMonth,
} from "@/lib/domain/catalog-query";
import {
  UPCOMING_METRIC_LABELS,
  buildUpcomingCustomerMetrics,
  customerTags,
  opportunityScore,
} from "@/lib/domain/public-display-clean";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const weeks = ["第1週", "第2週", "第3週", "第4週", "第5週"];
const scheduleMetricLabels = [
  UPCOMING_METRIC_LABELS.price,
  UPCOMING_METRIC_LABELS.forecast,
  UPCOMING_METRIC_LABELS.upside,
  UPCOMING_METRIC_LABELS.scarcity,
  UPCOMING_METRIC_LABELS.opportunity,
];

export async function generateMetadata({ searchParams }) {
  const month = normalizeCatalogMonth((await searchParams)?.month);
  return {
    title: month ? `${formatCatalogMonth(month)}の発売予定 | Gacha Lens` : "発売スケジュール | Gacha Lens",
    description: "発売予定のガチャ単品を月と週から確認できます。",
    alternates: { canonical: month ? `/schedule?month=${month}` : "/schedule" },
  };
}

export default async function SchedulePage({ searchParams }) {
  const params = await searchParams;
  const availableMonths = await getUpcomingScheduleMonths();
  const currentMonth = currentCatalogMonth();
  const requestedMonth = normalizeCatalogMonth(params?.month);
  const selectedMonth = requestedMonth || availableMonths.find((month) => month >= currentMonth) || availableMonths[0] || currentMonth;
  const catalogPage = await getSeriesCatalogPage({
    release: "upcoming",
    month: selectedMonth,
    sort: "newest",
    page: 1,
    pageSize: 120,
  });
  const items = catalogPage.items
    .filter((item) => !item.is_released && item.variant_type !== "provisional")
    .sort(compareScheduleItems);
  const datedItems = items.filter((item) => hasConfirmedReleaseDate(item) && normalizeWeek(item.schedule_week));
  const undatedItems = items.filter((item) => !hasConfirmedReleaseDate(item) || !normalizeWeek(item.schedule_week));
  const groups = weeks
    .map((week) => ({
      key: week,
      label: `${week}より順次`,
      items: datedItems.filter((item) => normalizeWeek(item.schedule_week) === week),
    }))
    .filter((group) => group.items.length > 0);
  if (undatedItems.length) {
    groups.push({ key: "undated", label: "発売日確認中", items: undatedItems });
  }

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">SCHEDULE</p>
          <h1 className="page-title">新作・発売予定</h1>
          <p className="page-lead">月と週を切り替えて、正式公開された単品の発売情報を確認できます。</p>
        </section>

        <nav className="schedule-month-nav" aria-label="発売月を移動">
          <Link href={`/schedule?month=${shiftCatalogMonth(selectedMonth, -1)}`} aria-label="前月を見る">← 前月</Link>
          <strong>{formatCatalogMonth(selectedMonth)}</strong>
          <Link href={`/schedule?month=${shiftCatalogMonth(selectedMonth, 1)}`} aria-label="次月を見る">次月 →</Link>
          <Link href={`/schedule?month=${currentMonth}`} className="schedule-month-nav__today">今月</Link>
        </nav>

        {availableMonths.length > 0 ? (
          <nav className="tabs schedule-available-months" aria-label="データがある発売月">
            {availableMonths.map((month) => (
              <Link key={month} href={`/schedule?month=${month}`} className={`pill-link ${month === selectedMonth ? "is-active" : ""}`} aria-current={month === selectedMonth ? "page" : undefined}>
                {formatCatalogMonth(month)}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="section-head schedule-results-head">
          <div>
            <h2 className="section-title">{formatCatalogMonth(selectedMonth)}</h2>
            <p className="section-sub">発売予定 {catalogPage.total.toLocaleString("ja-JP")}件</p>
          </div>
          <Link href={`/series?release=upcoming&month=${selectedMonth}&sort=newest`} className="button-link">一覧で見る</Link>
        </div>

        {groups.length > 0 ? (
          <section className="month-board">
            {groups.map((group) => (
              <section key={group.key} className="week-band">
                <div className="section-head" style={{ marginBottom: 0 }}>
                  <div>
                    <h2 className="week-title">{group.label}</h2>
                    <p className="section-sub">{group.items.length.toLocaleString("ja-JP")}件</p>
                  </div>
                </div>
                <div className="grid grid--cards">
                  {group.items.map((item, index) => <ScheduleCard key={item.slug} item={item} priority={index < 4} />)}
                </div>
              </section>
            ))}
          </section>
        ) : (
          <div className="card empty catalog-empty">
            <strong>{formatCatalogMonth(selectedMonth)}の発売予定はまだありません</strong>
            <span>前月・次月、またはデータがある月へ切り替えて確認できます。</span>
            <Link href="/series?release=upcoming" className="button-link button-link--accent">発売予定をすべて見る</Link>
          </div>
        )}
      </div>
    </main>
  );
}

function ScheduleCard({ item, priority = false }) {
  const week = normalizeWeek(item.schedule_week);
  const metrics = buildUpcomingCustomerMetrics(item).filter((metric) => scheduleMetricLabels.includes(metric.label));
  const tags = customerTags(item, false);
  return (
    <Link href={variantHref(item)} className="card product-card">
      <div className="product-image"><ProductImage src={item.image_url} alt={item.name} priority={priority} /></div>
      <div>
        <div className="tag-row" style={{ marginBottom: 10 }}>
          <span className="tag">{hasConfirmedReleaseDate(item) && week ? `${week}より順次` : "発売日確認中"}</span>
          {item.rarity ? <span className="tag">{item.rarity}</span> : null}
        </div>
        <h2 className="product-name">{item.name}</h2>
        <div className="product-meta">{item.series_name} / {item.role}</div>
      </div>
      <div className="metric-grid">
        {metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
      </div>
      {tags.length > 0 ? <div className="tag-row">{tags.map((tag) => <span key={tag} className="tag tag--signal">{tag}</span>)}</div> : null}
    </Link>
  );
}

function Metric({ label, value, tone = "" }) {
  return <div className="metric"><div className="metric__label">{label}</div><div className={`metric__value ${tone ? `is-${tone}` : ""}`}>{value}</div></div>;
}

function compareScheduleItems(a, b) {
  const dateDiff = releaseTime(a) - releaseTime(b);
  if (dateDiff !== 0) return dateDiff;
  const weekDiff = weekIndex(a.schedule_week) - weekIndex(b.schedule_week);
  return weekDiff || opportunityScore(b) - opportunityScore(a);
}

function releaseTime(item) {
  const time = Date.parse(item.release_date || item.releaseDate || "");
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function hasConfirmedReleaseDate(item) {
  return Number.isFinite(Date.parse(item.release_date || item.releaseDate || ""));
}

function normalizeWeek(value = "") {
  const match = String(value).match(/([1-5])/);
  return match ? `第${match[1]}週` : "";
}

function weekIndex(value = "") {
  const index = weeks.indexOf(normalizeWeek(value));
  return index >= 0 ? index : weeks.length;
}

function currentCatalogMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
