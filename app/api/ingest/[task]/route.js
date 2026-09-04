export const dynamic = "force-dynamic";

export async function POST(request, context) {
  if (!isAuthorizedIngestionRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized ingestion endpoint" }, { status: 401 });
  }

  const { task } = await context.params;
  const taskName = String(task || "").trim();

  return Response.json({
    ok: false,
    task: taskName,
    error: "In-app ingestion execution has been retired from the web runtime.",
    executor: "github-actions",
    workflow: ".github/workflows/gacha-ingestion.yml",
    nextAction: "Run or inspect the Gacha ingestion GitHub Actions workflow. Scheduled ingestion is owned by GitHub Actions.",
  }, { status: 410 });
}

export async function GET() {
  return Response.json({
    ok: true,
    endpoint: "/api/ingest/[task]",
    execution: "retired-from-web-runtime",
    executor: "github-actions",
    workflow: ".github/workflows/gacha-ingestion.yml",
  });
}

function isAuthorizedIngestionRequest(request) {
  const expected = process.env.INGEST_CRON_TOKEN || process.env.REVIEW_ADMIN_TOKEN || "";
  if (!expected) return false;

  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const headerToken = request.headers.get("x-ingest-token") || "";
  const token = bearerToken || headerToken;
  return Boolean(token && token === expected);
}
