export const dynamic = "force-dynamic";
export const revalidate = 0;

const PREVIEW_HOST_SUFFIX = ".workers.dev";

const SIGNALS = Object.freeze({
  branded_error_text: "商品情報を取得できません",
  data_source_error_name: "DataSourceError",
  data_query_failed: "DATA_QUERY_FAILED",
  data_source_unavailable: "DATA_SOURCE_UNAVAILABLE",
  data_source_config_error: "DATA_SOURCE_CONFIG_ERROR",
  public_query_message: "Product data could not be retrieved.",
  public_unavailable_message: "The product data service is temporarily unavailable.",
  public_config_message: "Data source configuration is unavailable.",
  react_stream_error_marker: "$RX(",
  next_flight_push: "self.__next_f.push",
  digest_key: "digest",
  next_error_token: "NEXT_ERROR",
});

function countOccurrences(body, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const next = body.indexOf(needle, offset);
    if (next === -1) return count;
    count += 1;
    offset = next + needle.length;
  }
}

function summarize(body) {
  return Object.fromEntries(
    Object.entries(SIGNALS).map(([key, needle]) => [key, countOccurrences(body, needle)])
  );
}

async function inspectPath(origin, pathname) {
  const response = await fetch(new URL(pathname, origin), {
    method: "GET",
    headers: {
      accept: "text/html",
      "user-agent": "gacha-lens-p0-281-wire-probe",
    },
    cache: "no-store",
  });
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const body = contentType.includes("text/html") ? await response.text() : "";

  return {
    status: response.status,
    content_type: contentType,
    body_length: body.length,
    signals: summarize(body),
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  if (!url.hostname.endsWith(PREVIEW_HOST_SUFFIX)) {
    return Response.json({ ok: false, error: "preview_only" }, { status: 404 });
  }

  const origin = url.origin;
  const [degraded, healthy] = await Promise.all([
    inspectPath(origin, "/"),
    inspectPath(origin, "/privacy"),
  ]);

  return Response.json({
    probe: "p0-281-wire-v1",
    degraded_path: degraded,
    healthy_path: healthy,
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
