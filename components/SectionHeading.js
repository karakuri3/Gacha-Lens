import Link from "next/link";

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

export default function SectionHeading({
  title,
  description = "",
  actionHref = "",
  actionLabel = "",
  marginBottom = "16px",
  titleFontSize = "28px",
  titleColor = "#111827",
  descriptionColor = "#4b5563",
}) {
  const showAction = hasText(actionHref) && hasText(actionLabel);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "16px",
        flexWrap: "wrap",
        marginBottom,
        paddingBottom: "12px",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          flex: "1 1 420px",
          minWidth: "280px",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: titleFontSize,
            lineHeight: 1.35,
            color: titleColor,
            fontWeight: "bold",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>

        {hasText(description) ? (
          <p
            style={{
              margin: "10px 0 0 0",
              color: descriptionColor,
              fontSize: "15px",
              lineHeight: 1.8,
              maxWidth: "720px",
            }}
          >
            {description}
          </p>
        ) : null}
      </div>

      {showAction ? (
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "flex-start",
          }}
        >
          <Link
            href={actionHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              whiteSpace: "nowrap",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              color: "#111827",
              fontSize: "14px",
              fontWeight: "bold",
              lineHeight: 1.4,
            }}
          >
            {actionLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}