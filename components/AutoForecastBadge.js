function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getDisplayText(value, fallback = "自動判定未設定") {
  if (!hasText(value)) {
    return fallback;
  }

  return value.trim();
}

function getToneStyle(level) {
  const normalizedLevel =
    typeof level === "string" ? level.trim().toLowerCase() : "";

  if (normalizedLevel === "high") {
    return {
      backgroundColor: "#fef2f2",
      borderColor: "#fecaca",
      labelColor: "#b91c1c",
      valueColor: "#991b1b",
    };
  }

  if (normalizedLevel === "medium") {
    return {
      backgroundColor: "#fffbeb",
      borderColor: "#fde68a",
      labelColor: "#b45309",
      valueColor: "#92400e",
    };
  }

  if (normalizedLevel === "low") {
    return {
      backgroundColor: "#f0fdf4",
      borderColor: "#bbf7d0",
      labelColor: "#15803d",
      valueColor: "#166534",
    };
  }

  return {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    labelColor: "#1d4ed8",
    valueColor: "#1e3a8a",
  };
}

export default function AutoForecastBadge({
  label = "",
  level = "",
  badgeLabel = "自動判定",
  padding = "6px 10px",
  borderRadius = "999px",
  fontSize = "13px",
}) {
  const displayLabel = getDisplayText(label);
  const toneStyle = getToneStyle(level);

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
        {badgeLabel}
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
        {displayLabel}
      </span>
    </span>
  );
}