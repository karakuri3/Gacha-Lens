export default function InfoRow({ label, value }) {
  return (
    <p style={{ margin: "0 0 8px 0" }}>
      <strong>{label}：</strong>
      {value}
    </p>
  );
}