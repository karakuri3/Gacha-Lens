import { fileURLToPath } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/i;
export const APP_PRODUCTION_SOURCE_URL = "https://gacha-lens.senpingxingzuo.workers.dev/api/runtime-diagnostics/release-source";

export function normalizeSha(value) {
  const sha = String(value ?? "").trim().toLowerCase();
  return SHA_RE.test(sha) ? sha : null;
}

export async function readSourceIdentity(fetchImpl, url = APP_PRODUCTION_SOURCE_URL) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
  });
  if (response.status !== 200) return { ok: false, status: response.status, sourceSha: null };
  const payload = await response.json().catch(() => null);
  const sourceSha = normalizeSha(payload?.source_sha);
  return { ok: Boolean(sourceSha), status: response.status, sourceSha };
}

export async function waitForAppExactSha({
  targetSha,
  branch,
  fetchImpl = fetch,
  attempts = 40,
  delayMs = 15000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const target = normalizeSha(targetSha);
  if (!target) throw new Error("invalid_target_sha");
  const branchName = String(branch ?? "").trim();

  if (branchName !== "main") {
    return { ok: true, skipped: true, reason: "non_production_branch", targetSha: target };
  }

  const total = Math.max(1, Math.min(40, Number(attempts) || 40));
  let last = { ok: false, status: 0, sourceSha: null };

  for (let attempt = 1; attempt <= total; attempt += 1) {
    try {
      last = await readSourceIdentity(fetchImpl);
      if (last.ok && last.sourceSha === target) {
        return { ok: true, skipped: false, reason: "app_exact_sha_ready", targetSha: target, attempt };
      }
    } catch {
      last = { ok: false, status: 0, sourceSha: null };
    }
    if (attempt < total) await sleep(delayMs);
  }

  throw new Error(`app_exact_sha_not_ready:target=${target}:observed=${last.sourceSha ?? "unavailable"}:status=${last.status}`);
}

async function main() {
  const targetSha = process.env.WORKERS_CI_COMMIT_SHA;
  const branch = process.env.WORKERS_CI_BRANCH;
  const result = await waitForAppExactSha({ targetSha, branch });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
