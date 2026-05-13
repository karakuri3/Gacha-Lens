function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getDisplayText(value, fallback = "カテゴリ未設定") {
  if (!hasText(value)) {
    return fallback;
  }

  return value.trim();
}

function getToneStyle(category) {
  const text = getDisplayText(category, "").toLowerCase();

  if (
    text.includes("アニメ") ||
    text.includes("キャラ") ||
    text.includes("character")
  ) {
    return {
      backgroundColor: "#eff6ff",
      borderColor: "#bfdbfe",
      labelColor: "#1d4ed8",
      valueColor: "#1e3a8a",
    };
  }

  if (
    text.includes("ゲーム") ||
    text.includes("game") ||
    text.includes("ホビー")
  ) {
    return {
      backgroundColor: "#f0fdf4",
      borderColor: "#bbf7d0",
      labelColor: "#15803d",
      valueColor: "#166534",
    };
  }

  if (
    text.includes("どうぶつ") ||
    text.includes("動物") ||
    text.includes("animal") ||
    text.includes("生き物")
  ) {
    return {
      backgroundColor: "#fff7ed",
      borderColor: "#fed7aa",
      labelColor: "#c2410c",
      valueColor: "#9a3412",
    };
  }

  return {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
    labelColor: "#6b7280",
    valueColor: "#111827",
  };
}

export default function CategoryBadge({
  category = "",
  label = "カテゴリ",
  padding = "6px 10px",
  borderRadius = "999px",
  fontSize = "13px",
}) {
  const displayCategory = getDisplayText(category);
  const toneStyle = getToneStyle(displayCategory);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding,
        borderRadius,
        border: `1px solid ${toneStyle.borderColor}`,
        backgroundColor: toneStyle.backgroundColor,
        boxSizing: "border-box",
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          fontSize: "12px",
          fontWeight: "bold",
          color: toneStyle.labelColor,
          lineHeight: 1.4,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>

      <span
        style={{
          fontSize,
          fontWeight: "bold",
          color: toneStyle.valueColor,
          lineHeight: 1.4,
          wordBreak: "break-word",
        }}
      >
        {displayCategory}
      </span>
    </span>
  );
}