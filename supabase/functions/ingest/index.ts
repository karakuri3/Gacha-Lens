const ALLOWED_TASKS = new Set(["official", "market", "x", "stock", "all"]);

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const task = normalizeTask(url);

  if (!ALLOWED_TASKS.has(task)) {
    return json({ ok: false, error: `Unknown task: ${task}` }, 404);
  }

  const cronSecret = Deno.env.get("CRON_SHARED_SECRET") || "";
  if (cronSecret) {
    const suppliedSecret = request.headers.get("x-cron-secret") || "";
    if (suppliedSecret !== cronSecret) {
      return json({ ok: false, error: "Unauthorized cron caller" }, 401);
    }
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
  const response = await fetch(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ingestToken}`,
      "content-type": "application/json",
      "x-ingest-source": "supabase-cron",
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
