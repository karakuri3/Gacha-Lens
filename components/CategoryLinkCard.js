import Link from "next/link";

export default function CategoryLinkCard({
  name,
  count,
  href,
  helperText = "",
  minWidth = "160px",
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-block",
        padding: "12px 16px",
        borderRadius: "12px",
        textDecoration: "none",
        border: "1px solid #d1d5db",
        backgroundColor: "#ffffff",
        color: "#111827",
        minWidth,
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: "16px" }}>{name}</div>

      <div
        style={{
          marginTop: "6px",
          fontSize: "14px",
          color: "#4b5563",
        }}
      >
        {count}件
      </div>

      {helperText ? (
        <div
          style={{
            marginTop: "8px",
            fontSize: "13px",
            color: "#6b7280",
          }}
        >
          {helperText}
        </div>
      ) : null}
    </Link>
  );
}