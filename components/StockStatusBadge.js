function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getDisplayText(value, fallback = "店頭未登録") {
  if (!hasText(value)) {
    return fallback;
  }

  return value.trim();
}

function getToneStyle(status) {
  const text = getDisplayText(status, "").toLowerCase();

  if (text.includes("売り切れ") || text.includes("在庫なし")) {
    return {
      backgroundColor: "#fef2f2",
      borderColor: "#fecaca",
      labelColor: "#b91c1c",
      valueColor: "#991b1b",
    };
  }

  if (
    text.includes("少") ||
    text.includes("品薄") ||
    text.includes("残りわずか")
  ) {
    return {
      backgroundColor: "#fffbeb",
      borderColor: "#fde68a",
      labelColor: "#b45309",
      valueColor: "#92400e",
    };
  }

  if (text.includes("あり") || text.includes("在庫")) {
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

export default function StockStatusBadge({
  status = "",
  label = "店頭",
  padding = "6px 10px",
  borderRadius = "999px",
  fontSize = "13px",
}) {
  const displayStatus = getDisplayText(status);
  const toneStyle = getToneStyle(displayStatus);

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
        {displayStatus}
      </span>
    </span>
  );
}