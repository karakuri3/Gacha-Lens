import fs from "node:fs";
import path from "node:path";
import {
  findOfficialAuditLeaks,
  validateOfficialReadOnlyAudit,
} from "../lib/domain/official-read-only-audit.js";

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const reportPath = path.resolve(args.report || "artifacts/official-live-audit/official-live-audit.json");

if (command === "verify") {
  const report = validateOfficialReadOnlyAudit(JSON.parse(fs.readFileSync(reportPath, "utf8")));
  if (report.report_complete !== true || report.final_verdict !== "OFFICIAL_READ_ONLY_PLAN_READY") {
    throw new Error("Official read-only audit is not ready.");
  }
  console.log(JSON.stringify({ ok: true, verdict: report.final_verdict, database_writes: 0 }));
} else if (command === "scan") {
  const directory = path.resolve(args.directory || path.dirname(reportPath));
  const files = fs.readdirSync(directory)
    .filter((name) => name.endsWith(".json") || name.endsWith(".md"))
    .map((name) => ({ name, text: fs.readFileSync(path.join(directory, name), "utf8") }));
  const leaks = findOfficialAuditLeaks(files, [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_ANON_KEY]);
  if (leaks.length) throw new Error(`Official audit secret scan failed for ${leaks.length} file(s).`);
  console.log(JSON.stringify({ ok: true, files_scanned: files.length }));
} else {
  throw new Error("Expected verify or scan command.");
}

function parseArgs(values) {
  return Object.fromEntries(values
    .filter((value) => value.startsWith("--") && value.includes("="))
    .map((value) => {
      const [key, ...rest] = value.slice(2).split("=");
      return [key, rest.join("=")];
    }));
}
