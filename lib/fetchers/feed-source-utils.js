import fs from "node:fs";
import path from "node:path";

export function buildFeedSources({ legacyUrls, sourcesJson, defaultName, defaultSource }) {
  const legacySources = parseList(legacyUrls).map((url, index) => ({
    name: `${defaultName || "feed"}-${index + 1}`,
    source: defaultSource || "raw_feed",
    url,
  }));
  const jsonSources = parseSourcesJson(sourcesJson).map((source, index) => ({
    name: text(source.name) || `${defaultName || "feed"}-${legacySources.length + index + 1}`,
    source: text(source.source) || defaultSource || "raw_feed",
    method: text(source.method) || "GET",
    url: text(source.url),
    headers: objectValue(source.headers),
    headerEnv: objectValue(source.headerEnv || source.header_env),
    bearerTokenEnv: text(source.bearerTokenEnv || source.bearer_token_env),
    filePath: text(source.filePath || source.file_path || source.path),
    format: text(source.format || source.contentType || source.content_type).toLowerCase(),
    recordPath: text(source.recordPath || source.record_path),
    enabled: source.enabled !== false,
  }));

  return [...legacySources, ...jsonSources].filter((source) => source.enabled && (source.url || source.filePath));
}

export async function fetchJsonFeedSources(sources = [], options = {}) {
  const results = [];
  for (const source of sources) {
    results.push(await fetchJsonFeedSource(source, options));
  }
  return results;
}

export function extractRecordContainer(data, recordPath) {
  if (!recordPath) return data;
  return recordPath.split(".").filter(Boolean).reduce((value, key) => {
    if (Array.isArray(value) && /^\d+$/.test(key)) return value[Number(key)];
    return value?.[key];
  }, data);
}

export function createFetchIssue(prefix, source, message, tableName = "import_issues") {
  return {
    id: stableId(prefix, source.source, source.name, source.url, message),
    issue_type: `${prefix}_review`,
    table_name: tableName,
    source: source.name || source.source || prefix,
    source_url: source.url || source.filePath || "",
    resolved: false,
    note: message,
    raw: {
      source: source.source,
      source_name: source.name,
      source_url: source.url || source.filePath || "",
      message,
    },
  };
}

export function summarizeFeedResults(results = []) {
  return results.map((result) => ({
    name: result.source?.name || "",
    source: result.source?.source || "",
    url: result.source?.url || result.source?.filePath || "",
    format: result.source?.format || "",
    ok: Boolean(result.ok),
    status: result.status ?? null,
    message: result.message || "",
  }));
}

export function parseList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[\n,]/).map(text).filter(Boolean);
}

export function text(value) {
  return value == null ? "" : String(value).trim();
}

export function stableId(...parts) {
  return parts
    .filter(Boolean)
    .map((part) => String(part).toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, "-"))
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
}

async function fetchJsonFeedSource(source, options = {}) {
  const timeoutMs = number(options.timeoutMs ?? process.env.FEED_FETCH_TIMEOUT_MS) ?? 12000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const loaded = source.filePath
      ? await readLocalFeedSource(source)
      : await fetchRemoteFeedSource(source, options, controller.signal);
    const data = parseFeedPayload(loaded.textBody, {
      contentType: loaded.contentType,
      format: source.format,
      url: source.url || source.filePath,
    });

    if (!loaded.ok) {
      return {
        ok: false,
        source,
        status: loaded.status,
        message: data.detail || data.title || data.message || loaded.message || `HTTP ${loaded.status}`,
      };
    }

    return {
      ok: true,
      source,
      status: loaded.status,
      data: extractRecordContainer(data, source.recordPath),
      rawData: data,
    };
  } catch (error) {
    return {
      ok: false,
      source,
      status: null,
      message: error.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRemoteFeedSource(source, options, signal) {
  const response = await fetch(source.url, {
    method: source.method || "GET",
    headers: buildHeaders(source, options),
    signal,
  });
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    textBody: await response.text(),
    message: response.ok ? "" : `HTTP ${response.status}`,
  };
}

async function readLocalFeedSource(source) {
  const resolvedPath = resolveLocalFeedPath(source.filePath);
  return {
    ok: true,
    status: 200,
    contentType: guessContentType(source.filePath, source.format),
    textBody: await fs.promises.readFile(resolvedPath, "utf8"),
    message: "",
  };
}

function parseFeedPayload(textBody, source) {
  const body = textBody || "";
  if (isCsvSource(source)) return parseCsvRecords(body);
  return body ? JSON.parse(body) : {};
}

export function parseCsvRecords(body) {
  const rows = parseCsvRows(String(body ?? "").replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => text(header));
  return rows.slice(1)
    .filter((row) => row.some((value) => text(value)))
    .map((row) => headers.reduce((record, header, index) => {
      if (header) record[header] = text(row[index]);
      return record;
    }, {}));
}

function parseCsvRows(body) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const next = body[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function resolveLocalFeedPath(filePath) {
  const workspace = process.cwd();
  const resolved = path.resolve(workspace, filePath);
  if (resolved !== workspace && !resolved.startsWith(`${workspace}${path.sep}`)) {
    throw new Error(`Local feed path must stay inside the project workspace: ${filePath}`);
  }
  return resolved;
}

function isCsvSource(source) {
  const format = text(source.format).toLowerCase();
  const contentType = text(source.contentType).toLowerCase();
  const url = text(source.url).toLowerCase();
  return format === "csv" || contentType.includes("csv") || url.endsWith(".csv");
}

function guessContentType(filePath, format) {
  if (text(format).toLowerCase() === "csv" || text(filePath).toLowerCase().endsWith(".csv")) return "text/csv";
  return "application/json";
}

function buildHeaders(source, options = {}) {
  const headers = {
    accept: "application/json",
    "user-agent": options.userAgent || "GachaLensBot/0.2 (+approved-feed)",
    ...(objectValue(options.headers)),
    ...(objectValue(source.headers)),
  };

  for (const [headerName, envName] of Object.entries(objectValue(source.headerEnv))) {
    const value = process.env[envName];
    if (value) headers[headerName] = value;
  }

  if (source.bearerTokenEnv && process.env[source.bearerTokenEnv]) {
    headers.authorization = `Bearer ${process.env[source.bearerTokenEnv]}`;
  }

  return headers;
}

function parseSourcesJson(value) {
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.sources)) return parsed.sources;
    return [];
  } catch {
    return [];
  }
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
