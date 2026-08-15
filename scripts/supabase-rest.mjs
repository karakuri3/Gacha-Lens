export const SUPABASE_READ_DIAGNOSTIC_CATEGORIES = Object.freeze([
  "timeout",
  "network",
  "http_522",
  "http_5xx",
  "http_4xx",
  "invalid_response",
  "configuration",
  "unknown",
]);

export const SUPABASE_READ_RELIABILITY_CONTRACT = Object.freeze({
  timeout_ms: 5_000,
  max_attempts: 3,
  backoff_ms: Object.freeze([250, 500]),
});

export class SupabaseReadError extends Error {
  constructor(diagnostic) {
    super(`Supabase read failed: ${diagnostic?.category || "unknown"}.`);
    this.name = "SupabaseReadError";
    this.diagnostic = sanitizeReadDiagnostic(diagnostic);
  }
}

export async function upsertRows(table, rows, options = {}) {
  if (!rows.length) return;
  const label = options.label || "upsert";
  const batchSize = options.batchSize ?? 500;
  const allowSchemaFallback = options.allowSchemaFallback !== false;
  const batches = chunk(dedupeRowsById(rows), batchSize);

  for (let index = 0; index < batches.length; index += 1) {
    await upsertBatch(table, batches[index], {
      label,
      batch: `${index + 1}/${batches.length}`,
      allowSchemaFallback,
    });
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
    if (!options.allowSchemaFallback) throw new Error(`${table} strict upsert failed: ${message}`);
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

export async function fetchRowCount(table, params = {}) {
  const response = await fetch(restUrl(table, {
    ...params,
    select: "id",
    limit: "1",
  }), {
    method: "HEAD",
    headers: restHeaders({ Prefer: "count=exact" }),
  });
  if (!response.ok) throw new Error(`${table} count failed: ${await errorMessage(response)}`);
  const total = parseContentRangeTotal(response.headers.get("content-range"));
  if (!Number.isFinite(total)) throw new Error(`${table} count response is missing an exact total.`);
  return total;
}

export async function fetchRowsLimited(table, options = {}) {
  const maxRows = boundedInteger(options.maxRows, 1, 1_000, 100);
  const select = options.select ?? "*";
  const extraParams = options.params ?? {};
  if (!String(extraParams.order || "").trim()) {
    throw new SupabaseReadError(readDiagnostic({
      operationName: options.operationName || `${table}.bounded_rows`,
      category: "configuration",
    }));
  }

  const operationName = options.operationName || `${table}.bounded_rows`;
  const { response, diagnostic } = await performReliableSupabaseRead(({ fetchImpl, signal }) => fetchImpl(restUrl(table, {
    ...extraParams,
    select,
    limit: String(maxRows),
    offset: "0",
  }), {
    headers: restHeaders(),
    signal,
  }), {
    ...options,
    operationName,
  });

  let rows;
  try {
    rows = await response.json();
  } catch {
    throw invalidResponseError(diagnostic);
  }
  if (!Array.isArray(rows) || rows.length > maxRows) throw invalidResponseError(diagnostic);

  return {
    rows,
    max_rows: maxRows,
    rows_returned: rows.length,
    saturated: rows.length >= maxRows,
    request_count: diagnostic.attempt_count,
    diagnostic,
  };
}

export async function fetchExactRowCountReliable(table, params = {}, options = {}) {
  const operationName = options.operationName || `${table}.exact_count`;
  const { response, diagnostic } = await performReliableSupabaseRead(({ fetchImpl, signal }) => fetchImpl(restUrl(table, {
    ...params,
    select: "id",
    limit: "1",
  }), {
    method: "HEAD",
    headers: restHeaders({ Prefer: "count=exact" }),
    signal,
  }), {
    ...options,
    operationName,
  });
  const count = parseContentRangeTotal(response.headers.get("content-range"));
  if (!Number.isInteger(count) || count < 0) throw invalidResponseError(diagnostic);
  return { count, diagnostic };
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

async function performReliableSupabaseRead(request, options = {}) {
  const operationName = safeOperationName(options.operationName);
  const timeoutMs = boundedInteger(
    options.timeoutMs,
    1,
    SUPABASE_READ_RELIABILITY_CONTRACT.timeout_ms,
    SUPABASE_READ_RELIABILITY_CONTRACT.timeout_ms,
  );
  const maxAttempts = boundedInteger(
    options.maxAttempts,
    1,
    SUPABASE_READ_RELIABILITY_CONTRACT.max_attempts,
    SUPABASE_READ_RELIABILITY_CONTRACT.max_attempts,
  );
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleepImpl = options.sleepImpl ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  const nowImpl = options.nowImpl ?? Date.now;
  const startedAt = nowImpl();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await requestWithTimeout(request, fetchImpl, timeoutMs);
    } catch (error) {
      const category = classifyReadException(error);
      const diagnostic = readDiagnostic({
        operationName,
        category,
        attemptCount: attempt,
        durationMs: nowImpl() - startedAt,
      });
      if (!isTransientReadFailure(diagnostic) || attempt === maxAttempts) {
        throw new SupabaseReadError(diagnostic);
      }
      await sleepImpl(SUPABASE_READ_RELIABILITY_CONTRACT.backoff_ms[attempt - 1]);
      continue;
    }

    if (response?.ok === true) {
      return {
        response,
        diagnostic: readDiagnostic({
          operationName,
          category: null,
          statusCode: response.status,
          attemptCount: attempt,
          durationMs: nowImpl() - startedAt,
        }),
      };
    }

    const diagnostic = readDiagnostic({
      operationName,
      category: classifyHttpStatus(response?.status),
      statusCode: response?.status,
      attemptCount: attempt,
      durationMs: nowImpl() - startedAt,
    });
    if (!isTransientReadFailure(diagnostic) || attempt === maxAttempts) {
      throw new SupabaseReadError(diagnostic);
    }
    await sleepImpl(SUPABASE_READ_RELIABILITY_CONTRACT.backoff_ms[attempt - 1]);
  }

  throw new SupabaseReadError(readDiagnostic({ operationName, category: "unknown", attemptCount: maxAttempts }));
}

async function requestWithTimeout(request, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await request({ fetchImpl, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error("Supabase read timeout.");
      timeoutError.name = "AbortError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function classifyReadException(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError" || error?.code === "ETIMEDOUT") return "timeout";
  if (error?.code && ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH"].includes(error.code)) return "network";
  if (error?.cause?.code && ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH"].includes(error.cause.code)) return "network";
  if (error instanceof TypeError) return "network";
  if (error?.message === "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required") return "configuration";
  return "unknown";
}

function classifyHttpStatus(value) {
  const status = safeStatusCode(value);
  if (status === 522) return "http_522";
  if (status !== null && status >= 500) return "http_5xx";
  if (status !== null && status >= 400) return "http_4xx";
  return "unknown";
}

function isTransientReadFailure(diagnostic) {
  return ["timeout", "network", "http_522", "http_5xx"].includes(diagnostic.category)
    || [408, 429].includes(diagnostic.status_code);
}

function invalidResponseError(diagnostic) {
  return new SupabaseReadError({
    ...diagnostic,
    category: "invalid_response",
  });
}

function readDiagnostic({ operationName, category, statusCode, attemptCount = 0, durationMs = 0 }) {
  return sanitizeReadDiagnostic({
    operation_name: operationName,
    category,
    status_code: statusCode,
    attempt_count: attemptCount,
    duration_ms: durationMs,
  });
}

function sanitizeReadDiagnostic(value = {}) {
  return {
    operation_name: safeOperationName(value.operation_name),
    category: SUPABASE_READ_DIAGNOSTIC_CATEGORIES.includes(value.category) ? value.category : null,
    status_code: safeStatusCode(value.status_code),
    attempt_count: boundedInteger(value.attempt_count, 0, SUPABASE_READ_RELIABILITY_CONTRACT.max_attempts, 0),
    duration_ms: boundedInteger(value.duration_ms, 0, 300_000, 0),
  };
}

function safeOperationName(value) {
  const candidate = String(value || "supabase_read").toLowerCase();
  return /^[a-z][a-z0-9_.-]{0,79}$/.test(candidate) ? candidate : "supabase_read";
}

function safeStatusCode(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function boundedInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
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
