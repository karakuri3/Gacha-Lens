import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  buildReleaseCoverageReadinessReport,
  formatReleaseCoverageReadinessMarkdown,
} from "./lib/release-coverage-readiness.mjs";

const args = parseArgs(process.argv.slice(2));
const input = readInput(args.input);
const report = buildReleaseCoverageReadinessReport(input);
const markdown = formatReleaseCoverageReadinessMarkdown(report);

if (args["output-dir"]) {
  const outputDir = path.resolve(args["output-dir"]);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "release-coverage-readiness.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "release-coverage-readiness.md"), markdown, "utf8");
}

console.log(JSON.stringify({
  ok: true,
  verdict: report.verdict,
  database_writes: report.database_writes,
  provider_requests: report.provider_requests,
  totals: report.totals,
}, null, 2));

function readInput(file) {
  const body = file ? fs.readFileSync(path.resolve(file), "utf8") : fs.readFileSync(0, "utf8");
  if (Buffer.byteLength(body, "utf8") > 1024 * 1024) throw new Error("input exceeds 1 MiB");
  return JSON.parse(body);
}

function parseArgs(values) {
  return Object.fromEntries(values
    .filter((value) => value.startsWith("--") && value.includes("="))
    .map((value) => {
      const [key, ...rest] = value.slice(2).split("=");
      return [key, rest.join("=")];
    }));
}
