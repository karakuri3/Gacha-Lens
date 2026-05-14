import Link from "next/link";
import { buildImportReviewReport } from "@/lib/data/import-review";
import { getDataModel } from "@/lib/series";

export const metadata = {
  title: "Import Review | Gacha Lens",
  description: "Review queue for unknown and review_required import records.",
};

export default function ImportReviewPage() {
  const dataModel = getDataModel();
  const issues = buildImportReviewReport(dataModel.importIssues ?? []);
  const unresolved = issues.filter((issue) => !issue.resolved);

  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">REVIEW</p>
          <h1 className="page-title">Import review queue</h1>
          <p className="page-lead">
            Unknown records stay visible here so market, X, restock, and stock data can be corrected by a human before they affect ranking logic.
          </p>
        </section>

        <div className="tag-row" style={{ marginBottom: 18 }}>
          <Link href="/api/import-issues" className="pill-link">JSON</Link>
          <Link href="/api/import-issues?format=csv" className="pill-link">CSV</Link>
        </div>

        <section className="grid grid--3" style={{ marginBottom: 18 }}>
          <ReviewMetric label="Open issues" value={unresolved.length} />
          <ReviewMetric label="Market review" value={issues.filter((issue) => issue.table === "market_listings").length} />
          <ReviewMetric label="Stock / restock" value={issues.filter((issue) => issue.table === "stock_reports" || issue.table === "restock_events").length} />
        </section>

        <section className="card review-panel">
          <div className="review-table">
            <div className="review-row review-row--head">
              <span>Table</span>
              <span>Type</span>
              <span>Record</span>
              <span>Raw</span>
              <span>Action</span>
            </div>
            {issues.map((issue) => (
              <div key={issue.id} className="review-row">
                <span>{issue.table}</span>
                <span>{issue.issueType}</span>
                <span>{issue.recordId || issue.source || "-"}</span>
                <span className="review-raw">{issue.rawTitle || "-"}</span>
                <span>{issue.suggestedAction}</span>
              </div>
            ))}
            {issues.length === 0 ? <div className="empty">No review issues.</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function ReviewMetric({ label, value }) {
  return (
    <div className="card metric">
      <div className="metric__label">{label}</div>
      <div className="metric__value is-highlight">{value}</div>
    </div>
  );
}
