import { classifyPublicRoute, PUBLIC_DIAGNOSTIC_PATHS } from "./route-contract.js";
import { renderPublicDocument } from "./document-renderer.js";

// Phase A3 exact-head Preview verification anchor v4; no runtime behavior change.
const RELEASE_SOURCE_SHA = "__GACHA_RELEASE_SOURCE_SHA__";
const SHA_RE = /^[0-9a-f]{40}$/;
const APP_RELEASE_SOURCE_PATH = "/api/runtime-diagnostics/release-source";
const APP_REPRESENTATIVE_PATH = "/review";
const INTERNAL_ORIGIN = "https://gacha-lens.internal";
const APP_SOURCE_SHA_HEADER = "x-gacha-app-source-sha";

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

function fixedAppRequest(pathname) {
  const target = new URL(pathname, INTERNAL_ORIGIN);
  return new Request(target, {
    method: "GET",
    headers: {
      Accept: pathname === APP_RELEASE_SOURCE_PATH
        ? "application/json"
        : "text/html,application/xhtml+xml",
      "User-Agent": "GachaLens-PublicWorker-A3",
    },
  });
}

async function readAppSourceSha(env) {
  if (!env?.APP || typeof env.APP.fetch !== "function") {
    return { ok: false, status: 503, error: "app_binding_unavailable", sourceSha: null };
  }
  const response = await env.APP.fetch(fixedAppRequest(APP_RELEASE_SOURCE_PATH));
  if (response.status !== 200) {
    return { ok: false, status: 502, error: "app_source_identity_http_failure", sourceSha: null };
  }
  const payload = await response.json().catch(() => null);
  const sourceSha = String(payload?.source_sha || "").trim().toLowerCase();
  if (!SHA_RE.test(sourceSha)) {
    return { ok: false, status: 502, error: "app_source_identity_invalid", sourceSha: null };
  }
  return { ok: true, status: 200, error: null, sourceSha };
}

async function assertAppExactSha(request, env) {
  const ownSha = releaseSourceSha();
  if (!ownSha) return { ok: false, response: jsonResponse(request, { error: "public_source_identity_unavailable" }, 503) };
  const appIdentity = await readAppSourceSha(env);
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
  return { ok: true, ownSha, appSha: appIdentity.sourceSha };
}

async function appDelegationDiagnostic(request, env) {
  const integrity = await assertAppExactSha(request, env);
  if (!integrity.ok) return integrity.response;

  const representative = await env.APP.fetch(fixedAppRequest(APP_REPRESENTATIVE_PATH));
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

async function delegateAppOwned(request, env) {
  const ownSha = releaseSourceSha();
  if (!ownSha) {
    return jsonResponse(request, { error: "public_source_identity_unavailable" }, 503);
  }
  if (!env?.APP || typeof env.APP.fetch !== "function") {
    return jsonResponse(request, { error: "app_binding_unavailable" }, 503);
  }

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, INTERNAL_ORIGIN);
  const forwarded = new Request(target, request);
  const response = await env.APP.fetch(forwarded);

  let appSha = String(response.headers.get(APP_SOURCE_SHA_HEADER) || "").trim().toLowerCase();
  if (!SHA_RE.test(appSha)) {
    // Cloudflare PR Previews bind to the Production App Worker. During a rollout
    // that older App may not yet emit the response attestation header. Only in
    // this missing-attestation case do one bounded identity lookup so mixed-SHA
    // Preview traffic still fails closed as 409. Healthy same-SHA Production
    // responses stay on the single-call fast path.
    const fallbackIdentity = await readAppSourceSha(env);
    if (!fallbackIdentity.ok) {
      return jsonResponse(request, {
        ok: false,
        public_source_sha: ownSha,
        app_source_sha: fallbackIdentity.sourceSha,
        upstream_status: response.status,
        error: "app_response_identity_unavailable",
      }, 502);
    }
    appSha = fallbackIdentity.sourceSha;
    if (appSha === ownSha) {
      return jsonResponse(request, {
        ok: false,
        public_source_sha: ownSha,
        app_source_sha: appSha,
        upstream_status: response.status,
        error: "app_response_attestation_missing",
      }, 502);
    }
  }
  if (appSha !== ownSha) {
    return jsonResponse(request, {
      ok: false,
      public_source_sha: ownSha,
      app_source_sha: appSha,
      upstream_status: response.status,
      error: "mixed_source_sha",
    }, 409);
  }

  const headers = new Headers(response.headers);
  headers.set("x-gacha-public-plane", "phase-a8-single-call");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function publicDocumentNeedsApp(pathname) {
  return pathname === "/sitemap.xml"
    || pathname === "/series-sitemap.xml"
    || pathname === "/variant-sitemap.xml"
    || /^\/variant-sitemap\/[1-9]\d*$/.test(pathname);
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
      route_contract: "a6-front-door-full-parity",
      public_document_runtime: "sitemap-only-renderer",
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

    if (ownership === "public-document") {
      const guard = methodGuard(request);
      if (guard) return guard;
      if (publicDocumentNeedsApp(url.pathname)) {
        const integrity = await assertAppExactSha(request, env);
        if (!integrity.ok) return integrity.response;
      }
      try {
        const response = await renderPublicDocument(request, env);
        return response ?? jsonResponse(request, { error: "public_document_route_unimplemented" }, 500);
      } catch (error) {
        return jsonResponse(request, {
          error: "public_document_unavailable",
          detail: String(error?.message ?? error),
        }, 503);
      }
    }

    if (ownership === "app-owned") {
      return delegateAppOwned(request, env);
    }

    return jsonResponse(request, { error: "route_not_owned_by_public_bootstrap" }, 404);
  },
};