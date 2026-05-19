export async function upsertRows(table, rows, options = {}) {
  if (!rows.length) return;
  let safeRows = rows;
  const label = options.label || "upsert";

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

    safeRows = safeRows.map((row) => omitKey(row, missingColumn));
    console.warn(`[${label}] ${table}.${missingColumn} is not in the remote schema cache. Retrying without it.`);
  }

  throw new Error(`${table} upsert failed: too many schema fallback attempts`);
}

export async function fetchIdSet(table) {
  const response = await fetch(restUrl(table, { select: "id" }), {
    headers: restHeaders(),
  });

  if (!response.ok) {
    throw new Error(`${table} id fetch failed: ${await errorMessage(response)}`);
  }

  const data = await response.json();
  return new Set((data ?? []).map((row) => row.id).filter(Boolean));
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

function omitKey(row, key) {
  const next = { ...row };
  delete next[key];
  return next;
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
