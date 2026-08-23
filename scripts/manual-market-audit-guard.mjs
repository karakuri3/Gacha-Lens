import fs from "node:fs";
import path from "node:path";
import {
  assertManualMarketAuditCountsUnchanged,
  collectManualMarketAuditSecretValues,
  findManualMarketAuditSecretLeaks,
  validateManualMarketAuditReport,
} from "../lib/domain/manual-market-audit-safety.js";
import { loadMarketManualCanarySelectionProfile } from "../lib/domain/market-manual-canary-selection.js";
import { isNonAuthoritativeManualMarketAudit } from "../lib/domain/manual-market-audit-diagnostic.js";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { fetchRowCount } from "./supabase-rest.mjs";

loadOptionalEnvFile();

const command = process.argv[2];
const options = parseOptions(process.argv.slice(3));

if (command === "snapshot") {
  const outputPath = requiredPath(options.output, "--output");
  const counts = await productionCounts();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(counts, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, mode: "read-only", count_keys: Object.keys(counts), database_writes: 0 }));
} else if (command === "verify") {
  const auditPath = requiredPath(options.audit, "--audit");
  const beforePath = requiredPath(options.before, "--before");
  const afterPath = requiredPath(options.after, "--after");
  const profilePath = requiredPath(options.profile, "--profile");
  const report = readJson(auditPath);
  const profile = loadMarketManualCanarySelectionProfile(profilePath);
  validateManualMarketAuditReport(report, {
    expectedHeadSha: options["expected-head-sha"],
    expectedRunId: options["expected-run-id"],
    blockedVariantIds: profile.blocked_variants.map((entry) => entry.variant_id),
  });
  assertManualMarketAuditCountsUnchanged(readJson(beforePath), readJson(afterPath));
  console.log(JSON.stringify({ ok: true, mode: "dry-run", report_complete: true, truncated_count: 0, database_writes: 0 }));
} else if (command === "compare") {
  const beforePath = requiredPath(options.before, "--before");
  const afterPath = requiredPath(options.after, "--after");
  assertManualMarketAuditCountsUnchanged(readJson(beforePath), readJson(afterPath));
  console.log(JSON.stringify({ ok: true, database_writes: 0, production_delta: 0 }));
} else if (command === "scan") {
  const directory = requiredPath(options.directory, "--directory");
  const files = listFiles(directory).map((filePath) => ({
    name: path.relative(directory, filePath).replaceAll("\\", "/"),
    text: fs.readFileSync(filePath, "utf8"),
  }));
  if (!files.length) throw new Error("Manual market audit artifact directory is empty.");
  const secretValues = collectManualMarketAuditSecretValues(process.env);
  const findings = findManualMarketAuditSecretLeaks(files, secretValues);
  if (findings.length) throw new Error(`Manual market audit artifact secret scan failed for ${findings.length} file(s).`);
  console.log(JSON.stringify({ ok: true, files_scanned: files.length, secret_findings: 0 }));
} else if (command === "is-non-authoritative") {
  const auditPath = requiredPath(options.audit, "--audit");
  if (!isNonAuthoritativeManualMarketAudit(readJson(auditPath))) process.exitCode = 1;
} else {
  throw new Error("Expected command: snapshot, compare, verify, scan, or is-non-authoritative.");
}

async function productionCounts() {
  const [marketListings, observations, importIssues, ingestionRuns, reviewRequired] = await Promise.all([
    fetchRowCount("market_listings"),
    fetchRowCount("market_listing_observations"),
    fetchRowCount("import_issues"),
    fetchRowCount("ingestion_runs"),
    fetchRowCount("market_listings", { review_required: "eq.true" }),
  ]);
  return {
    market_listings: marketListings,
    market_listing_observations: observations,
    import_issues: importIssues,
    ingestion_runs: ingestionRuns,
    review_required: reviewRequired,
  };
}

function parseOptions(args) {
  return Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
}

function requiredPath(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved) && label !== "--output") throw new Error(`${label} does not exist.`);
  return resolved;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  }).sort((left, right) => left.localeCompare(right, "en"));
}
