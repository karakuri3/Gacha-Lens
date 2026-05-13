import SectionHeading from "./SectionHeading";
import SeriesCard from "./SeriesCard";
import ActionLinkButton from "./ActionLinkButton";

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getDisplayCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}件`;
  }

  return "未取得";
}

function getGuideCardStyle() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: "#ffffff",
    boxSizing: "border-box",
  };
}

function getSectionLabelStyle() {
  return {
    fontSize: "13px",
    fontWeight: "bold",
    color: "#6b7280",
    lineHeight: 1.5,
  };
}

function getBodyTextStyle() {
  return {
    color: "#4b5563",
    lineHeight: 1.8,
  };
}

function getGuideItems(categoryName, categoryCount, hotSeriesCount) {
  return [
    {
      label: "このカテゴリの規模",
      value: getDisplayCount(categoryCount),
      helperText: `${categoryName}カテゴリに登録されているシリーズ数です。`,
    },
    {
      label: "向いている見方",
      value: "カテゴリの中で今動いているものを見る",
      helperText:
        "作品名までは決まっていないけれど、この系統の中で今見やすいシリーズから入りたいときに向いています。",
    },
    {
      label: "表示中の注目候補",
      value: getDisplayCount(hotSeriesCount),
      helperText:
        "このカテゴリの中から、入口として見やすいシリーズを先に出しています。",
    },
  ];
}

function getDescriptionText(categoryName, categoryCount, hotSeriesCount) {
  const countText = getDisplayCount(categoryCount);
  const hotCountText = getDisplayCount(hotSeriesCount);

  return `${categoryName}カテゴリには ${countText} あります。ここではその中から、今入口として見やすいシリーズを ${hotCountText} 先に出しています。`;
}

export default function CategoryShowcaseSection({
  categoryName = "",
  categoryCount = 0,
  hotHref = "",
  href = "",
  hotSeriesList = [],
}) {
  const guideItems = getGuideItems(
    categoryName,
    categoryCount,
    hotSeriesList.length
  );

  return (
    <section style={{ display: "grid", gap: "16px" }}>
      <SectionHeading
        title={`${categoryName}の注目シリーズ`}
        description={getDescriptionText(
          categoryName,
          categoryCount,
          hotSeriesList.length
        )}
        actionHref={href}
        actionLabel="このカテゴリ一覧を見る"
      />

      <div
        style={{
          display: "grid",
          gap: "12px",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {guideItems.map((item) => (
          <div key={`${item.label}-${item.value}`} style={getGuideCardStyle()}>
            <div style={getSectionLabelStyle()}>{item.label}</div>

            <div
              style={{
                marginTop: "8px",
                fontSize: "17px",
                fontWeight: "bold",
                color: "#111827",
                lineHeight: 1.5,
              }}
            >
              {item.value}
            </div>

            <p
              style={{
                margin: "8px 0 0 0",
                ...getBodyTextStyle(),
              }}
            >
              {item.helperText}
            </p>
          </div>
        ))}
      </div>

      {hotSeriesList.length === 0 ? (
        <p style={{ margin: 0, ...getBodyTextStyle() }}>
          このカテゴリの注目シリーズはまだありません。
        </p>
      ) : (
        <>
          <p
            style={{
              margin: 0,
              ...getBodyTextStyle(),
            }}
          >
            下のカードは、このカテゴリの中でまず見やすい候補です。気になるものがあれば詳細へ進み、広く見たいときはカテゴリ一覧へ移れます。
          </p>

          <div style={{ display: "grid", gap: "16px" }}>
            {hotSeriesList.map((series) => (
              <SeriesCard key={series.slug} series={series} />
            ))}
          </div>
        </>
      )}

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {hasText(href) ? (
          <ActionLinkButton href={href} variant="solid">
            このカテゴリ一覧を見る
          </ActionLinkButton>
        ) : null}

        {hasText(hotHref) ? (
          <ActionLinkButton href={hotHref} variant="outline">
            このカテゴリを注目順で見る
          </ActionLinkButton>
        ) : null}
      </div>
    </section>
  );
}