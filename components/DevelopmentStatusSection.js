import ContentSection from "./ContentSection";
import SectionHeading from "./SectionHeading";

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim());
}

function getPanelStyle() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
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

function getPanelHeadingStyle() {
  return {
    margin: "8px 0 0 0",
    fontSize: "20px",
    lineHeight: 1.45,
    fontWeight: "bold",
    color: "#111827",
  };
}

function getBodyTextStyle() {
  return {
    color: "#4b5563",
    lineHeight: 1.8,
  };
}

function getCountBadgeStyle(tone = "neutral") {
  if (tone === "success") {
    return {
      backgroundColor: "#f0fdf4",
      color: "#15803d",
      border: "1px solid #bbf7d0",
    };
  }

  if (tone === "info") {
    return {
      backgroundColor: "#eff6ff",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
    };
  }

  return {
    backgroundColor: "#f9fafb",
    color: "#374151",
    border: "1px solid #e5e7eb",
  };
}

function getListCardStyle() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "12px 14px",
    backgroundColor: "#fafafa",
    boxSizing: "border-box",
  };
}

function getIndexStyle(tone = "neutral") {
  if (tone === "success") {
    return {
      backgroundColor: "#15803d",
      color: "#ffffff",
    };
  }

  if (tone === "info") {
    return {
      backgroundColor: "#1d4ed8",
      color: "#ffffff",
    };
  }

  return {
    backgroundColor: "#111827",
    color: "#ffffff",
  };
}

function StatusListPanel({
  label,
  title,
  description,
  items,
  emptyMessage,
  countTone = "neutral",
  indexTone = "neutral",
}) {
  return (
    <div style={getPanelStyle()}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ margin: 0, ...getSectionLabelStyle() }}>{label}</p>
          <h3 style={getPanelHeadingStyle()}>{title}</h3>
        </div>

        <span
          style={{
            ...getCountBadgeStyle(countTone),
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "999px",
            padding: "6px 12px",
            fontSize: "13px",
            fontWeight: "bold",
            lineHeight: 1.4,
            whiteSpace: "nowrap",
          }}
        >
          {items.length}件
        </span>
      </div>

      <p
        style={{
          margin: "12px 0 0 0",
          ...getBodyTextStyle(),
        }}
      >
        {description}
      </p>

      {items.length > 0 ? (
        <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
          {items.map((item, index) => (
            <div key={`${index + 1}-${item}`} style={getListCardStyle()}>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    ...getIndexStyle(indexTone),
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "28px",
                    height: "28px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </span>

                <div
                  style={{
                    color: "#111827",
                    fontWeight: "bold",
                    lineHeight: 1.7,
                    paddingTop: "1px",
                  }}
                >
                  {item}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p
          style={{
            margin: "16px 0 0 0",
            ...getBodyTextStyle(),
          }}
        >
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

export default function DevelopmentStatusSection({
  availableItems = [],
  plannedItems = [],
}) {
  const normalizedAvailableItems = normalizeItems(availableItems);
  const normalizedPlannedItems = normalizeItems(plannedItems);

  return (
    <ContentSection marginTop="40px" backgroundColor="#fafafa">
      <SectionHeading
        title="開発状況"
        description="今できることと、これから強くしていく部分を最後にまとめています。サイトの完成度や次の伸びしろを、この場所で一目で確認できます。"
      />

      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          marginTop: "16px",
        }}
      >
        <StatusListPanel
          label="現在できること"
          title="もう使える機能"
          description="今すでに触れる機能です。入口・一覧・詳細の流れで、どこまで使えるかをまとめています。"
          items={normalizedAvailableItems}
          emptyMessage="まだ利用可能な項目はありません。"
          countTone="success"
          indexTone="success"
        />

        <StatusListPanel
          label="これから足すこと"
          title="今後の強化予定"
          description="次にどこを育てていくかの予定です。今後どんな方向に改善していくかをここで把握できます。"
          items={normalizedPlannedItems}
          emptyMessage="まだ今後の予定はありません。"
          countTone="info"
          indexTone="info"
        />
      </div>

      <p
        style={{
          marginTop: "16px",
          marginBottom: 0,
          color: "#4b5563",
          lineHeight: 1.8,
        }}
      >
        上の2つを見れば、今すぐ使える範囲と、これから便利になる方向をまとめて確認できます。
      </p>
    </ContentSection>
  );
}