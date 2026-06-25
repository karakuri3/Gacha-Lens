import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getSeriesList } from "@/lib/series";
import { buildUpcomingCustomerMetrics, customerTags, opportunityScore } from "@/lib/domain/public-display";

export const metadata = {
  title: "発売スケジュール | Gacha Lens",
  description: "発売予定の単品を月別、週別、期待値別に確認できます。",
};

const weeks = ["第1週", "第2週", "第3週", "第4週", "第5週", "未定"];

export default async function SchedulePage({ searchParams }) {
  const params = await searchParams;
  const allSeries = await getSeriesList();
  const upcomingItems = allSeries.filter((item) => !item.is_released && item.schedule_month);
  const months = buildMonthsFromItems(upcomingItems);
  const selectedMonth = months.includes(params?.month) ? params.month : months[0];
  const items = upcomingItems
    .filter((item) => item.schedule_month === selectedMonth)
    .sort((a, b) => {
      const weekDiff = weekIndex(a.schedule_week) - weekIndex(b.schedule_week);
      if (weekDiff !== 0) return weekDiff;
      return opportunityScore(b) - opportunityScore(a);
    });

  const groups = weeks
    .map((week) => ({
      week,
      label: week === "未定" ? "未定" : `${week}より順次`,
      items: items.filter((item) => normalizeWeek(item.schedule_week) === week),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">SCHEDULE</p>
          <h1 className="page-title">発売予定を狙い目順に見る</h1>
        </section>

        {months.length > 0 ? (
          <div className="tabs" aria-label="月を切り替え">
            {months.map((month) => (
              <Link
                key={month}
                href={{ pathname: "/schedule", query: { month } }}
                className={`pill-link ${month === selectedMonth ? "is-active" : ""}`}
              >
                {month}
              </Link>
            ))}
          </div>
        ) : null}

        {groups.length > 0 ? (
          <section className="month-board">
            {groups.map((group) => (
              <section key={group.week} className="week-band">
                <div className="section-head" style={{ marginBottom: 0 }}>
                  <div>
                    <h2 className="week-title">{group.label}</h2>
                    <p className="section-sub">
                      {selectedMonth} / {group.items.length}件
                    </p>
                  </div>
                </div>
                <div className="grid grid--cards">
                  {group.items.map((item) => (
                    <ScheduleCard key={item.slug} item={item} />
                  ))}
                </div>
              </section>
            ))}
          </section>
        ) : (
          <div className="card empty">発売予定データはまだ登録されていません。</div>
        )}
      </div>
    </main>
  );
}

function ScheduleCard({ item }) {
  const week = normalizeWeek(item.schedule_week);
  const metrics = buildUpcomingCustomerMetrics(item).filter((metric) =>
    ["価格", "期待値", "価格上昇期待", "品薄予想", "狙い目度"].includes(metric.label)
  );
  const tags = customerTags(item, false);

  return (
    <Link href={`/series/${item.slug}`} className="card product-card">
      <div className="product-image">
        <ProductImage src={item.image_url} alt={item.name} />
      </div>
      <div>
        <div className="tag-row" style={{ marginBottom: 10 }}>
          <span className="tag">{week === "未定" ? "未定" : `${week}より順次`}</span>
          <span className="tag">{item.rarity}</span>
        </div>
        <h2 className="product-name">{item.name}</h2>
        <div className="product-meta">
          {item.series_name} / {item.role}
        </div>
      </div>
      <div className="metric-grid">
        {metrics.map((metric) => (
          <Metric key={metric.label} {...metric} />
        ))}
      </div>
      {tags.length > 0 ? (
        <div className="tag-row">
          {tags.map((tag) => (
            <span key={tag} className="tag tag--signal">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className="metric">
      <div className="metric__label">{label}</div>
      <div className={`metric__value ${tone ? `is-${tone}` : ""}`}>{value}</div>
    </div>
  );
}

function buildMonthsFromItems(items = []) {
  const monthMap = new Map();

  for (const item of items) {
    const month = item.schedule_month;
    if (!month) continue;
    const current = monthMap.get(month);
    const sortValue = getMonthSortValue(item);
    monthMap.set(month, current == null ? sortValue : Math.min(current, sortValue));
  }

  return [...monthMap.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "ja"))
    .map(([month]) => month);
}

function getMonthSortValue(item) {
  const dateTime = Date.parse(item.release_date || item.releaseDate || "");
  if (Number.isFinite(dateTime)) return dateTime;
  const monthNumber = extractNumber(item.schedule_month);
  return monthNumber || Number.MAX_SAFE_INTEGER;
}

function normalizeWeek(value = "") {
  if (String(value).includes("未定")) return "未定";
  const number = extractNumber(value);
  return number ? `第${number}週` : "未定";
}

function weekIndex(value = "") {
  const normalized = normalizeWeek(value);
  const index = weeks.indexOf(normalized);
  return index >= 0 ? index : weeks.length;
}

function extractNumber(value = "") {
  const matched = String(value).match(/\d{1,2}/);
  return matched ? Number(matched[0]) : null;
}
