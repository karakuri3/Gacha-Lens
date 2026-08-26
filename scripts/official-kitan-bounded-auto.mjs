import fs from "node:fs";
import path from "node:path";
import { findOfficialBoundedLeaks, requireOfficialDatabaseUrl } from "../lib/domain/official-bounded-write.js";
import { authorizeOfficialKitanBoundedAuto, buildOfficialKitanBoundedAutoDisabledResult, executeOfficialKitanBoundedAutoTransaction, formatOfficialKitanBoundedAutoMarkdown, prepareOfficialKitanBoundedAuto, resolveOfficialKitanBoundedAutoGate } from "../lib/domain/official-kitan-bounded-auto.js";

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));
if (command === "gate") gate(); else if (command === "prepare") prepare(); else if (command === "execute") await execute(); else if (command === "scan") scan(); else if (command === "verify") verify(); else throw new Error("Expected gate, prepare, execute, scan, or verify command.");

function gate() {
  const state = resolveOfficialKitanBoundedAutoGate({ enabled: process.env.OFFICIAL_KITAN_BOUNDED_AUTO_ENABLED, approval: process.env.OFFICIAL_KITAN_BOUNDED_AUTO_APPROVAL });
  if (!state.enabled) {
    writeResult(buildOfficialKitanBoundedAutoDisabledResult({ workflow: workflowIdentity() }));
    writeOutput("execute", "false");
    return;
  }
  writeOutput("execute", "true");
}
function prepare() {
  try {
    const prepared = prepareOfficialKitanBoundedAuto({ report: loadAudit(), auditRunId: workflowIdentity().run_id, auditDigest: loadAudit().canonical_digest, headSha: workflowIdentity().head_sha, originMainSha: args["origin-main-sha"], workflow: workflowIdentity() });
    writeResult(prepared);
    writeOutput("execute", prepared.final_verdict === "OFFICIAL_KITAN_BOUNDED_AUTO_READY" ? "true" : "false");
  } catch (error) {
    writeBlocked(error?.reason_code || "official_kitan_bounded_auto_prepare_failed");
    writeOutput("execute", "false");
    throw error;
  }
}
async function execute() {
  let client;
  try {
    const prepared = readJson(resultFile());
    const authorization = authorizeOfficialKitanBoundedAuto({ prepared, auditRunId: workflowIdentity().run_id, auditDigest: prepared.audit_digest, headSha: workflowIdentity().head_sha, originMainSha: args["origin-main-sha"], applyDigest: prepared.plan?.selected_apply_contract_digest });
    const [{ Client }, { createOfficialPostgresTransactionAdapter }] = await Promise.all([
      import("pg"),
      import("../lib/server/official-bounded-postgres.js"),
    ]);
    client = new Client({ connectionString: requireOfficialDatabaseUrl(process.env.SUPABASE_DB_URL), application_name: "gacha-official-kitan-bounded-auto" });
    await client.connect();
    const adapter = createOfficialPostgresTransactionAdapter(client);
    const before = await adapter.captureCounts();
    const bounded = await executeOfficialKitanBoundedAutoTransaction({ adapter, authorization, workflow: workflowIdentity() });
    const after = await adapter.captureCounts();
    const expectedVariants = authorization.candidate.variant_count;
    const expected = { series: 1, variants: expectedVariants, restock_events: 0, import_issues: 0, review_required: 0, provisional_variants: 0 };
    const delta = Object.fromEntries(Object.keys(expected).map((key) => [key, after[key] - before[key]]));
    if (bounded.final_verdict !== "OFFICIAL_BOUNDED_WRITE_COMMITTED" || JSON.stringify(delta) !== JSON.stringify(expected)) throw Object.assign(new Error("official_kitan_bounded_auto_postflight_failed"), { reason_code: "official_kitan_bounded_auto_postflight_failed" });
    writeResult({ ...prepared, _candidate: undefined, database: { before, after, delta, writes: bounded.database_writes, deletes: 0, cleanup_operations: 0, import_issue_writes: 0 }, database_writes: bounded.database_writes, transaction: bounded.transaction, committed_operations: bounded.committed_operations, final_verdict: "OFFICIAL_KITAN_BOUNDED_AUTO_COMMITTED" });
  } catch (error) { writeBlocked(error?.reason_code || "official_kitan_bounded_auto_execution_failed"); throw error; }
  finally { if (client) await client.end().catch(() => {}); }
}
function scan() { const files = listFiles(outputDirectory).filter((file) => /\.(?:json|md)$/i.test(file)).map((file) => ({ name: path.basename(file), text: fs.readFileSync(file, "utf8") })); if (!files.length || findOfficialBoundedLeaks(files, [process.env.SUPABASE_DB_URL, process.env.OFFICIAL_KITAN_BOUNDED_AUTO_APPROVAL, process.env.GITHUB_TOKEN]).length) throw coded("official_kitan_bounded_auto_secret_scan_failed"); writeJson(path.join(outputDirectory, "official-kitan-bounded-auto-secret-scan.json"), { schema_version: 1, secret_findings: 0 }); }
function verify() { const value = readJson(resultFile()); const scanResult = readJson(path.join(outputDirectory, "official-kitan-bounded-auto-secret-scan.json")); if (!["OFFICIAL_KITAN_BOUNDED_AUTO_DISABLED", "OFFICIAL_KITAN_BOUNDED_AUTO_NOOP", "OFFICIAL_KITAN_BOUNDED_AUTO_COMMITTED"].includes(value.final_verdict) || scanResult.secret_findings !== 0 || value.deletes !== 0 || value.cleanup_operations !== 0) throw coded("official_kitan_bounded_auto_final_verification_failed"); }
function writeBlocked(reasonCode) { writeResult({ ...buildOfficialKitanBoundedAutoDisabledResult({ workflow: workflowIdentity() }), automatic_gate_enabled: true, reason_code: reasonCode, final_verdict: "OFFICIAL_KITAN_BOUNDED_AUTO_BLOCKED" }); }
function loadAudit() { return readJson(path.join(path.resolve(required(args["audit-dir"], "--audit-dir")), "official-kitan-readiness-audit.json")); }
function resultFile() { return path.join(outputDirectory, "official-kitan-bounded-auto-result.json"); }
function writeResult(value) { fs.mkdirSync(outputDirectory, { recursive: true }); writeJson(resultFile(), value); fs.writeFileSync(path.join(outputDirectory, "official-kitan-bounded-auto-result.md"), `${formatOfficialKitanBoundedAutoMarkdown(value)}\n`, "utf8"); }
function workflowIdentity() { return { run_id: process.env.GITHUB_RUN_ID || args["run-id"], head_sha: sha(process.env.GITHUB_SHA || args["head-sha"]) }; }
function listFiles(directory) { return fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => { const file = path.join(directory, entry.name); return entry.isDirectory() ? listFiles(file) : [file]; }) : []; }
function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeOutput(key, value) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, "utf8"); }
function parseArgs(values) { return Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("=")).map((value) => { const [key, ...parts] = value.slice(2).split("="); return [key, parts.join("=")] })); }
function required(value, label) { if (!text(value)) throw coded(`missing_${label.replace(/^--/, "")}`); return text(value); }
function sha(value) { const normalized = text(value).toLowerCase(); return /^[0-9a-f]{40}$/.test(normalized) ? normalized : ""; }
function text(value) { return value == null ? "" : String(value).trim(); }
function coded(reason_code) { const error = new Error(reason_code); error.reason_code = reason_code; return error; }
