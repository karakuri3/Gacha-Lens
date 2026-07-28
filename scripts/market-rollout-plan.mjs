import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildSanitizedMarketRolloutPlan,
  renderMarketRolloutPlanMarkdown,
} from "../lib/domain/market-rollout-plan.js";

const options = parseOptions(process.argv.slice(2));
if (!options.auditPath || !fs.existsSync(options.auditPath)) {
  throw new Error("--audit-path must point to a market candidate audit JSON file.");
}

const audit = JSON.parse(fs.readFileSync(options.auditPath, "utf8"));
const plan = buildSanitizedMarketRolloutPlan(audit);
fs.mkdirSync(options.outputDir, { recursive: true });
fs.writeFileSync(path.join(options.outputDir, "market-rollout-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(options.outputDir, "market-rollout-plan.md"), renderMarketRolloutPlanMarkdown(plan), "utf8");
console.log(JSON.stringify({
  ok: true,
  mode: "read-only",
  source_audit_run_id: plan.source_audit_run_id,
  accepted_candidate_count: plan.accepted_candidate_count,
  review_required_count: plan.review_required_count,
  batch_count: plan.batch_count,
  database_writes: 0,
  output_dir: options.outputDir,
}, null, 2));

function parseOptions(args) {
  const values = Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
  return {
    auditPath: values["audit-path"] ? path.resolve(values["audit-path"]) : "",
    outputDir: path.resolve(values["output-dir"] || path.join(os.tmpdir(), "gacha-lens-market-rollout-plan")),
  };
}
