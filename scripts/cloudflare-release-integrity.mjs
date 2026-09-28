import { fileURLToPath } from "node:url";

export const CLOUDFLARE_WORKERS_CHECK_NAME = "Workers Builds: gacha-lens";
export const APPROVED_PREVIEW_HOST_SUFFIX = "-gacha-lens.senpingxingzuo.workers.dev";
const SHA_RE = /^[0-9a-f]{40}$/i;
const IMMUTABLE_PREVIEW_RE = /^https:\/\/[0-9a-f]{8,64}-gacha-lens\.senpingxingzuo\.workers\.dev$/i;

export function normalizeSourceSha(value) {
  const sha = String(value ?? "").trim().toLowerCase();
  return SHA_RE.test(sha) ? sha : null;
}

export function extractApprovedImmutablePreviewUrl(summary) {
  const text = String(summary ?? "").replaceAll("&amp;", "&");
  const urls = text.match(/https:\/\/[A-Za-z0-9.-]+/g) ?? [];
  const approved = [...new Set(urls
    .map((value) => value.replace(/[),.;]+$/g, ""))
    .filter((value) => IMMUTABLE_PREVIEW_RE.test(value)))];
  return approved.length === 1 ? approved[0] : null;
}

export function inspectCloudflareCheckRuns(payload, targetSha) {
  const sha = normalizeSourceSha(targetSha);
  if (!sha) throw new Error("invalid_target_sha");
  const checkRuns = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  const candidates = checkRuns
    .filter((run) => run?.name === CLOUDFLARE_WORKERS_CHECK_NAME && normalizeSourceSha(run?.head_sha) === sha)
    .sort((left, right) => Number(left?.id ?? 0) - Number(right?.id ?? 0));
  const candidate = candidates.at(-1);
  if (!candidate) {
    return { found: false, check_id: null, status: null, conclusion: null, preview_url: null };
  }

  return {
    found: true,
    check_id: candidate.id ?? null,
    status: String(candidate.status ?? ""),
    conclusion: candidate.conclusion == null ? null : String(candidate.conclusion),
    preview_url: extractApprovedImmutablePreviewUrl(candidate?.output?.summary),
  };
}

export function readReleaseSourceSha(payload) {
  if (!payload || typeof payload !== "object") return null;
  return normalizeSourceSha(payload.source_sha);
}

export function evaluateProductionReleaseProof({
  targetSha,
  workersCheckStatus,
  workersCheckConclusion,
  sourceIdentityHttpStatus,
  deployedSha,
  customDomainHttpStatus,
} = {}) {
  const target = normalizeSourceSha(targetSha);
  if (!target) return { ok: false, reason: "invalid_target_sha" };
  if (workersCheckStatus !== "completed") return { ok: false, reason: "workers_build_incomplete" };
  if (workersCheckConclusion !== "success") return { ok: false, reason: "workers_build_failed" };
  if (Number(sourceIdentityHttpStatus) !== 200) return { ok: false, reason: "source_identity_http_failure" };
  if (normalizeSourceSha(deployedSha) !== target) return { ok: false, reason: "deployed_sha_mismatch" };
  if (Number(customDomainHttpStatus) !== 200) return { ok: false, reason: "custom_domain_http_failure" };
  return { ok: true, reason: "verified" };
}

async function readStdin() {
  let body = "";
  for await (const chunk of process.stdin) body += chunk;
  return body;
}

async function main() {
  const command = process.argv[2];
  if (command === "inspect-check") {
    const targetSha = process.argv[3];
    const input = await readStdin();
    const payload = JSON.parse(input || "{}");
    const result = inspectCloudflareCheckRuns(payload, targetSha);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === "read-source-sha") {
    const input = await readStdin();
    const payload = JSON.parse(input || "{}");
    const sha = readReleaseSourceSha(payload);
    if (!sha) throw new Error("invalid_release_source_payload");
    process.stdout.write(`${sha}\n`);
    return;
  }
  throw new Error(`unknown_command:${command ?? ""}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
