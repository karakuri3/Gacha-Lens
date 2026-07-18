const ALLOWED_TASKS = new Set(["official", "market", "x", "stock", "all"]);

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const task = normalizeTask(url);

  if (!ALLOWED_TASKS.has(task)) {
    return json({ ok: false, error: `Unknown task: ${task}` }, 404);
  }

  const cronSecret = Deno.env.get("CRON_SHARED_SECRET") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const adminIngestToken = Deno.env.get("ADMIN_INGEST_TOKEN") || "";
  const suppliedSecret = request.headers.get("x-cron-secret") || "";
  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const suppliedAdminToken = request.headers.get("x-admin-ingest-token") || "";
  const cronAuthorized = Boolean(cronSecret && suppliedSecret === cronSecret);
  const serviceRoleAuthorized = Boolean(serviceRoleKey && bearerToken === serviceRoleKey);
  const adminAuthorized = Boolean(adminIngestToken && suppliedAdminToken === adminIngestToken);
  if (!cronAuthorized && !serviceRoleAuthorized && !adminAuthorized) {
    return json({ ok: false, error: "Unauthorized ingestion caller" }, 401);
  }

  const baseUrl = Deno.env.get("APP_INGEST_BASE_URL") || "";
  const ingestToken = Deno.env.get("INGEST_CRON_TOKEN") || "";

  if (!baseUrl || !ingestToken) {
    return json({
      ok: false,
      error: "APP_INGEST_BASE_URL and INGEST_CRON_TOKEN are required",
    }, 500);
  }

  const target = `${baseUrl.replace(/\/$/, "")}/api/ingest/${task}`;
  const startedAt = new Date().toISOString();
  const providerHeaders = providerCredentialHeaders();
  const response = await fetch(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ingestToken}`,
      "content-type": "application/json",
      "x-ingest-source": "supabase-cron",
      ...providerHeaders,
    },
    body: JSON.stringify({
      task,
      source: "supabase-cron",
      startedAt,
    }),
  });

  const bodyText = await response.text();
  let body: unknown = bodyText;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }

  return json({
    ok: response.ok,
    task,
    status: response.status,
    startedAt,
    finishedAt: new Date().toISOString(),
    body,
  }, response.ok ? 200 : response.status);
});

function providerCredentialHeaders() {
  const mappings = [
    ["OFFICIAL_SOURCE_URLS", "x-provider-official-source-urls"],
    ["OFFICIAL_DETAIL_FETCH_LIMIT", "x-provider-official-detail-fetch-limit"],
    ["OFFICIAL_DETAIL_FETCH_DELAY_MS", "x-provider-official-detail-fetch-delay-ms"],
    ["OFFICIAL_TARTS_PAGES_PER_RUN", "x-provider-official-tarts-pages-per-run"],
    ["OFFICIAL_TARTS_MAX_PAGE", "x-provider-official-tarts-max-page"],
    ["MARKET_RAW_FEED_SOURCES_JSON", "x-provider-market-feed-sources"],
    ["STOCK_RAW_FEED_SOURCES_JSON", "x-provider-stock-feed-sources"],
    ["RAKUTEN_APPLICATION_ID", "x-provider-rakuten-application-id"],
    ["RAKUTEN_ACCESS_KEY", "x-provider-rakuten-access-key"],
    ["RAKUTEN_AFFILIATE_ID", "x-provider-rakuten-affiliate-id"],
    ["YAHOO_SHOPPING_APP_ID", "x-provider-yahoo-shopping-app-id"],
  ];
  return Object.fromEntries(mappings.flatMap(([envName, headerName]) => {
    const value = Deno.env.get(envName) || "";
    return value ? [[headerName, value]] : [];
  }));
}

function normalizeTask(url: URL) {
  const queryTask = url.searchParams.get("task");
  if (queryTask) return queryTask.trim();

  const parts = url.pathname.split("/").filter(Boolean);
  return parts.at(-1) === "ingest" ? "all" : parts.at(-1) || "all";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
