function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getDisplayText(value, fallback = "相場未登録") {
  if (!hasText(value)) {
    return fallback;
  }

  return value.trim();
}

function getToneStyle(trendLabel) {
  const text = getDisplayText(trendLabel, "").toLowerCase();

  if (text.includes("上昇")) {
    return {
      backgroundColor: "#fffbeb",
      borderColor: "#fde68a",
      labelColor: "#b45309",
      valueColor: "#92400e",
    };
  }

  if (text.includes("下落")) {
    return {
      backgroundColor: "#eff6ff",
      borderColor: "#bfdbfe",
      labelColor: "#1d4ed8",
      valueColor: "#1e3a8a",
    };
  }

  if (text.includes("横ばい")) {
    return {
      backgroundColor: "#f9fafb",
      borderColor: "#e5e7eb",
      labelColor: "#6b7280",
      valueColor: "#111827",
    };
  }

  return {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
    labelColor: "#6b7280",
    valueColor: "#111827",
  };
}

export default function TrendBadge({
  trendLabel = "",
  label = "相場",
  padding = "6px 10px",
  borderRadius = "999px",
  fontSize = "13px",
}) {
  const displayTrendLabel = getDisplayText(trendLabel);
  const toneStyle = getToneStyle(displayTrendLabel);

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
        {displayTrendLabel}
      </span>
    </span>
  );
}