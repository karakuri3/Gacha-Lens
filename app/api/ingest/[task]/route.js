import { runIngestionSequence, runIngestionTask } from "@/lib/ingestion-runner";
import { buildOpsHealthReport } from "@/lib/data/ops-health";
import { getDataModel, invalidateRepositoryCache } from "@/lib/series";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, context) {
  const authorized = isAuthorizedIngestionRequest(request);
  if (!authorized) {
    return Response.json({ ok: false, error: "Unauthorized ingestion endpoint" }, { status: 401 });
  }

  const { task } = await context.params;
  const taskName = String(task || "").trim();

  try {
    const runnerOptions = {
      captureOutput: true,
      triggerSource: request.headers.get("x-ingest-source") || "api",
    };
    const result = taskName === "all"
      ? await runIngestionSequence(undefined, runnerOptions)
      : await runIngestionTask(taskName, runnerOptions);
    invalidateRepositoryCache();
    const health = buildOpsHealthReport(await getDataModel());

    return Response.json({
      ok: true,
      task: taskName,
      result,
      health: {
        status: health.status,
        readinessScore: health.readinessScore,
        records: health.records,
        risks: health.risks,
      },
    });
  } catch (error) {
    const status = error.code === "UNKNOWN_INGESTION_TASK" ? 404 : 500;
    return Response.json({
      ok: false,
      task: taskName,
      error: error.message,
      summary: error.summary ?? null,
    }, { status });
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    endpoint: "/api/ingest/[task]",
    method: "POST",
    tasks: ["official", "market", "x", "stock", "all"],
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
  return token && token === expected;
}
