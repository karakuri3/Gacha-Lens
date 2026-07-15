export async function upsertRows(table, rows, options = {}) {
  if (!rows.length) return;
  const label = options.label || "upsert";
  const batchSize = options.batchSize ?? 500;
  const batches = chunk(dedupeRowsById(rows), batchSize);

  for (let index = 0; index < batches.length; index += 1) {
    await upsertBatch(table, batches[index], { label, batch: `${index + 1}/${batches.length}` });
  }
}

async function upsertBatch(table, rows, options = {}) {
  let safeRows = rows;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const response = await fetch(restUrl(table, { on_conflict: "id" }), {
      method: "POST",
      headers: restHeaders({
        Prefer: "resolution=merge-duplicates",
      }),
      body: JSON.stringify(safeRows),
    });

    if (response.ok) return;

    const message = await errorMessage(response);
    const missingColumn = parseMissingColumn(message);
    if (!missingColumn) throw new Error(`${table} upsert failed: ${message}`);

    safeRows = dedupeRowsById(safeRows.map((row) => omitKey(row, missingColumn)));
    console.warn(`[${options.label}] ${table}.${missingColumn} is not in the remote schema cache (${options.batch}). Retrying without it.`);
  }

  throw new Error(`${table} upsert failed: too many schema fallback attempts`);
}

export async function fetchIdSet(table) {
  const data = await fetchRows(table, { select: "id" });
  return new Set((data ?? []).map((row) => row.id).filter(Boolean));
}

export async function fetchRows(table, options = {}) {
  const pageSize = options.pageSize ?? 1000;
  const select = options.select ?? "*";
  const extraParams = options.params ?? {};
  const firstResponse = await fetch(restUrl(table, {
    ...extraParams,
    select,
    limit: String(pageSize),
    offset: "0",
  }), {
    headers: restHeaders({ Prefer: "count=exact" }),
  });
  if (!firstResponse.ok) throw new Error(`${table} fetch failed: ${await errorMessage(firstResponse)}`);

  const rows = await firstResponse.json();
  const total = parseContentRangeTotal(firstResponse.headers.get("content-range")) ?? rows.length;
  if (total <= pageSize) return rows;

  const requests = [];
  for (let offset = pageSize; offset < total; offset += pageSize) {
    requests.push(fetch(restUrl(table, {
      ...extraParams,
      select,
      limit: String(pageSize),
      offset: String(offset),
    }), {
      headers: restHeaders(),
    }));
  }
  const responses = await Promise.all(requests);
  for (const response of responses) {
    if (!response.ok) throw new Error(`${table} fetch failed: ${await errorMessage(response)}`);
    rows.push(...((await response.json()) ?? []));
  }
  return rows;
}

export async function deleteRowsByIds(table, ids, options = {}) {
  const safeIds = [...new Set(ids.filter(Boolean))];
  for (const batch of chunk(safeIds, options.batchSize ?? 80)) {
    const response = await fetch(restUrl(table, {
      id: `in.(${batch.map(escapeInValue).join(",")})`,
    }), {
      method: "DELETE",
      headers: restHeaders(),
    });
    if (!response.ok) throw new Error(`${table} delete failed: ${await errorMessage(response)}`);
  }
  return safeIds.length;
}

export async function fetchIdSetSafe(table, label = "upsert") {
  try {
    return await fetchIdSet(table);
  } catch (error) {
    console.warn(`[${label}] Could not read ${table}. References will be sent to review: ${error.message}`);
    return new Set();
  }
}

export async function deleteOfficialVariantsBySeriesIds(seriesIds) {
  if (!seriesIds.length) return;

  for (const batch of chunk(seriesIds, 80)) {
    const response = await fetch(restUrl("variants", {
      source_type: "eq.official_site",
      series_id: `in.(${batch.map(escapeInValue).join(",")})`,
    }), {
      method: "DELETE",
      headers: restHeaders(),
    });

    if (!response.ok) {
      throw new Error(`variants replace failed: ${await errorMessage(response)}`);
    }
  }
}

function restUrl(table, params = {}) {
  const { supabaseUrl } = getConfig();
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function restHeaders(extra = {}) {
  const { serviceRoleKey } = getConfig();
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
    ...extra,
  };
}

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  return { supabaseUrl, serviceRoleKey };
}

async function errorMessage(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || text;
  } catch {
    return text || response.statusText;
  }
}

function parseMissingColumn(message = "") {
  return message.match(/Could not find the '([^']+)' column/)?.[1] ?? "";
}

function parseContentRangeTotal(value = "") {
  const total = Number(String(value).split("/").pop());
  return Number.isFinite(total) ? total : null;
}

function omitKey(row, key) {
  const next = { ...row };
  delete next[key];
  return next;
}

function dedupeRowsById(rows) {
  return [...new Map(rows.filter(Boolean).map((row) => [row.id ?? JSON.stringify(row), row])).values()];
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function escapeInValue(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}
