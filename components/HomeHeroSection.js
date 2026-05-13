import ActionLinkButton from "./ActionLinkButton";
import StatCard from "./StatCard";

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getDisplayCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}件`;
  }

  return "未取得";
}

function normalizeGuideItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item) => hasText(item)).map((item) => item.trim());
}

function getHeroSurfaceStyle() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: "20px",
    padding: "24px",
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

function getGuideCardStyle() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: "#fafafa",
    boxSizing: "border-box",
  };
}

function getGuideIndexStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "32px",
    height: "32px",
    borderRadius: "999px",
    backgroundColor: "#111827",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: "bold",
    lineHeight: 1,
  };
}

export default function HomeHeroSection({
  title = "",
  description = "",
  totalSeriesCount = 0,
  featuredSeriesCount = 0,
  totalCategoryCount = 0,
  primaryHref = "",
  primaryLabel = "",
  secondaryHref = "",
  secondaryLabel = "",
  guideTitle = "",
  guideItems = [],
}) {
  const normalizedGuideItems = normalizeGuideItems(guideItems);

  return (
    <section
      style={{
        marginTop: "0",
        scrollMarginTop: "24px",
      }}
    >
      <div style={getHeroSurfaceStyle()}>
        <div
          style={{
            paddingBottom: "16px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <p style={{ margin: 0, ...getSectionLabelStyle() }}>
            ガチャ相場サイト
          </p>

          <h1
            style={{
              margin: "10px 0 0 0",
              fontSize: "36px",
              lineHeight: 1.3,
              color: "#111827",
              fontWeight: "bold",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h1>

          {hasText(description) ? (
            <p
              style={{
                margin: "14px 0 0 0",
                maxWidth: "860px",
                ...getBodyTextStyle(),
              }}
            >
              {description}
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "18px",
            }}
          >
            {hasText(primaryHref) && hasText(primaryLabel) ? (
              <ActionLinkButton href={primaryHref} variant="solid">
                {primaryLabel}
              </ActionLinkButton>
            ) : null}

            {hasText(secondaryHref) && hasText(secondaryLabel) ? (
              <ActionLinkButton href={secondaryHref} variant="outline">
                {secondaryLabel}
              </ActionLinkButton>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
            marginTop: "20px",
          }}
        >
          <StatCard
            label="登録シリーズ"
            value={getDisplayCount(totalSeriesCount)}
            helperText="今このサイトで見られるシリーズ数です。"
            minWidth="160px"
            backgroundColor="#fafafa"
          />
          <StatCard
            label="発売が近い候補"
            value={getDisplayCount(featuredSeriesCount)}
            helperText="新作を追いたいときの入口になる件数です。"
            minWidth="160px"
            backgroundColor="#fafafa"
          />
          <StatCard
            label="カテゴリ数"
            value={getDisplayCount(totalCategoryCount)}
            helperText="系統から探すときの入口数です。"
            minWidth="160px"
            backgroundColor="#fafafa"
          />
        </div>

        {normalizedGuideItems.length > 0 ? (
          <div style={{ marginTop: "20px" }}>
            <p style={{ margin: 0, ...getSectionLabelStyle() }}>
              {hasText(guideTitle) ? guideTitle : "はじめて使うときの見方"}
            </p>

            <div
              style={{
                display: "grid",
                gap: "12px",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                marginTop: "12px",
              }}
            >
              {normalizedGuideItems.map((item, index) => (
                <div key={`${index + 1}-${item}`} style={getGuideCardStyle()}>
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      alignItems: "flex-start",
                    }}
                  >
                    <span style={getGuideIndexStyle()}>{index + 1}</span>

                    <div
                      style={{
                        flex: 1,
                        color: "#111827",
                        fontWeight: "bold",
                        lineHeight: 1.7,
                      }}
                    >
                      {item}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}