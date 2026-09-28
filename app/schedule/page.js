import Link from "next/link";
import { notFound } from "next/navigation";
import ProductImage from "@/components/ProductImage";
import { getParentSeriesScheduleMonths, getParentSeriesSchedulePage } from "@/lib/series";
import { seriesHref } from "@/lib/variant-url";
import {
  formatCatalogMonth,
  normalizeCatalogMonth,
} from "@/lib/domain/catalog-query";
import {
  SCHEDULE_PAGE_SIZE,
  adjacentScheduleMonths,
  buildScheduleHref,
  currentJstCatalogMonth,
  groupScheduleMonthsByYear,
  isSchedulePageOutOfRange,
  parseSchedulePage,
} from "@/lib/domain/schedule-pagination";
import { formatYen } from "@/lib/domain/public-display-clean";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const weeks = ["第1週", "第2週", "第3週", "第4週", "第5週"];
const SCHEDULE_PARAMS = new Set(["month", "page"]);

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const currentMonth = currentJstCatalogMonth();
  const rawMonth = firstParam(params?.month);
  const requestedMonth = normalizeCatalogMonth(rawMonth);
  const pageRequest = parseSchedulePage(params?.page);
  const invalidMonth = Boolean(rawMonth && !requestedMonth);
  const selectedMonth = requestedMonth || currentMonth;
  const hasUnsupportedParams = Object.keys(params ?? {}).some((key) => !SCHEDULE_PARAMS.has(key));
  const page = pageRequest.valid ? pageRequest.page : 1;
  const metadataPage = invalidMonth || !pageRequest.valid ? null : await getParentSeriesSchedulePage({
    month: selectedMonth,
    page,
    pageSize: SCHEDULE_PAGE_SIZE,
  });
  const hasData = Number(metadataPage?.total || 0) > 0;
  const outOfRange = metadataPage
    ? isSchedulePageOutOfRange(page, metadataPage.total, metadataPage.pageSize)
    : true;
  const pageLabel = page > 1 ? `（${page}ページ目）` : "";

  return buildPageMetadata({
    title: `${formatCatalogMonth(selectedMonth)}のガチャ新作・発売情報${pageLabel} | Gacha Lens`,
    description: "正式公開されたガチャシリーズの発売情報を月と週から確認できます。",
    path: buildScheduleHref(selectedMonth, page),
    noIndex: invalidMonth || !pageRequest.valid || hasUnsupportedParams || !hasData || outOfRange,
  });
}

export default async function SchedulePage({ searchParams }) {
  const params = await searchParams;
  const currentMonth = currentJstCatalogMonth();
  const rawMonth = firstParam(params?.month);
  const requestedMonth = normalizeCatalogMonth(rawMonth);
  const pageRequest = parseSchedulePage(params?.page);
  if ((rawMonth && !requestedMonth) || !pageRequest.valid) notFound();

  const selectedMonth = requestedMonth || currentMonth;
  const requestedPage = pageRequest.page;
  const [availableMonths, catalogPage] = await Promise.all([
    getParentSeriesScheduleMonths(),
    getParentSeriesSchedulePage({
      month: selectedMonth,
      page: requestedPage,
      pageSize: SCHEDULE_PAGE_SIZE,
    }),
  ]);

  if (isSchedulePageOutOfRange(requestedPage, catalogPage.total, catalogPage.pageSize)) notFound();

  const page = catalogPage.page;
  const totalPages = catalogPage.totalPages;
  const adjacentMonths = adjacentScheduleMonths(availableMonths, selectedMonth);
  const recentMonths = [...availableMonths].sort().reverse().slice(0, 12);
  const archiveYears = groupScheduleMonthsByYear(availableMonths);
  const items = [...catalogPage.items].sort(compareScheduleItems);
  const scheduledItems = items.filter((item) => normalizeWeek(seriesScheduleWeek(item)));
  const undatedItems = items.filter((item) => !normalizeWeek(seriesScheduleWeek(item)));
  const groups = weeks
    .map((week) => ({
      key: week,
      label: `${week}より順次`,
      items: scheduledItems.filter((item) => normalizeWeek(seriesScheduleWeek(item)) === week),
    }))
    .filter((group) => group.items.length > 0);
  if (undatedItems.length) {
    groups.push({ key: "undated", label: "発売日確認中", items: undatedItems });
  }

  const displayStart = catalogPage.total ? (page - 1) * catalogPage.pageSize + 1 : 0;
  const displayEnd = Math.min(catalogPage.total, page * catalogPage.pageSize);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">SCHEDULE</p>
          <h1 className="page-title">新作・発売スケジュール</h1>
          <p className="page-lead">月と週を切り替えて、正式公開されたガチャシリーズの発売情報を確認できます。</p>
          <Link className="context-guide-link" href="/guides/forecast-ranking">発売予定データの見方</Link>
        </section>

        <nav className="schedule-month-nav" aria-label="発売月を移動">
          {adjacentMonths.previous ? (
            <Link href={buildScheduleHref(adjacentMonths.previous)} aria-label="前のデータ月を見る">← 前の月</Link>
          ) : <span className="schedule-month-nav__disabled">← 前の月</span>}
          <strong>{formatCatalogMonth(selectedMonth)}</strong>
          {adjacentMonths.next ? (
            <Link href={buildScheduleHref(adjacentMonths.next)} aria-label="次のデータ月を見る">次の月 →</Link>
          ) : <span className="schedule-month-nav__disabled">次の月 →</span>}
          <Link href={buildScheduleHref(currentMonth)} className="schedule-month-nav__today">今月</Link>
        </nav>

        {recentMonths.length > 0 ? (
          <nav className="tabs schedule-available-months" aria-label="最近の発売月">
            {recentMonths.map((month) => (
              <Link key={month} href={buildScheduleHref(month)} className={`pill-link ${month === selectedMonth ? "is-active" : ""}`} aria-current={month === selectedMonth ? "page" : undefined}>
                {formatCatalogMonth(month)}
              </Link>
            ))}
          </nav>
        ) : null}

        {archiveYears.length > 0 ? (
          <details className="card schedule-archive">
            <summary>月別アーカイブ</summary>
            <div className="schedule-archive__years">
              {archiveYears.map((group) => (
                <section key={group.year} className="schedule-archive__year">
                  <strong>{group.year}年</strong>
                  <nav className="tabs schedule-archive__months" aria-label={`${group.year}年の発売月`}>
                    {group.months.map((month) => (
                      <Link key={month} href={buildScheduleHref(month)} className={`pill-link ${month === selectedMonth ? "is-active" : ""}`} aria-current={month === selectedMonth ? "page" : undefined}>
                        {Number(month.slice(5, 7))}月
                      </Link>
                    ))}
                  </nav>
                </section>
              ))}
            </div>
          </details>
        ) : null}

        <div className="section-head schedule-results-head">
          <div>
            <h2 className="section-title">{formatCatalogMonth(selectedMonth)}</h2>
            <p className="section-sub">
              発売シリーズ {catalogPage.total.toLocaleString("ja-JP")}件
              {catalogPage.total ? `（${displayStart.toLocaleString("ja-JP")}〜${displayEnd.toLocaleString("ja-JP")}件を表示）` : ""}
            </p>
          </div>
          <Link href={`/series?month=${selectedMonth}&sort=newest`} className="button-link">シリーズ一覧で見る</Link>
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
                  {group.items.map((item, index) => <ScheduleCard key={item.slug || item.series_id} item={item} priority={index < 4} />)}
                </div>
              </section>
            ))}
          </section>
        ) : (
          <div className="card empty catalog-empty">
            <strong>{formatCatalogMonth(selectedMonth)}の発売情報はまだありません</strong>
            <span>データがある前後の月、今月、または月別アーカイブから確認できます。</span>
            <Link href="/series" className="button-link button-link--accent">ガチャ一覧を見る</Link>
          </div>
        )}

        {totalPages > 1 ? (
          <nav className="pagination" aria-label={`${formatCatalogMonth(selectedMonth)}の発売シリーズページ`}>
            {page > 1 ? (
              <Link className="pill-link" href={buildScheduleHref(selectedMonth, page - 1)}>前へ</Link>
            ) : <span className="pill-link is-disabled" aria-disabled="true">前へ</span>}
            <span>{page.toLocaleString("ja-JP")} / {totalPages.toLocaleString("ja-JP")}</span>
            {page < totalPages ? (
              <Link className="pill-link" href={buildScheduleHref(selectedMonth, page + 1)}>次へ</Link>
            ) : <span className="pill-link is-disabled" aria-disabled="true">次へ</span>}
          </nav>
        ) : null}
      </div>
    </main>
  );
}

function ScheduleCard({ item, priority = false }) {
  const week = normalizeWeek(seriesScheduleWeek(item));
  return (
    <Link href={seriesHref(item)} className="card product-card">
      <div className="product-image"><ProductImage item={undefined} src={item.image_url || item.imageUrl} imageScope="series" alt={item.name} priority={priority} emptyLabel="画像なし" /></div>
      <div>
        <div className="tag-row" style={{ marginBottom: 10 }}>
          <span className="tag">{week ? `${week}より順次` : "発売日確認中"}</span>
          <span className="tag">シリーズ</span>
        </div>
        <h2 className="product-name">{item.name}</h2>
        <div className="product-meta">{item.brand || "公式商品"} / {item.variant_count ? `${item.variant_count}種` : "ラインナップ確認中"}</div>
      </div>
      <div className="metric-grid">
        <Metric label="発売" value={releaseLabel(item)} />
        <Metric label="定価" value={formatYen(item.price)} />
      </div>
    </Link>
  );
}

function Metric({ label, value, tone = "" }) {
  return <div className="metric"><div className="metric__label">{label}</div><div className={`metric__value ${tone ? `is-${tone}` : ""}`}>{value}</div></div>;
}

function compareScheduleItems(a, b) {
  const dateDiff = releaseTime(a) - releaseTime(b);
  if (dateDiff !== 0) return dateDiff;
  const weekDiff = weekIndex(seriesScheduleWeek(a)) - weekIndex(seriesScheduleWeek(b));
  if (weekDiff !== 0) return weekDiff;
  const nameDiff = String(a.name || "").localeCompare(String(b.name || ""), "ja");
  if (nameDiff !== 0) return nameDiff;
  return String(a.series_id || a.id || "").localeCompare(String(b.series_id || b.id || ""));
}

function releaseTime(item) {
  const time = Date.parse(item.release_date || item.releaseDate || "");
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function seriesScheduleWeek(item) {
  const explicitWeek = item.release_week || item.schedule_week || "";
  if (explicitWeek) return explicitWeek;
  const date = String(item.release_date || item.releaseDate || "");
  const match = date.match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!match) return "";
  return `第${Math.min(5, Math.ceil(Number(match[1]) / 7))}週`;
}

function releaseLabel(item) {
  const date = String(item.release_date || item.releaseDate || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.replace(/-/g, "/");
  return formatCatalogMonth(String(item.release_month || item.schedule_month || "")) || "発売日確認中";
}

function normalizeWeek(value = "") {
  const match = String(value).match(/([1-5])/);
  return match ? `第${match[1]}週` : "";
}

function weekIndex(value = "") {
  const index = weeks.indexOf(normalizeWeek(value));
  return index >= 0 ? index : weeks.length;
}

function firstParam(value) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}
