export default function SectionBox({ title, children }) {
  return (
    <section
      style={{
        border: "1px solid #ccc",
        padding: "16px",
        marginTop: "24px",
        borderRadius: "8px",
      }}
    >
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
}