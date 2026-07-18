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
      env: providerEnvironment(request),
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

function providerEnvironment(request) {
  const mappings = [
    ["x-provider-official-source-urls", "OFFICIAL_SOURCE_URLS"],
    ["x-provider-official-detail-fetch-limit", "OFFICIAL_DETAIL_FETCH_LIMIT"],
    ["x-provider-official-detail-fetch-delay-ms", "OFFICIAL_DETAIL_FETCH_DELAY_MS"],
    ["x-provider-official-tarts-pages-per-run", "OFFICIAL_TARTS_PAGES_PER_RUN"],
    ["x-provider-official-tarts-max-page", "OFFICIAL_TARTS_MAX_PAGE"],
    ["x-provider-market-feed-sources", "MARKET_RAW_FEED_SOURCES_JSON"],
    ["x-provider-stock-feed-sources", "STOCK_RAW_FEED_SOURCES_JSON"],
    ["x-provider-rakuten-application-id", "RAKUTEN_APPLICATION_ID"],
    ["x-provider-rakuten-access-key", "RAKUTEN_ACCESS_KEY"],
    ["x-provider-rakuten-affiliate-id", "RAKUTEN_AFFILIATE_ID"],
    ["x-provider-yahoo-shopping-app-id", "YAHOO_SHOPPING_APP_ID"],
  ];
  const environment = {};
  for (const [headerName, envName] of mappings) {
    const value = request.headers.get(headerName) || "";
    if (value) environment[envName] = value;
  }
  if (environment.RAKUTEN_APPLICATION_ID && environment.RAKUTEN_ACCESS_KEY) {
    environment.RAKUTEN_MARKET_FETCH_ENABLED = "true";
  }
  if (environment.YAHOO_SHOPPING_APP_ID) {
    environment.YAHOO_SHOPPING_FETCH_ENABLED = "true";
  }
  return environment;
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
