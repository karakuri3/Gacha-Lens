import Link from "next/link";
import { cookies } from "next/headers";
import { isReviewAuthConfigured, REVIEW_COOKIE_NAME, verifyReviewSession } from "@/lib/admin-auth";
import { buildImportReviewReport } from "@/lib/data/import-review";
import { buildOpsHealthReport } from "@/lib/data/ops-health";
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
  const health = buildOpsHealthReport(dataModel);
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
          <Link href="/api/ops-health" className="pill-link">Health JSON</Link>
          <Link href="/api/import-issues" className="pill-link">JSON</Link>
          <Link href="/api/import-issues?format=csv" className="pill-link">CSV</Link>
          <form action="/review/logout" method="post">
            <button className="pill-link" type="submit">Logout</button>
          </form>
        </div>

        <section className="review-health card">
          <div className="review-health__head">
            <div>
              <p className="eyebrow">OPERATIONS</p>
              <h2>Operational health</h2>
              <p className="section-sub">
                Public pages read Supabase-backed data dynamically. Use this panel to catch stale or weak data before it affects ranking trust.
              </p>
            </div>
            <span className={`health-score health-score--${health.status}`}>
              {health.readinessScore} / 100
            </span>
          </div>

          <div className="health-grid">
            {health.pipelines.map((pipeline) => (
              <HealthCard key={pipeline.key} pipeline={pipeline} />
            ))}
          </div>

          {health.risks.length > 0 ? (
            <div className="risk-list">
              {health.risks.map((risk) => (
                <div key={risk.key} className={`risk-item risk-item--${risk.level}`}>
                  <strong>{risk.label}</strong>
                  <span>{risk.message}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card review-group" style={{ marginBottom: 18 }}>
          <div className="review-group__head">
            <div>
              <p className="eyebrow">RECENT RUNS</p>
              <h2>Ingestion history</h2>
            </div>
            <span className="review-count">latest {health.ingestionRuns.length}</span>
          </div>
          <div className="review-list">
            {health.ingestionRuns.map((run) => (
              <article key={run.id} className={`review-item review-item--${run.status === "failed" ? "high" : "low"}`}>
                <div className="review-item__top">
                  <span className={`review-priority review-priority--${run.status === "failed" ? "high" : "low"}`}>{run.status}</span>
                  <span>{run.task}</span>
                  <span>{run.trigger_source}</span>
                </div>
                <h3>{formatDateTime(run.started_at)}</h3>
                <p className="review-action">
                  {run.status === "failed" ? run.error_message || "No error message" : `${run.duration_ms ?? 0} ms`}
                </p>
              </article>
            ))}
            {health.ingestionRuns.length === 0 ? <div className="empty">Run history will appear after the schema migration and next ingestion.</div> : null}
          </div>
        </section>

        <section className="grid grid--3" style={{ marginBottom: 18 }}>
          <ReviewMetric label="Open issues" value={unresolved.length} />
          <ReviewMetric label="Market review" value={issues.filter((issue) => issue.table === "market_listings").length} />
          <ReviewMetric label="Stock / restock" value={issues.filter((issue) => issue.table === "stock_reports" || issue.table === "restock_events").length} />
          <ReviewMetric label="Community" value={issues.filter((issue) => issue.table === "community_reports").length} />
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
                    {issue.table === "community_reports" && !issue.resolved ? (
                      <div className="review-decisions">
                        <form action={`/api/review/community-reports/${issue.recordId}`} method="post">
                          <input type="hidden" name="decision" value="approved" />
                          <button className="button-link" type="submit">承認して反映</button>
                        </form>
                        <form action={`/api/review/community-reports/${issue.recordId}`} method="post">
                          <input type="hidden" name="decision" value="rejected" />
                          <button className="pill-link" type="submit">却下</button>
                        </form>
                      </div>
                    ) : null}
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

function HealthCard({ pipeline }) {
  return (
    <div className={`health-card health-card--${pipeline.status}`}>
      <div className="health-card__top">
        <strong>{pipeline.label}</strong>
        <span>{pipeline.status}</span>
      </div>
      <p>{pipeline.summary}</p>
      {pipeline.latestObservedAt ? <small>Latest: {formatDateTime(pipeline.latestObservedAt)}</small> : null}
      <dl className="health-metrics">
        {pipeline.metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
    </div>
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
  const order = ["Community submissions", "Official master", "Market", "X reactions", "Stock", "Other"];
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

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}
