import fs from "node:fs/promises";
import path from "node:path";
import { fetchOfficialSourceUniverseAudit } from "../lib/fetchers/official-sources/universe-audit.js";

const args = parseArgs(process.argv.slice(2));
const targetMonth = args["target-month"] || "2026-10";
const outputDir = path.resolve(args["output-dir"] || "tmp/official-source-universe-audit");
const report = await fetchOfficialSourceUniverseAudit({
  targetMonth,
  retrievalPlane: args["retrieval-plane"] || "github_actions_or_local_node_fetch",
  globalHardCap: numberArg(args["global-hard-cap"], 150),
});

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, "summary.md"), formatMarkdown(report));
console.log(JSON.stringify({
  ok: true,
  contract: report.contract,
  target_period: report.target_period,
  completeness_known: report.completeness_known,
  database_writes: report.database_writes,
  provider_mutations: report.provider_mutations,
  f0_activations: report.f0_activations,
  request_budget: report.request_budget,
  output_dir: outputDir,
}, null, 2));

function formatMarkdown(report) {
  const lines = [
    "# Official Source Universe Audit",
    "",
    `- Target period: ${report.target_period}`,
    `- Snapshot: ${report.snapshot_started_at} → ${report.snapshot_completed_at}`,
    `- Retrieval plane: ${report.retrieval_plane}`,
    `- Completeness known: ${report.completeness_known}`,
    `- Database writes: ${report.database_writes}`,
    `- Provider mutations: ${report.provider_mutations}`,
    `- F0 activations: ${report.f0_activations}`,
    `- Request hard cap: ${report.request_budget.global_hard_cap}`,
    `- Request actual: ${report.request_budget.actual_attempts}`,
    "",
  ];
  for (const provider of report.providers) {
    lines.push(`## ${provider.provider}`, "");
    lines.push(`- Completeness known: ${provider.completeness_known}`);
    lines.push(`- Exhaustion proven: ${provider.exhaustion_proven}`);
    lines.push(`- Canonical unique records: ${provider.canonical_unique_records}`);
    lines.push(`- Target-period records: ${provider.target_period_count}`);
    lines.push(`- Undated: ${provider.undated_count}`);
    lines.push(`- Target-period unknown: ${provider.target_period_unknown_count}`);
    lines.push(`- Blocking reasons: ${provider.blocking_reasons.join(", ") || "none"}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(values) {
  const result = {};
  for (const value of values) {
    const match = String(value).match(/^--([^=]+)=(.*)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}
function numberArg(value, fallback) { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : fallback; }
