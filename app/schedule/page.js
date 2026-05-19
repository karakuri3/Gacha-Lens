import Link from "next/link";
import { getSeriesList } from "@/lib/series";

export const metadata = {
  title: "発売スケジュール | Gacha Lens",
  description: "登録済みの発売予定データがある月だけを表示する単品主役の発売スケジュールです。",
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
      return (b.forecast_score ?? 0) - (a.forecast_score ?? 0);
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
          <h1 className="page-title">発売予定の単品を週単位で追う</h1>
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
  return (
    <Link href={`/series/${item.slug}`} className="card product-card">
      <div className="product-image">
        <ProductImage src={item.image_url} alt={item.name} />
      </div>
      <div>
        <div className="tag-row" style={{ marginBottom: 10 }}>
          <span className="tag">
            {week === "未定" ? "未定" : `${week}より順次`}
          </span>
          <span className="tag">{item.rarity}</span>
        </div>
        <h2 className="product-name">{item.name}</h2>
        <div className="product-meta">
          {item.series_name} / {item.role}
        </div>
      </div>
      <div className="metric-grid">
        <Metric label="価格" value={formatYen(item.price)} />
        <Metric label="コンプ需要" value={formatScore(item.complete_set_score)} />
        <Metric label="当たり枠" value={formatScore(item.ace_character_score)} />
        <Metric label="互換性" value={formatScore(item.compatibility_score)} />
        <Metric label="限定性" value={formatScore(item.limitedness_score)} />
        <Metric label="予想" value={formatScore(item.forecast_score)} tone="highlight" />
      </div>
      <div className="tag-row">
        {(item.forecast_tags ?? []).slice(0, 3).map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}

function ProductImage({ src, alt }) {
  return src ? <img src={src} alt={alt} /> : <span className="image-placeholder">NO IMAGE</span>;
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

function formatYen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "未定";
}

function formatScore(value) {
  return Number.isFinite(value) ? `${Math.round(value)}点` : "未登録";
}
