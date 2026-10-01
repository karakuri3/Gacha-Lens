import { classifyPublicRoute, PUBLIC_DIAGNOSTIC_PATHS } from "./route-contract.js";
import { renderPublicDocument } from "./document-renderer.js";

// Phase A3 exact-head Preview verification anchor; no runtime behavior change.
const RELEASE_SOURCE_SHA = "__GACHA_RELEASE_SOURCE_SHA__";
const SHA_RE = /^[0-9a-f]{40}$/;
const APP_RELEASE_SOURCE_PATH = "/api/runtime-diagnostics/release-source";
const APP_REPRESENTATIVE_PATH = "/review";
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
  const integrity = await assertAppExactSha(request, env);
  if (!integrity.ok) return integrity.response;
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, INTERNAL_ORIGIN);
  const forwarded = new Request(target, request);
  return env.APP.fetch(forwarded);
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
      route_contract: "phase-a3-public-documents",
      public_document_runtime: "lightweight-renderer",
    }, sourceSha ? 200 : 503);
  }
  return appDelegationDiagnostic(request, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ownership = classifyPublicRoute(url.pathname);

    // Preserve the full interactive catalog contract without turning the canonical
    // no-query public document into a catch-all App proxy.
    if (url.pathname === "/series" && url.searchParams.size > 0) {
      return delegateAppOwned(request, env);
    }

    if (ownership === "public-diagnostic" && PUBLIC_DIAGNOSTIC_PATHS.includes(url.pathname)) {
      return publicDiagnostic(request, env, url.pathname);
    }

    if (ownership === "public-document") {
      const guard = methodGuard(request);
      if (guard) return guard;
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
