import { classifyPublicRoute, PUBLIC_DIAGNOSTIC_PATHS } from "./route-contract.js";

// Phase A3 exact-head Preview verification anchor v4; no runtime behavior change.
const RELEASE_SOURCE_SHA = "__GACHA_RELEASE_SOURCE_SHA__";
const SHA_RE = /^[0-9a-f]{40}$/;
const APP_RELEASE_SOURCE_PATH = "/api/runtime-diagnostics/release-source";
const APP_REPRESENTATIVE_PATH = "/review";
const APP_PREVIEW_OVERRIDE_HEADER = "x-gacha-a6-app-preview-origin";
const APP_PREVIEW_HOST_RE = /^[a-z0-9-]+-gacha-lens\.senpingxingzuo\.workers\.dev$/;
const PUBLIC_PREVIEW_HOST_RE = /^[a-z0-9-]+-gacha-lens-public\.senpingxingzuo\.workers\.dev$/;
const INTERNAL_ORIGIN = "https://gacha-lens.internal";

function releaseSourceSha() {
  return SHA_RE.test(RELEASE_SOURCE_SHA) ? RELEASE_SOURCE_SHA : null;
}

function jsonResponse(request, value, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  return new Response(request.method === "HEAD" ? null : JSON.stringify(value), { status, headers });
}

function methodGuard(request) {
  if (request.method === "GET" || request.method === "HEAD") return null;
  return jsonResponse(request, { error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" });
}

function validatedAppPreviewOrigin(request) {
  const incoming = new URL(request.url);
  if (!PUBLIC_PREVIEW_HOST_RE.test(incoming.hostname)) return null;

  const raw = String(request.headers.get(APP_PREVIEW_OVERRIDE_HEADER) || "").trim();
  if (!raw) return null;

  let target;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  if (
    target.protocol !== "https:"
    || target.username
    || target.password
    || target.port
    || target.pathname !== "/"
    || target.search
    || target.hash
    || !APP_PREVIEW_HOST_RE.test(target.hostname)
  ) {
    return null;
  }
  return target.origin;
}

function fixedAppRequest(pathname, previewOrigin = null) {
  const target = new URL(pathname, previewOrigin || INTERNAL_ORIGIN);
  return new Request(target, {
    method: "GET",
    headers: {
      Accept: pathname === APP_RELEASE_SOURCE_PATH
        ? "application/json"
        : "text/html,application/xhtml+xml",
      "User-Agent": "GachaLens-PublicWorker-A6",
    },
  });
}

async function fetchApp(request, env, targetRequest, previewOrigin = null) {
  if (previewOrigin) return fetch(targetRequest);
  if (!env?.APP || typeof env.APP.fetch !== "function") {
    return null;
  }
  return env.APP.fetch(targetRequest);
}

async function readAppSourceSha(request, env) {
  const previewOrigin = validatedAppPreviewOrigin(request);
  if (!previewOrigin && (!env?.APP || typeof env.APP.fetch !== "function")) {
    return { ok: false, status: 503, error: "app_binding_unavailable", sourceSha: null, previewOrigin: null };
  }
  const response = await fetchApp(request, env, fixedAppRequest(APP_RELEASE_SOURCE_PATH, previewOrigin), previewOrigin);
  if (!response) {
    return { ok: false, status: 503, error: "app_binding_unavailable", sourceSha: null, previewOrigin };
  }
  if (response.status !== 200) {
    return { ok: false, status: 502, error: "app_source_identity_http_failure", sourceSha: null, previewOrigin };
  }
  const payload = await response.json().catch(() => null);
  const sourceSha = String(payload?.source_sha || "").trim().toLowerCase();
  if (!SHA_RE.test(sourceSha)) {
    return { ok: false, status: 502, error: "app_source_identity_invalid", sourceSha: null, previewOrigin };
  }
  return { ok: true, status: 200, error: null, sourceSha, previewOrigin };
}

async function assertAppExactSha(request, env) {
  const ownSha = releaseSourceSha();
  if (!ownSha) return { ok: false, response: jsonResponse(request, { error: "public_source_identity_unavailable" }, 503) };
  const appIdentity = await readAppSourceSha(request, env);
  if (!appIdentity.ok) {
    return {
      ok: false,
      response: jsonResponse(request, {
        ok: false,
        public_source_sha: ownSha,
        app_source_sha: appIdentity.sourceSha,
        error: appIdentity.error,
      }, appIdentity.status),
    };
  }
  if (appIdentity.sourceSha !== ownSha) {
    return {
      ok: false,
      response: jsonResponse(request, {
        ok: false,
        public_source_sha: ownSha,
        app_source_sha: appIdentity.sourceSha,
        error: "mixed_source_sha",
      }, 409),
    };
  }
  return { ok: true, ownSha, appSha: appIdentity.sourceSha, previewOrigin: appIdentity.previewOrigin };
}

async function appDelegationDiagnostic(request, env) {
  const integrity = await assertAppExactSha(request, env);
  if (!integrity.ok) return integrity.response;

  const representative = await fetchApp(
    request,
    env,
    fixedAppRequest(APP_REPRESENTATIVE_PATH, integrity.previewOrigin),
    integrity.previewOrigin,
  );
  if (!representative) {
    return jsonResponse(request, {
      ok: false,
      public_source_sha: integrity.ownSha,
      app_source_sha: integrity.appSha,
      error: "app_binding_unavailable",
    }, 503);
  }
  const representativeBody = representative.status === 200
    ? await representative.clone().text()
    : "";
  const representativeOk = representative.status === 200 && representativeBody.includes("Review access");

  return jsonResponse(request, {
    ok: representativeOk,
    public_source_sha: integrity.ownSha,
    app_source_sha: integrity.appSha,
    representative: {
      path: APP_REPRESENTATIVE_PATH,
      status: representative.status,
      marker: representativeOk,
    },
    error: representativeOk ? null : "app_representative_route_failed",
  }, representativeOk ? 200 : 502);
}

function rewriteDelegatedLocation(headers, incoming) {
  const location = headers.get("location");
  if (!location) return;
  let target;
  try {
    target = new URL(location, INTERNAL_ORIGIN);
  } catch {
    return;
  }
  if (target.origin !== INTERNAL_ORIGIN) return;
  target.protocol = incoming.protocol;
  target.host = incoming.host;
  headers.set("location", target.toString());
}

async function delegateAppOwned(request, env) {
  const integrity = await assertAppExactSha(request, env);
  if (!integrity.ok) return integrity.response;

  const incoming = new URL(request.url);
  const target = integrity.previewOrigin
    ? new URL(incoming.pathname + incoming.search, integrity.previewOrigin)
    : new URL(incoming.pathname + incoming.search, INTERNAL_ORIGIN);
  const forwarded = new Request(target, request);
  forwarded.headers.delete(APP_PREVIEW_OVERRIDE_HEADER);

  const response = await fetchApp(request, env, forwarded, integrity.previewOrigin);
  if (!response) return jsonResponse(request, { error: "app_binding_unavailable" }, 503);

  const headers = new Headers(response.headers);
  if (integrity.previewOrigin) {
    const location = headers.get("location");
    if (location) {
      let redirectTarget;
      try {
        redirectTarget = new URL(location, integrity.previewOrigin);
      } catch {
        redirectTarget = null;
      }
      if (redirectTarget?.origin === integrity.previewOrigin) {
        redirectTarget.protocol = incoming.protocol;
        redirectTarget.host = incoming.host;
        headers.set("location", redirectTarget.toString());
      } else {
        rewriteDelegatedLocation(headers, incoming);
      }
    }
  } else {
    rewriteDelegatedLocation(headers, incoming);
  }

  headers.set("x-gacha-public-plane", "a6-front-door");
  headers.set("x-gacha-app-source-sha", integrity.appSha);
  headers.set("x-gacha-app-transport", integrity.previewOrigin ? "preview-http" : "service-binding");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function publicDiagnostic(request, env, pathname) {
  const guard = methodGuard(request);
  if (guard) return guard;
  const sourceSha = releaseSourceSha();

  if (pathname === "/api/runtime-diagnostics/release-source") {
    return jsonResponse(request, { plane: "public", source_sha: sourceSha }, sourceSha ? 200 : 503);
  }
  if (pathname === "/api/runtime-diagnostics/public-plane") {
    return jsonResponse(request, {
      plane: "public",
      source_sha: sourceSha,
      app_binding: "APP",
      route_contract: "a6-full-parity",
      public_document_runtime: "exact-sha-app-front-door",
    }, sourceSha ? 200 : 503);
  }
  return appDelegationDiagnostic(request, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ownership = classifyPublicRoute(url.pathname);

    if (ownership === "public-diagnostic" && PUBLIC_DIAGNOSTIC_PATHS.includes(url.pathname)) {
      return publicDiagnostic(request, env, url.pathname);
    }

    if (ownership === "app-owned") {
      return delegateAppOwned(request, env);
    }

    return jsonResponse(request, { error: "route_not_owned_by_public_bootstrap" }, 404);
  },
};
