import ProductImage from "@/components/ProductImage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const rows = Array.from({ length: 60 }, (_, index) => index + 1);

export default function ColdClientImagesDiagnosticPage() {
  return (
    <main>
      <h1>cold-client-images-diagnostic</h1>
      <section>
        {rows.map((row) => (
          <article key={row}>
            <div style={{ position: "relative", width: 120, height: 120 }}>
              <ProductImage
                src="/brand/gacha-lens-mark.png"
                imageScope="series"
                alt={`Diagnostic image ${row}`}
                sizes="120px"
              />
            </div>
            <h2>Image card {row}</h2>
          </article>
        ))}
      </section>
    </main>
  );
}
