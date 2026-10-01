import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/i;
const PLACEHOLDER = "__GACHA_RELEASE_SOURCE_SHA__";

export function resolveBuildSourceSha(env = process.env) {
  const value = [
    env.WORKERS_CI_COMMIT_SHA,
    env.GITHUB_SHA,
    env.GACHA_RELEASE_SOURCE_SHA,
  ].map((entry) => String(entry ?? "").trim().toLowerCase())
    .find((entry) => SHA_RE.test(entry));
  if (!value) throw new Error("public_worker_exact_source_sha_required");
  return value;
}

export function buildPublicWorker({
  sourceSha = resolveBuildSourceSha(),
  sourcePath = path.resolve("workers/public/src/index.js"),
  routeContractPath = path.resolve("workers/public/src/route-contract.js"),
  outputPath = path.resolve("workers/public/dist/index.js"),
} = {}) {
  const normalizedSha = String(sourceSha || "").trim().toLowerCase();
  if (!SHA_RE.test(normalizedSha)) throw new Error("invalid_public_worker_source_sha");
  const source = fs.readFileSync(sourcePath, "utf8");
  const occurrences = source.split(PLACEHOLDER).length - 1;
  if (occurrences !== 1) throw new Error(`expected_one_source_sha_placeholder_found_${occurrences}`);
  const built = source.replace(PLACEHOLDER, normalizedSha);
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, built);
  fs.copyFileSync(routeContractPath, path.join(outputDir, "route-contract.js"));
  return { sourceSha: normalizedSha, sourcePath, routeContractPath, outputPath };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  const result = buildPublicWorker();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
