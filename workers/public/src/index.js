import { PUBLIC_BOOTSTRAP_OWNED_PATHS } from "./route-contract.js";

const RELEASE_SOURCE_SHA = "__GACHA_RELEASE_SOURCE_SHA__";
const SHA_RE = /^[0-9a-f]{40}$/;
const APP_RELEASE_SOURCE_PATH = "/api/runtime-diagnostics/release-source";
const APP_REPRESENTATIVE_PATH = "/review";
const REVIEW_PATH = "/review";
const REVIEW_LOGIN_PATH = "/review/login";
const REVIEW_LOGOUT_PATH = "/review/logout";
const REVIEW_COOKIE_NAME = "gacha_review_admin";
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

function htmlResponse(request, html, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "Content-Type": "text/html; charset=utf-8",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Gacha-Plane": "public",
    "X-Gacha-Route": "review-login-cold",
    "X-Robots-Tag": "noindex, nofollow",
    ...extraHeaders,
  });
  return new Response(request.method === "HEAD" ? null : html, { status, headers });
}

function methodNotAllowed(request, allow) {
  return jsonResponse(request, { error: "method_not_allowed" }, 405, { Allow: allow });
}

function methodGuard(request) {
  if (request.method === "GET" || request.method === "HEAD") return null;
  return methodNotAllowed(request, "GET, HEAD");
}

function fixedAppRequest(pathname) {
  const target = new URL(pathname, INTERNAL_ORIGIN);
  return new Request(target, {
    method: "GET",
    headers: {
      Accept: pathname === APP_RELEASE_SOURCE_PATH
        ? "application/json"
        : "text/html,application/xhtml+xml",
      "User-Agent": "GachaLens-PublicWorker-Bootstrap",
    },
  });
}

function reviewSessionCookie(request) {
  const rawCookie = request.headers.get("cookie") || "";
  for (const rawPart of rawCookie.split(";")) {
    const part = rawPart.trim();
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === REVIEW_COOKIE_NAME && value) return `${REVIEW_COOKIE_NAME}=${value}`;
  }
  return null;
}

function reviewLoginHtml(url) {
  const authFailed = url.searchParams.get("auth") === "failed";
  const error = authFailed
    ? '<p class="error" role="alert">Review token was not accepted.</p>'
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Import Review | Gacha Lens</title>
  <style>
    :root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}
    body{margin:0;background:#f4f1e8;color:#161616}
    main{min-height:100vh;padding:72px 20px}
    .shell{width:min(720px,100%);margin:0 auto}
    .eyebrow{margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.18em}
    h1{margin:0;font-size:clamp(36px,8vw,64px);line-height:.95}
    .lead{max-width:620px;margin:18px 0 28px;color:#505050;line-height:1.7}
    .card{border:1px solid #d7d2c6;border-radius:20px;background:#fff;padding:24px;box-shadow:0 12px 36px rgba(0,0,0,.06)}
    label{display:block;margin-bottom:8px;font-size:14px;font-weight:700}
    input{width:100%;min-height:48px;border:1px solid #bbb4a6;border-radius:12px;padding:10px 12px;font:inherit}
    button{margin-top:16px;min-height:46px;border:0;border-radius:999px;background:#171717;color:#fff;padding:0 20px;font:inherit;font-weight:800;cursor:pointer}
    .error{margin:0 0 16px;border-radius:12px;background:#fff1f1;color:#9a2020;padding:12px 14px}
  </style>
</head>
<body>
  <main>
    <div class="shell">
      <p class="eyebrow">ADMIN</p>
      <h1>Review access</h1>
      <p class="lead">Import issues are an internal queue. Enter the review token to inspect unknown and review_required records.</p>
      <section class="card">
        ${error}
        <form action="/review/login" method="post">
          <label for="review-token">Review token</label>
          <input id="review-token" name="token" type="password" autocomplete="current-password" required>
          <button type="submit">Unlock review</button>
        </form>
      </section>
    </div>
  </main>
</body>
</html>`;
}

function appBindingAvailable(env) {
  return Boolean(env?.APP && typeof env.APP.fetch === "function");
}

async function delegatedReviewRequest(request, pathname, sessionCookie) {
  const target = new URL(pathname, INTERNAL_ORIGIN);
  const headers = new Headers({
    Accept: request.headers.get("accept") || "text/html,application/xhtml+xml",
    "User-Agent": "GachaLens-PublicWorker-Review",
  });

  if (sessionCookie) headers.set("Cookie", sessionCookie);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength) body = bytes;
  }

  return new Request(target, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });
}

function rewriteAppLocation(request, headers) {
  const location = headers.get("location");
  if (!location) return;
  let target;
  try {
    target = new URL(location, INTERNAL_ORIGIN);
  } catch {
    return;
  }
  if (target.origin !== INTERNAL_ORIGIN) return;
  const publicOrigin = new URL(request.url).origin;
  headers.set("location", new URL(`${target.pathname}${target.search}${target.hash}`, publicOrigin).toString());
}

async function forwardReviewToApp(request, env, pathname, sessionCookie = null) {
  if (!appBindingAvailable(env)) {
    return jsonResponse(request, { error: "app_binding_unavailable" }, 503);
  }

  const appRequest = await delegatedReviewRequest(request, pathname, sessionCookie);
  const appResponse = await env.APP.fetch(appRequest);
  const headers = new Headers(appResponse.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  rewriteAppLocation(request, headers);

  if (request.method === "HEAD") headers.delete("content-length");
  return new Response(request.method === "HEAD" ? null : appResponse.body, {
    status: appResponse.status,
    statusText: appResponse.statusText,
    headers,
  });
}

async function handleReview(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(request, "GET, HEAD");
  }

  const sessionCookie = reviewSessionCookie(request);
  if (!sessionCookie) {
    return htmlResponse(request, reviewLoginHtml(url));
  }

  return forwardReviewToApp(request, env, `${url.pathname}${url.search}`, sessionCookie);
}

async function handleReviewAuthPost(request, env, url) {
  if (request.method !== "POST") return methodNotAllowed(request, "POST");
  const sessionCookie = url.pathname === REVIEW_LOGOUT_PATH ? reviewSessionCookie(request) : null;
  return forwardReviewToApp(request, env, `${url.pathname}${url.search}`, sessionCookie);
}

async function readAppSourceSha(env) {
  if (!appBindingAvailable(env)) {
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

async function appDelegationDiagnostic(request, env) {
  const ownSha = releaseSourceSha();
  if (!ownSha) return jsonResponse(request, { error: "public_source_identity_unavailable" }, 503);

  const appIdentity = await readAppSourceSha(env);
  if (!appIdentity.ok) {
    return jsonResponse(request, {
      ok: false,
      public_source_sha: ownSha,
      app_source_sha: appIdentity.sourceSha,
      error: appIdentity.error,
    }, appIdentity.status);
  }

  if (appIdentity.sourceSha !== ownSha) {
    return jsonResponse(request, {
      ok: false,
      public_source_sha: ownSha,
      app_source_sha: appIdentity.sourceSha,
      error: "mixed_source_sha",
    }, 409);
  }

  const representative = await env.APP.fetch(fixedAppRequest(APP_REPRESENTATIVE_PATH));
  const representativeBody = representative.status === 200
    ? await representative.clone().text()
    : "";
  const representativeOk = representative.status === 200 && representativeBody.includes("Review access");

  return jsonResponse(request, {
    ok: representativeOk,
    public_source_sha: ownSha,
    app_source_sha: appIdentity.sourceSha,
    representative: {
      path: APP_REPRESENTATIVE_PATH,
      status: representative.status,
      marker: representativeOk,
    },
    error: representativeOk ? null : "app_representative_route_failed",
  }, representativeOk ? 200 : 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === REVIEW_PATH) {
      return handleReview(request, env, url);
    }

    if (url.pathname === REVIEW_LOGIN_PATH || url.pathname === REVIEW_LOGOUT_PATH) {
      return handleReviewAuthPost(request, env, url);
    }

    const guard = methodGuard(request);
    if (guard) return guard;

    if (!PUBLIC_BOOTSTRAP_OWNED_PATHS.includes(url.pathname)) {
      return jsonResponse(request, { error: "route_not_owned_by_public_bootstrap" }, 404);
    }

    const sourceSha = releaseSourceSha();
    if (url.pathname === "/api/runtime-diagnostics/release-source") {
      return jsonResponse(request, { plane: "public", source_sha: sourceSha }, sourceSha ? 200 : 503);
    }

    if (url.pathname === "/api/runtime-diagnostics/public-plane") {
      return jsonResponse(request, {
        plane: "public",
        source_sha: sourceSha,
        app_binding: "APP",
        route_contract: "phase-a2-bootstrap",
      }, sourceSha ? 200 : 503);
    }

    return appDelegationDiagnostic(request, env);
  },
};
