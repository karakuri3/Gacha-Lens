export const dynamic = "force-dynamic";
export const revalidate = 0;

const rows = Array.from({ length: 240 }, (_, index) => index + 1);

export default function ColdServerDomDiagnosticPage() {
  return (
    <main>
      <h1>cold-server-dom-diagnostic</h1>
      <section>
        {rows.map((row) => (
          <article key={row}>
            <h2>Series {row}</h2>
            <p>Static server-rendered diagnostic row {row} for cold SSR timing.</p>
            <span>{row * 300}円</span>
          </article>
        ))}
      </section>
    </main>
  );
}
