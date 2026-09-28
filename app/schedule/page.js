import Link from "next/link";
import { redirect } from "next/navigation";
import ProductImage from "@/components/ProductImage";
import { getParentSeriesSchedulePage, getParentSeriesScheduleMonths } from "@/lib/series";
import { seriesHref } from "@/lib/variant-url";
import {
  formatCatalogMonth,
  normalizeCatalogMonth,
  shiftCatalogMonth,
} from "@/lib/domain/catalog-query";
import {
  currentScheduleMonth,
  groupScheduleArchiveMonths,
  isCanonicalSchedulePageValue,
  normalizeSchedulePage,
  scheduleArchiveNeighbors,
  scheduleHref,
  schedulePageWindow,
  SCHEDULE_PAGE_SIZE,
} from "@/lib/domain/schedule-query";
import { formatYen } from "@/lib/domain/public-display-clean";
import { compareReleaseWeeks, compareScheduleItems, releaseTiming } from "@/lib/domain/release-precision";
import { buildPageMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const allowedParams = new Set(["month", "page"]);

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const currentMonth = currentScheduleMonth();
  const month = normalizeCatalogMonth(params?.month) || currentMonth;
  const page = normalizeSchedulePage(params?.page);
  const metadataPage = await getParentSeriesSchedulePage({
    month,
    page: 1,
    pageSize: 1,
  });
  const hasUnknownParams = Object.keys(params || {}).some((key) => !allowedParams.has(key));
  const invalidMonth = Boolean(params?.month) && !normalizeCatalogMonth(params.month);
  const invalidPage = !isCanonicalSchedulePageValue(params?.page);
  const emptyMonth = metadataPage.total === 0;
  const suffix = page > 1 ? `（${page}ページ目）` : "";
  return buildPageMetadata({
    title: `${formatCatalogMonth(month)}のガチャ新作・発売情報${suffix} | Gacha Lens`,
    description: "正式公開されたガチャシリーズの発売情報を月単位で漏れなく確認できます。",
    path: scheduleHref(month, page),
    noIndex: hasUnknownParams || invalidMonth || invalidPage || emptyMonth,
  });
}

export default async function SchedulePage({ searchParams }) {
  const params = await searchParams;
  const currentMonth = currentScheduleMonth();
  const requestedMonth = normalizeCatalogMonth(params?.month);
  const requestedPage = normalizeSchedulePage(params?.page);
  const hasUnknownParams = Object.keys(params || {}).some((key) => !allowedParams.has(key));

  if (!requestedMonth || hasUnknownParams || !isCanonicalSchedulePageValue(params?.page) || String(params?.page || "") === "1") {
    redirect(scheduleHref(requestedMonth || currentMonth, requestedPage));
  }

  const [availableMonths, catalogPage] = await Promise.all([
    getParentSeriesScheduleMonths(),
    getParentSeriesSchedulePage({
      month: requestedMonth,
      page: requestedPage,
      pageSize: SCHEDULE_PAGE_SIZE,
    }),
  ]);

  if (catalogPage.page !== requestedPage) redirect(scheduleHref(requestedMonth, catalogPage.page));

  const totalPages = Math.max(1, Math.ceil(catalogPage.total / catalogPage.pageSize));
  const displayStart = catalogPage.total ? (catalogPage.page - 1) * catalogPage.pageSize + 1 : 0;
  const displayEnd = (catalogPage.page - 1) * catalogPage.pageSize + catalogPage.items.length;
  const items = [...catalogPage.items];
  const scheduledItems = items.filter((item) => releaseTiming(item).week);
  const undatedItems = items.filter((item) => !releaseTiming(item).week);
  const weeks = [...new Set(scheduledItems.map((item) => releaseTiming(item).week))].sort(compareReleaseWeeks);
  const groups = weeks
    .map((week) => ({
      key: week,
      label: `${week}より順次`,
      items: scheduledItems.filter((item) => releaseTiming(item).week === week).sort(compareScheduleItems),
    }))
    .filter((group) => group.items.length > 0);
  if (undatedItems.length) groups.push({ key: "undated", label: "発売時期未定", items: undatedItems.sort(compareScheduleItems) });

  const archiveGroups = groupScheduleArchiveMonths(availableMonths);
  const hasSelectedMonthData = availableMonths.includes(requestedMonth);
  const archiveNeighbors = scheduleArchiveNeighbors(requestedMonth, availableMonths);
  const previousMonth = hasSelectedMonthData ? shiftCatalogMonth(requestedMonth, -1) : archiveNeighbors.previous;
  const nextMonth = hasSelectedMonthData ? shiftCatalogMonth(requestedMonth, 1) : archiveNeighbors.next;
  const selectedIndex = availableMonths.indexOf(requestedMonth);
  const recentStart = Math.max(0, selectedIndex >= 0 ? selectedIndex - 3 : availableMonths.length - 6);
  const recentMonths = availableMonths.slice(recentStart, recentStart + 7);

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
          {previousMonth ? <Link href={scheduleHref(previousMonth)} aria-label={hasSelectedMonthData ? "前月を見る" : "前の発売月を見る"}>← {hasSelectedMonthData ? "前月" : "前の発売月"}</Link> : <span />}
          <strong>{formatCatalogMonth(requestedMonth)}</strong>
          {nextMonth ? <Link href={scheduleHref(nextMonth)} aria-label={hasSelectedMonthData ? "次月を見る" : "次の発売月を見る"}>{hasSelectedMonthData ? "次月" : "次の発売月"} →</Link> : <span />}
          <Link href={scheduleHref(currentMonth)} className="schedule-month-nav__today">今月</Link>
        </nav>

        {recentMonths.length > 0 ? (
          <nav className="tabs schedule-available-months" aria-label="近くの発売月">
            {recentMonths.map((month) => (
              <Link key={month} href={scheduleHref(month)} className={`pill-link ${month === requestedMonth ? "is-active" : ""}`} aria-current={month === requestedMonth ? "page" : undefined}>
                {formatCatalogMonth(month)}
              </Link>
            ))}
          </nav>
        ) : null}

        {archiveGroups.length > 0 ? (
          <details className="card schedule-archive">
            <summary>発売月アーカイブ</summary>
            {archiveGroups.map((group) => (
              <div key={group.year} className="schedule-archive__year">
                <strong>{group.year}年</strong>
                <div className="tabs">
                  {group.months.map((month) => (
                    <Link key={month} href={scheduleHref(month)} className={`pill-link ${month === requestedMonth ? "is-active" : ""}`}>
                      {Number(month.slice(5, 7))}月
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </details>
        ) : null}

        <div className="section-head schedule-results-head">
          <div>
            <h2 className="section-title">{formatCatalogMonth(requestedMonth)}</h2>
            <p className="section-sub">
              発売シリーズ {catalogPage.total.toLocaleString("ja-JP")}件
              {catalogPage.total > catalogPage.pageSize ? `（${displayStart.toLocaleString("ja-JP")}〜${displayEnd.toLocaleString("ja-JP")}件を表示）` : ""}
            </p>
          </div>
          <Link href={`/series?month=${requestedMonth}&sort=newest`} className="button-link">シリーズ一覧で見る</Link>
        </div>

        {groups.length > 0 ? (
          <>
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
            {catalogPage.total > catalogPage.pageSize ? <SchedulePagination month={requestedMonth} page={catalogPage.page} totalPages={totalPages} /> : null}
          </>
        ) : (
          <div className="card empty catalog-empty">
            <strong>{formatCatalogMonth(requestedMonth)}の発売情報はまだありません</strong>
            <span>前月・次月、今月、または発売月アーカイブへ切り替えて確認できます。</span>
            <Link href="/series" className="button-link button-link--accent">ガチャ一覧を見る</Link>
          </div>
        )}
      </div>
    </main>
  );
}

function SchedulePagination({ month, page, totalPages }) {
  const pages = schedulePageWindow(page, totalPages);
  return (
    <nav className="pagination" aria-label="発売スケジュールのページ">
      <Link className={`pill-link ${page <= 1 ? "is-disabled" : ""}`} href={scheduleHref(month, Math.max(1, page - 1))} aria-disabled={page <= 1}>前へ</Link>
      <div className="pagination__pages">
        {pages.map((item) => (
          <Link key={item} className={`pill-link ${item === page ? "is-active" : ""}`} href={scheduleHref(month, item)} aria-current={item === page ? "page" : undefined}>{item.toLocaleString("ja-JP")}</Link>
        ))}
      </div>
      <Link className={`pill-link ${page >= totalPages ? "is-disabled" : ""}`} href={scheduleHref(month, Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages}>次へ</Link>
    </nav>
  );
}

function ScheduleCard({ item, priority = false }) {
  const timing = releaseTiming(item);
  const week = timing.week;
  return (
    <Link href={seriesHref(item)} className="card product-card">
      <div className="product-image"><ProductImage item={undefined} src={item.image_url || item.imageUrl} imageScope="series" alt={item.name} priority={priority} emptyLabel="画像なし" /></div>
      <div>
        <div className="tag-row" style={{ marginBottom: 10 }}>
          <span className="tag">{week ? `${week}より順次` : "発売時期未定"}</span>
          <span className="tag">シリーズ</span>
        </div>
        <h2 className="product-name">{item.name}</h2>
        <div className="product-meta">{item.brand || "公式商品"} / {item.variant_count ? `${item.variant_count}種` : "ラインナップ確認中"}</div>
      </div>
      <div className="metric-grid">
        <Metric label="発売" value={timing.label} />
        <Metric label="定価" value={formatYen(item.price)} />
      </div>
    </Link>
  );
}

function Metric({ label, value, tone = "" }) {
  return <div className="metric"><div className="metric__label">{label}</div><div className={`metric__value ${tone ? `is-${tone}` : ""}`}>{value}</div></div>;
}
