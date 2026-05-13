import SectionHeading from "./SectionHeading";
import SeriesCard from "./SeriesCard";
import ActionLinkButton from "./ActionLinkButton";

function getGuideItems(title, seriesCount) {
  const normalizedTitle = typeof title === "string" ? title : "";

  if (normalizedTitle.includes("発売が近い")) {
    return [
      {
        label: "向いている人",
        value: "新作を先に追いたい",
        helperText:
          "まず新しく出るシリーズから見たいときの入口です。",
      },
      {
        label: "並び方",
        value: "発売日が近い順",
        helperText:
          `表示中は ${seriesCount}件。今日以降の発売予定を優先して並べています。`,
      },
      {
        label: "次の見方",
        value: "気になるカードから詳細へ",
        helperText:
          "発売日・相場・再販などが気になるものから詳細へ進めます。",
      },
    ];
  }

  if (normalizedTitle.includes("注目シリーズ")) {
    return [
      {
        label: "向いている人",
        value: "どれを見るか迷っている",
        helperText:
          "まず今動いていそうなシリーズから入りたいときに向いています。",
      },
      {
        label: "並び方",
        value: "注目しやすい順",
        helperText:
          `表示中は ${seriesCount}件。自動判定や在庫・相場などをもとに見やすい順で並べています。`,
      },
      {
        label: "次の見方",
        value: "上の方から比較する",
        helperText:
          "上にあるシリーズほど入口として見やすい前提で並んでいます。",
      },
    ];
  }

  return [
    {
      label: "向いている人",
      value: "まず候補を見たい",
      helperText:
        "この欄から、今見やすい候補をまとめて確認できます。",
    },
    {
      label: "表示件数",
      value: `${seriesCount}件`,
      helperText: "このセクションに今出しているシリーズ数です。",
    },
    {
      label: "次の見方",
      value: "カードから詳細へ",
      helperText:
        "気になるものを見つけたら、そのまま詳細ページへ進めます。",
    },
  ];
}

function getGuideCardStyle() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "14px",
    backgroundColor: "#ffffff",
    boxSizing: "border-box",
  };
}

export default function SeriesShowcaseSection({
  title,
  description = "",
  actionHref = "",
  actionLabel = "",
  secondaryHref = "",
  secondaryLabel = "",
  seriesList = [],
  emptyMessage = "表示できるシリーズがまだありません。",
  marginTop = "32px",
}) {
  const guideItems = getGuideItems(title, seriesList.length);

  return (
    <section style={{ marginTop }}>
      <SectionHeading
        title={title}
        description={description}
        actionHref={actionHref}
        actionLabel={actionLabel}
      />

      <div
        style={{
          display: "grid",
          gap: "12px",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginTop: "16px",
        }}
      >
        {guideItems.map((item) => (
          <div key={`${item.label}-${item.value}`} style={getGuideCardStyle()}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: "bold",
                color: "#6b7280",
              }}
            >
              {item.label}
            </div>

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
                color: "#4b5563",
                lineHeight: 1.7,
              }}
            >
              {item.helperText}
            </p>
          </div>
        ))}
      </div>

      {seriesList.length === 0 ? (
        <p style={{ marginTop: "16px" }}>{emptyMessage}</p>
      ) : (
        <>
          <p
            style={{
              marginTop: "16px",
              marginBottom: 0,
              color: "#4b5563",
              lineHeight: 1.7,
            }}
          >
            下のカードは、ここで見たい目的に合わせてそのまま比較しやすいように並べています。
            気になるものがあれば、カード下の詳細導線から次へ進めます。
          </p>

          <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
            {seriesList.map((series) => (
              <SeriesCard key={series.slug} series={series} />
            ))}
          </div>

          {(actionHref && actionLabel) || (secondaryHref && secondaryLabel) ? (
            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: "16px",
              }}
            >
              {actionHref && actionLabel ? (
                <ActionLinkButton href={actionHref} variant="solid">
                  {actionLabel}
                </ActionLinkButton>
              ) : null}

              {secondaryHref && secondaryLabel ? (
                <ActionLinkButton href={secondaryHref} variant="outline">
                  {secondaryLabel}
                </ActionLinkButton>
              ) : null}

              <p
                style={{
                  margin: 0,
                  color: "#4b5563",
                  lineHeight: 1.7,
                }}
              >
                一覧ページに移ると、同じ流れのままさらに比較しやすくなります。
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}