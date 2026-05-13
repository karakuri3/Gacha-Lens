import Link from "next/link";

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getVariantStyle(variant) {
  if (variant === "outline") {
    return {
      backgroundColor: "#ffffff",
      color: "#111827",
      borderColor: "#d1d5db",
      boxShadow: "none",
    };
  }

  if (variant === "subtle") {
    return {
      backgroundColor: "#f9fafb",
      color: "#111827",
      borderColor: "#e5e7eb",
      boxShadow: "none",
    };
  }

  return {
    backgroundColor: "#111827",
    color: "#ffffff",
    borderColor: "#111827",
    boxShadow: "0 1px 2px rgba(17, 24, 39, 0.08)",
  };
}

export default function ActionLinkButton({
  href = "",
  children,
  variant = "solid",
  padding = "10px 14px",
  fontSize = "14px",
  borderRadius = "10px",
  minWidth = "",
  fullWidth = false,
  backgroundColor = "",
  color = "",
  borderColor = "",
  boxShadow = "",
  lineHeight = "1.4",
  target = "",
  rel = "",
}) {
  const variantStyle = getVariantStyle(variant);

  const resolvedBackgroundColor = hasText(backgroundColor)
    ? backgroundColor
    : variantStyle.backgroundColor;

  const resolvedColor = hasText(color) ? color : variantStyle.color;

  const resolvedBorderColor = hasText(borderColor)
    ? borderColor
    : variantStyle.borderColor;

  const resolvedBoxShadow = hasText(boxShadow)
    ? boxShadow
    : variantStyle.boxShadow;

  const sharedStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    textAlign: "center",
    padding,
    fontSize,
    fontWeight: "bold",
    lineHeight,
    borderRadius,
    border: `1px solid ${resolvedBorderColor}`,
    backgroundColor: resolvedBackgroundColor,
    color: resolvedColor,
    boxShadow: resolvedBoxShadow,
    boxSizing: "border-box",
    minHeight: "42px",
    width: fullWidth ? "100%" : "auto",
    minWidth: hasText(minWidth) ? minWidth : undefined,
    wordBreak: "break-word",
  };

  if (!hasText(href)) {
    return <span style={sharedStyle}>{children}</span>;
  }

  return (
    <Link
      href={href}
      target={hasText(target) ? target : undefined}
      rel={hasText(rel) ? rel : undefined}
      style={sharedStyle}
    >
      {children}
    </Link>
  );
}