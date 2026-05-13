function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getDisplayValue(value) {
  if (value === null || value === undefined) {
    return "未設定";
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue || "未設定";
  }

  return value;
}

function getAutoValueFontSize(value, fallbackSize) {
  if (hasText(fallbackSize)) {
    return fallbackSize;
  }

  const text = String(value ?? "");

  if (text.length >= 18) {
    return "18px";
  }

  if (text.length >= 12) {
    return "20px";
  }

  return "24px";
}

export default function FilterSummaryCard({
  label,
  value,
  helperText = "",
  minWidth = "180px",
  padding = "16px",
  borderRadius = "12px",
  backgroundColor = "#ffffff",
  borderColor = "#e5e7eb",
  labelColor = "#6b7280",
  valueColor = "#111827",
  helperColor = "#4b5563",
  valueFontSize = "",
}) {
  const displayValue = getDisplayValue(value);
  const displayFontSize = getAutoValueFontSize(displayValue, valueFontSize);

  return (
    <div
      style={{
        flex: `1 1 ${minWidth}`,
        minWidth,
        border: `1px solid ${borderColor}`,
        borderRadius,
        padding,
        backgroundColor,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "10px",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: "bold",
          color: labelColor,
          lineHeight: 1.5,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: displayFontSize,
          fontWeight: "bold",
          color: valueColor,
          lineHeight: 1.35,
          wordBreak: "break-word",
        }}
      >
        {displayValue}
      </div>

      {hasText(helperText) ? (
        <div
          style={{
            fontSize: "13px",
            color: helperColor,
            lineHeight: 1.7,
          }}
        >
          {helperText}
        </div>
      ) : null}
    </div>
  );
}