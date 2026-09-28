const CHECK_NAME = "Workers Builds: gacha-lens";
const CLOUDFLARE_APP_SLUG = "cloudflare-workers-and-pages";
const APPROVED_PREVIEW_RE = /^https:\/\/[A-Za-z0-9-]+-gacha-lens\.senpingxingzuo\.workers\.dev$/;
const VERSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_SHA_RE = /^[0-9a-f]{40}$/;

export function selectExactCloudflareCheck(payload, targetSha) {
  const checks = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  return checks
    .filter((check) =>
      check?.name === CHECK_NAME &&
      check?.head_sha === targetSha &&
      check?.app?.slug === CLOUDFLARE_APP_SLUG
    )
    .sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0))
    .at(-1) ?? null;
}

export function parseCloudflareSummary(check) {
  const summary = String(check?.output?.summary ?? "").replace(/\r/g, "");
  const previewUrl = summary.match(/https:\/\/[A-Za-z0-9-]+-gacha-lens\.senpingxingzuo\.workers\.dev/)?.[0] ?? "";
  const versionId = summary.match(/Version ID:\s*([0-9a-f-]{36})/i)?.[1] ?? "";
  return { summary, previewUrl, versionId };
}

export function resolveCloudflareCheck(payload, targetSha, { requirePreview = false } = {}) {
  if (!SOURCE_SHA_RE.test(targetSha)) {
    throw new Error(`Invalid target SHA: ${targetSha}`);
  }

  const check = selectExactCloudflareCheck(payload, targetSha);
  if (!check) return { state: "waiting" };

  if (check.status !== "completed") {
    return { state: "waiting", checkId: check.id };
  }

  if (check.conclusion !== "success") {
    throw new Error(`Cloudflare Workers exact-head build concluded ${check.conclusion || "unknown"}.`);
  }

  const { previewUrl, versionId } = parseCloudflareSummary(check);
  if (!VERSION_ID_RE.test(versionId)) {
    throw new Error("Cloudflare check succeeded but did not expose a valid Version ID.");
  }

  if (requirePreview && !APPROVED_PREVIEW_RE.test(previewUrl)) {
    throw new Error("Cloudflare check succeeded but did not expose an approved exact-head Preview URL.");
  }

  return {
    state: "success",
    checkId: check.id,
    versionId,
    previewUrl: requirePreview ? previewUrl : undefined,
  };
}

export function assertProductionSourceIdentity(payload, targetSha) {
  if (!SOURCE_SHA_RE.test(targetSha)) {
    throw new Error(`Invalid target SHA: ${targetSha}`);
  }

  const sourceSha = String(payload?.source_sha ?? "");
  if (sourceSha !== targetSha) {
    throw new Error(`Production source SHA mismatch: expected ${targetSha}, got ${sourceSha || "missing"}.`);
  }
  return sourceSha;
}

async function runCli() {
  const [mode, targetSha] = process.argv.slice(2);
  if (!["preview", "production"].includes(mode) || !targetSha) {
    throw new Error("Usage: cloudflare-check-resolver.mjs <preview|production> <40-char-sha>");
  }

  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const payload = JSON.parse(input || "{}");
  const result = resolveCloudflareCheck(payload, targetSha, { requirePreview: mode === "preview" });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}
