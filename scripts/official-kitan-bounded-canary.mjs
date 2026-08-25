import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { createOfficialPostgresTransactionAdapter } from "../lib/server/official-bounded-postgres.js";
import { buildOfficialBoundedBlockedResult, findOfficialBoundedLeaks, formatOfficialBoundedResultMarkdown, requireOfficialDatabaseUrl, validateOfficialBoundedResult } from "../lib/domain/official-bounded-write.js";
import { authorizeOfficialKitanCanary, executeOfficialKitanCanaryTransaction } from "../lib/domain/official-kitan-canary.js";

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));
if (command === "authorize") authorize(); else if (command === "execute") await execute(); else if (command === "scan") scan(); else if (command === "verify") verify(); else throw new Error("Expected authorize, execute, scan, or verify command.");

function authorize() {
  try {
    const authorization = resolveAuthorization();
    writeResult("official-kitan-canary-ready", { final_verdict: "OFFICIAL_KITAN_CANARY_READY", canary: summarizeAuthorization(authorization), database_writes: 0, deletes: 0, cleanup_operations: 0 });
    writeOutput("authorized", "true");
  } catch (error) {
    writeResult("official-kitan-canary-result", blocked(error?.reason_code || "kitan_canary_authorization_failed"));
    writeOutput("authorized", "false");
    throw error;
  }
}
async function execute() {
  const workflow = workflowIdentity();
  let client;
  let result;
  try {
    const authorization = resolveAuthorization();
    client = new Client({ connectionString: requireOfficialDatabaseUrl(process.env.SUPABASE_DB_URL), application_name: "gacha-official-kitan-bounded-canary" });
    await client.connect();
    result = await executeOfficialKitanCanaryTransaction({ adapter: createOfficialPostgresTransactionAdapter(client), authorization, workflow });
  } catch (error) { result = blocked(error?.reason_code || "kitan_canary_execution_failed", workflow); }
  finally { if (client) await client.end().catch(() => {}); }
  writeResult("official-kitan-canary-result", result);
  writeOutput("final_verdict", result.final_verdict);
  writeOutput("database_writes", String(result.database_writes || 0));
  if (result.final_verdict !== "OFFICIAL_BOUNDED_WRITE_COMMITTED") throw codedError(result.reason_code || "kitan_canary_not_committed");
}
function scan() { const files = listFiles(outputDirectory).filter((file) => /\.(?:json|md)$/i.test(file)).map((file) => ({ name: path.basename(file), text: fs.readFileSync(file, "utf8") })); if (!files.length || findOfficialBoundedLeaks(files, [process.env.SUPABASE_DB_URL, process.env.KITAN_CANARY_APPROVAL, process.env.GITHUB_TOKEN]).length) throw codedError("kitan_canary_secret_scan_failed"); writeJson(path.join(outputDirectory, "official-kitan-canary-secret-scan.json"), { schema_version: 1, secret_findings: 0 }); }
function verify() { const result = validateOfficialBoundedResult(readJson(path.join(outputDirectory, "official-kitan-canary-result.json"))); const scanResult = readJson(path.join(outputDirectory, "official-kitan-canary-secret-scan.json")); if (result.final_verdict !== "OFFICIAL_BOUNDED_WRITE_COMMITTED" || result.operations?.restock_events !== 0 || result.deletes !== 0 || result.cleanup_operations !== 0 || scanResult.secret_findings !== 0) throw codedError("kitan_canary_final_verification_failed"); }
function resolveAuthorization() { return authorizeOfficialKitanCanary({ report: loadAudit(), auditRunId: args["audit-run-id"], auditDigest: process.env.KITAN_CANARY_AUDIT_DIGEST, approval: process.env.KITAN_CANARY_APPROVAL, headSha: workflowIdentity().head_sha, originMainSha: args["origin-main-sha"] }); }
function loadAudit() { return readJson(path.join(path.resolve(required(args["audit-dir"], "--audit-dir")), "official-kitan-readiness-audit.json")); }
function blocked(reasonCode, workflow = workflowIdentity()) { return { ...buildOfficialBoundedBlockedResult({ workflow, auditRunId: args["audit-run-id"], auditDigest: process.env.KITAN_CANARY_AUDIT_DIGEST, reasonCode }), provider: "kitan_club" }; }
function summarizeAuthorization(authorization) { return { provider: "kitan_club", audit_run_id: authorization.audit_run_id, audit_digest: authorization.audit_digest, selected_series_id: authorization.candidate.series_id, variant_count: authorization.candidate.variant_count }; }
function workflowIdentity() { return { run_id: process.env.GITHUB_RUN_ID || args["run-id"], head_sha: sha(process.env.GITHUB_SHA || args["head-sha"]) }; }
function writeResult(baseName, result) { fs.mkdirSync(outputDirectory, { recursive: true }); writeJson(path.join(outputDirectory, `${baseName}.json`), result); fs.writeFileSync(path.join(outputDirectory, `${baseName}.md`), result.final_verdict?.startsWith("OFFICIAL_BOUNDED") ? `${formatOfficialBoundedResultMarkdown(result)}\n` : `# Kitan bounded canary\n\n- Verdict: ${result.final_verdict}\n- Provider: kitan_club\n- Database writes: ${result.database_writes}\n`, "utf8"); }
function listFiles(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => { const file = path.join(directory, entry.name); return entry.isDirectory() ? listFiles(file) : [file]; }); }
function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeOutput(key, value) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, "utf8"); }
function parseArgs(values) { return Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("=")).map((value) => { const [key, ...parts] = value.slice(2).split("="); return [key, parts.join("=")] })); }
function required(value, label) { if (!text(value)) throw codedError(`missing_${label.replace(/^--/, "")}`); return text(value); }
function sha(value) { const normalized = text(value).toLowerCase(); return /^[0-9a-f]{40}$/.test(normalized) ? normalized : ""; }
function text(value) { return value == null ? "" : String(value).trim(); }
function codedError(reason_code) { const error = new Error(reason_code); error.reason_code = reason_code; return error; }
