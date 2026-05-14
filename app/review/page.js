import Link from "next/link";
import { cookies } from "next/headers";
import { isReviewAuthConfigured, REVIEW_COOKIE_NAME, verifyReviewSession } from "@/lib/admin-auth";
import { buildImportReviewReport } from "@/lib/data/import-review";
import { getDataModel } from "@/lib/series";

export const metadata = {
  title: "Import Review | Gacha Lens",
  description: "Review queue for unknown and review_required import records.",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function ImportReviewPage() {
  const cookieStore = await cookies();
  const authenticated = verifyReviewSession(cookieStore.get(REVIEW_COOKIE_NAME)?.value);

  if (!authenticated) {
    return <ReviewLogin configured={isReviewAuthConfigured()} />;
  }

  const dataModel = await getDataModel();
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
          <form action="/review/logout" method="post">
            <button className="pill-link" type="submit">Logout</button>
          </form>
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

function ReviewLogin({ configured }) {
  return (
    <main className="site-main">
      <div className="site-shell">
        <section className="page-hero">
          <p className="eyebrow">ADMIN</p>
          <h1 className="page-title">Review access</h1>
          <p className="page-lead">
            Import issues are an internal queue. Enter the review token to inspect unknown and review_required records.
          </p>
        </section>

        <section className="card form-panel admin-login">
          {configured ? (
            <form action="/review/login" method="post" className="admin-login__form">
              <div className="field">
                <label htmlFor="review-token">Review token</label>
                <input id="review-token" name="token" type="password" autoComplete="current-password" required />
              </div>
              <button className="button-link button-link--dark" type="submit">Unlock review</button>
            </form>
          ) : (
            <div className="empty">
              REVIEW_ADMIN_TOKEN is not configured. Set it in the server environment before using the review queue.
            </div>
          )}
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
