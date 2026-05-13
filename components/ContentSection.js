function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isZeroSpacing(value) {
  if (!hasText(value)) {
    return false;
  }

  const normalizedValue = value.trim();

  return (
    normalizedValue === "0" ||
    normalizedValue === "0px" ||
    normalizedValue === "0rem" ||
    normalizedValue === "0em"
  );
}

export default function ContentSection({
  children,
  marginTop = "32px",
  backgroundColor = "",
  padding = "",
  borderRadius = "16px",
  borderColor = "",
  shadow = "none",
  id = "",
  scrollMarginTop = "24px",
}) {
  const hasBackground = hasText(backgroundColor) && backgroundColor !== "transparent";
  const hasBorder = hasText(borderColor);
  const hasCustomPadding = hasText(padding);
  const hasShadow = hasText(shadow) && shadow !== "none";

  const shouldUseSurface = hasBackground || hasBorder || hasCustomPadding || hasShadow;

  const resolvedPadding = hasCustomPadding
    ? padding
    : shouldUseSurface
      ? "20px"
      : "0";

  const hasVisiblePadding = !isZeroSpacing(resolvedPadding);

  const resolvedBorder = hasBorder
    ? `1px solid ${borderColor}`
    : hasBackground
      ? "1px solid #e5e7eb"
      : "none";

  const resolvedBorderRadius = hasVisiblePadding ? borderRadius : "0";

  if (!shouldUseSurface) {
    return (
      <section
        id={id || undefined}
        style={{
          marginTop,
          scrollMarginTop,
        }}
      >
        {children}
      </section>
    );
  }

  return (
    <section
      id={id || undefined}
      style={{
        marginTop,
        scrollMarginTop,
      }}
    >
      <div
        style={{
          padding: resolvedPadding,
          backgroundColor: hasBackground ? backgroundColor : "transparent",
          border: resolvedBorder,
          borderRadius: resolvedBorderRadius,
          boxShadow: hasShadow ? shadow : "none",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </section>
  );
}