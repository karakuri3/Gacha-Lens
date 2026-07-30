import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  buildMarketRolloutReadinessReport,
  renderMarketRolloutReadinessMarkdown,
} from "../lib/domain/market-rollout-readiness.js";
import { fetchRows } from "./supabase-rest.mjs";

process.loadEnvFile?.(".env.local");

const options = parseOptions(process.argv.slice(2));
const evidence = JSON.parse(fs.readFileSync(options.evidencePath, "utf8"));
const workflowDigest = createHash("sha256")
  .update(fs.readFileSync(options.workflowPath))
  .digest("hex");
const phase4Evidence = {
  ...evidence.phase4,
  complete: evidence.schema_version === 2 && evidence.phase4?.complete === true,
  workflow_unchanged: workflowDigest === String(evidence.workflow_sha256 ?? "").toLowerCase(),
};
let productionReadComplete = true;
let fetchErrorCount = 0;
let marketListings = [];
let observations = [];
let ingestionRuns = [];
let importIssues = [];

try {
  [marketListings, observations, ingestionRuns, importIssues] = await Promise.all([
    fetchRows("market_listings", {
      select: "id,status,source,review_required,raw",
      pageSize: 1000,
      params: { order: "id.asc" },
    }),
    fetchRows("market_listing_observations", {
      select: "id,listing_id,price,status,observed_at,created_at,raw",
      pageSize: 1000,
      params: { order: "id.asc" },
    }),
    fetchRows("ingestion_runs", {
      select: "id,task,status,finished_at",
      pageSize: 1000,
      params: { order: "id.asc" },
    }),
    fetchRows("import_issues", {
      select: "id,issue_type,table_name,resolved",
      pageSize: 1000,
      params: { order: "id.asc" },
    }),
  ]);
} catch {
  productionReadComplete = false;
  fetchErrorCount = 1;
}

const report = buildMarketRolloutReadinessReport({
  generatedAt: options.generatedAt,
  phase4: phase4Evidence,
  marketListings,
  observations,
  ingestionRuns,
  importIssues,
  productionReadComplete,
  fetchErrorCount,
  databaseWrites: 0,
});
fs.mkdirSync(options.outputDir, { recursive: true });
fs.writeFileSync(
  path.join(options.outputDir, "market-rollout-readiness.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
fs.writeFileSync(
  path.join(options.outputDir, "market-rollout-readiness.md"),
  `${renderMarketRolloutReadinessMarkdown(report)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  ok: report.report_complete,
  mode: report.mode,
  verdict: report.readiness.verdict,
  reasons: report.readiness.reasons,
  next_allowed_step: report.readiness.next_allowed_step,
  database_writes: report.database_writes,
  output_dir: options.outputDir,
}, null, 2));

function parseOptions(args) {
  const values = Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
  return {
    evidencePath: path.resolve(values["evidence-path"] || "config/market-rollout-evidence.json"),
    workflowPath: path.resolve(values["workflow-path"] || ".github/workflows/gacha-ingestion.yml"),
    outputDir: path.resolve(values["output-dir"] || "artifacts"),
    generatedAt: values["generated-at"],
  };
}
