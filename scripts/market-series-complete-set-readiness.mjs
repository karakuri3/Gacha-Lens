import fs from "node:fs";
import path from "node:path";
import { fetchRowCount } from "./supabase-rest.mjs";
import { buildSeriesCompleteSetReadiness, renderSeriesCompleteSetReadinessMarkdown } from "../lib/domain/market-series-complete-set-canary.js";

const options = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => { const [key, ...rest] = arg.slice(2).split("="); return [key, rest.join("=")]; }));
const output = path.resolve(options["output-dir"] || "market-series-complete-set-readiness");
const auditRunId = required(options["audit-run-id"], "--audit-run-id");
const diagnostic = JSON.parse(fs.readFileSync(path.resolve(required(options.diagnostic, "--diagnostic")), "utf8"));
assertReadOnlyWorkflow(options["origin-main-sha"]);
fs.mkdirSync(output, { recursive: true });
let before = null;
try {
  before = await counts();
  const after = await counts();
  const report = buildSeriesCompleteSetReadiness({ diagnostic, auditRunId, headSha: process.env.GITHUB_SHA, productionCountsBefore: before, productionCountsAfter: after });
  write(report);
  if (!report.canary_eligible) throw new Error("Series complete-set readiness is blocked.");
  console.log(JSON.stringify({ ok: true, database_writes: 0, canonical_digest: report.canonical_digest }));
} catch (error) {
  const after = before ? await safeCounts() : null;
  const report = { schema_version: 1, kind: "series_complete_set_canary_readiness", workflow: { audit_run_id: auditRunId, head_sha: process.env.GITHUB_SHA || null }, selected_candidate_count: 0, candidate_preview: [], database_writes: 0, canary_eligible: false, write_eligible: false, blockers: ["series_complete_set_readiness_failed"], production_counts_before: before, production_counts_after: after };
  write(report);
  throw error;
}

function assertReadOnlyWorkflow(originMainSha) {
  if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.GITHUB_REF !== "refs/heads/main" || !/^[0-9a-f]{40}$/.test(String(process.env.GITHUB_SHA)) || process.env.GITHUB_SHA !== originMainSha) throw new Error("Series complete-set readiness requires the exact current main revision.");
}
async function counts() { const tables = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants", "stock_reports", "restock_events"]; const values = await Promise.all([...tables.map((table) => fetchRowCount(table)), fetchRowCount("market_listings", { review_required: "eq.true" })]); return Object.fromEntries([...tables, "review_required"].map((table, index) => [table, values[index]])); }
async function safeCounts() { try { return await counts(); } catch { return null; } }
function write(report) { fs.writeFileSync(path.join(output, "market-series-complete-set-readiness.json"), `${JSON.stringify(report, null, 2)}\n`); fs.writeFileSync(path.join(output, "market-series-complete-set-readiness.md"), renderSeriesCompleteSetReadinessMarkdown(report)); }
function required(value, name) { if (!value) throw new Error(`${name} is required.`); return value; }
