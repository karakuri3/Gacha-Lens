function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getDisplayText(value, fallback = "予想未設定") {
  if (!hasText(value)) {
    return fallback;
  }

  return value.trim();
}

function getToneStyle(forecast) {
  const text = getDisplayText(forecast, "").toLowerCase();

  if (
    text.includes("高") ||
    text.includes("早い") ||
    text.includes("注意") ||
    text.includes("売り切れ")
  ) {
    return {
      backgroundColor: "#fef2f2",
      borderColor: "#fecaca",
      labelColor: "#b91c1c",
      valueColor: "#991b1b",
    };
  }

  if (
    text.includes("中") ||
    text.includes("やや") ||
    text.includes("注目")
  ) {
    return {
      backgroundColor: "#fffbeb",
      borderColor: "#fde68a",
      labelColor: "#b45309",
      valueColor: "#92400e",
    };
  }

  if (
    text.includes("低") ||
    text.includes("落ち着") ||
    text.includes("安定")
  ) {
    return {
      backgroundColor: "#f0fdf4",
      borderColor: "#bbf7d0",
      labelColor: "#15803d",
      valueColor: "#166534",
    };
  }

  return {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
    labelColor: "#6b7280",
    valueColor: "#111827",
  };
}

export default function ForecastBadge({
  forecast = "",
  label = "売り切れ予想",
  padding = "6px 10px",
  borderRadius = "999px",
  fontSize = "13px",
}) {
  const displayForecast = getDisplayText(forecast);
  const toneStyle = getToneStyle(displayForecast);

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
        {displayForecast}
      </span>
    </span>
  );
}