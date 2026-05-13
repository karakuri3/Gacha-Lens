import { supabase } from "../../lib/supabase";

export default async function SupabaseSeriesPage() {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .order("release_order", { ascending: true });

  return (
    <main style={{ padding: "24px", fontFamily: "sans-serif" }}>
      <h1>Supabase の series テーブル確認</h1>

      {error ? (
        <pre style={{ color: "crimson", marginTop: "16px" }}>
          {error.message}
        </pre>
      ) : (
        <ul style={{ marginTop: "16px" }}>
          {data.map((series) => (
            <li key={series.id} style={{ marginBottom: "12px" }}>
              <strong>{series.name}</strong>
              <div>slug: {series.slug}</div>
              <div>発売日: {series.release_date}</div>
              <div>価格: {series.price}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}