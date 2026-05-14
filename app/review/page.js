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
  const groupedIssues = groupIssues(unresolved.length ? unresolved : issues);

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

        <section className="review-board">
          {groupedIssues.map(([group, groupIssues]) => (
            <div key={group} className="card review-group">
              <div className="review-group__head">
                <div>
                  <p className="eyebrow">{group}</p>
                  <h2>{groupIssues.length} issues</h2>
                </div>
                <span className="review-count">{groupIssues.filter((issue) => issue.priority === "high").length} high</span>
              </div>

              <div className="review-list">
                {groupIssues.map((issue) => (
                  <article key={issue.id} className={`review-item review-item--${issue.priority}`}>
                    <div className="review-item__top">
                      <span className={`review-priority review-priority--${issue.priority}`}>{issue.priority}</span>
                      <span>{issue.issueType}</span>
                      <span>{issue.table}</span>
                    </div>
                    <h3>{issue.rawTitle || issue.recordId || "No raw title"}</h3>
                    <dl className="review-meta">
                      <div>
                        <dt>Record</dt>
                        <dd>{issue.recordId || "-"}</dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>{issue.source || "-"}</dd>
                      </div>
                      <div>
                        <dt>Variant</dt>
                        <dd>{issue.rawVariantId || "-"}</dd>
                      </div>
                    </dl>
                    <p className="review-action">{issue.suggestedAction}</p>
                    {issue.sourceUrl ? <a className="review-source" href={issue.sourceUrl}>Source</a> : null}
                  </article>
                ))}
              </div>
            </div>
          ))}
          {issues.length === 0 ? <div className="card empty">No review issues.</div> : null}
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

function groupIssues(issues) {
  const order = ["Official master", "Market", "X reactions", "Stock", "Other"];
  const groups = issues.reduce((result, issue) => {
    const group = issue.group || "Other";
    if (!result.has(group)) result.set(group, []);
    result.get(group).push(issue);
    return result;
  }, new Map());

  return [...groups.entries()]
    .sort(([left], [right]) => order.indexOf(left) - order.indexOf(right))
    .map(([group, groupIssues]) => [
      group,
      groupIssues.sort((left, right) => priorityScore(left.priority) - priorityScore(right.priority)),
    ]);
}

function priorityScore(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 3;
}
