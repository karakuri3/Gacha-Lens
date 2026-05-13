import Link from "next/link";
import { getSeriesList } from "@/lib/series";

export const metadata = {
  title: "発売スケジュール | Gacha Lens",
  description: "10月から3月までの発売予定単品を月別、週別に確認できます。",
};

const months = ["10月", "11月", "12月", "1月", "2月", "3月"];
const weeks = ["第1週", "第2週", "第3週", "第4週", "第5週", "未定"];

export default async function SchedulePage({ searchParams }) {
  const params = await searchParams;
  const selectedMonth = months.includes(params?.month) ? params.month : "10月";
  const allSeries = await getSeriesList();
  const items = allSeries
    .filter((item) => !item.is_released)
    .filter((item) => item.schedule_month === selectedMonth)
    .sort((a, b) => {
      const weekDiff = weeks.indexOf(a.schedule_week) - weeks.indexOf(b.schedule_week);
      if (weekDiff !== 0) return weekDiff;
      return (b.forecast_score ?? 0) - (a.forecast_score ?? 0);
    });

  const groups = weeks
    .map((week) => ({
      week,
      label: week === "未定" ? "未定" : `${week}より順次`,
      items: items.filter((item) => item.schedule_week === week),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">SCHEDULE</p>
          <h1 className="page-title">発売予定の単品を週単位で追う</h1>
        </section>

        <div className="tabs" aria-label="月切り替え">
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
          <div className="card empty">この月の発売予定はまだ登録されていません。</div>
        )}
      </div>
    </main>
  );
}

function ScheduleCard({ item }) {
  return (
    <Link href={`/series/${item.slug}`} className="card product-card">
      <div className="product-image">
        <img src={item.image_url} alt={item.name} />
      </div>
      <div>
        <div className="tag-row" style={{ marginBottom: 10 }}>
          <span className="tag">
            {item.schedule_week === "未定" ? "未定" : `${item.schedule_week}より順次`}
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

function Metric({ label, value, tone = "" }) {
  return (
    <div className="metric">
      <div className="metric__label">{label}</div>
      <div className={`metric__value ${tone ? `is-${tone}` : ""}`}>{value}</div>
    </div>
  );
}

function formatYen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "未定";
}

function formatScore(value) {
  return Number.isFinite(value) ? `${Math.round(value)}点` : "未登録";
}
