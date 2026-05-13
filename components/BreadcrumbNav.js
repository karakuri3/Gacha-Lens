import Link from "next/link";
import ActionLinkButton from "./ActionLinkButton";

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        hasText(item.label)
    )
    .map((item) => ({
      label: item.label.trim(),
      href: hasText(item.href) ? item.href.trim() : "",
    }));
}

function getSurfaceStyle() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    padding: "16px",
    backgroundColor: "#fafafa",
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

function getBreadcrumbItemStyle(isCurrent) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    padding: "6px 10px",
    borderRadius: "999px",
    border: `1px solid ${isCurrent ? "#d1d5db" : "#e5e7eb"}`,
    backgroundColor: isCurrent ? "#ffffff" : "#f9fafb",
    color: isCurrent ? "#111827" : "#374151",
    fontSize: "13px",
    fontWeight: "bold",
    lineHeight: 1.4,
    boxSizing: "border-box",
    wordBreak: "break-word",
  };
}

export default function BreadcrumbNav({
  items = [],
  primaryActionHref = "",
  primaryActionLabel = "",
  secondaryActionHref = "",
  secondaryActionLabel = "",
  marginBottom = "20px",
}) {
  const normalizedItems = normalizeItems(items);

  return (
    <nav
      aria-label="パンくず"
      style={{
        marginBottom,
      }}
    >
      <div style={getSurfaceStyle()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 420px", minWidth: "280px" }}>
            <p style={{ margin: 0, ...getSectionLabelStyle() }}>ページの位置</p>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: "10px",
              }}
            >
              {normalizedItems.map((item, index) => {
                const isLast = index === normalizedItems.length - 1;

                return (
                  <div
                    key={`${item.label}-${index}`}
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    {item.href && !isLast ? (
                      <Link href={item.href} style={getBreadcrumbItemStyle(false)}>
                        {item.label}
                      </Link>
                    ) : (
                      <span style={getBreadcrumbItemStyle(true)}>{item.label}</span>
                    )}

                    {!isLast ? (
                      <span
                        style={{
                          color: "#9ca3af",
                          fontSize: "13px",
                          fontWeight: "bold",
                          lineHeight: 1,
                        }}
                      >
                        &gt;
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {(hasText(primaryActionHref) && hasText(primaryActionLabel)) ||
          (hasText(secondaryActionHref) && hasText(secondaryActionLabel)) ? (
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {hasText(primaryActionHref) && hasText(primaryActionLabel) ? (
                <ActionLinkButton href={primaryActionHref} variant="solid">
                  {primaryActionLabel}
                </ActionLinkButton>
              ) : null}

              {hasText(secondaryActionHref) && hasText(secondaryActionLabel) ? (
                <ActionLinkButton href={secondaryActionHref} variant="outline">
                  {secondaryActionLabel}
                </ActionLinkButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}