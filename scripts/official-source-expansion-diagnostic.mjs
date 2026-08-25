import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fetchOfficialSourceExpansionDiagnostic, normalizeOfficialSourceExpansionMode } from "../lib/fetchers/official-sources/registry.js";
import { buildOfficialSourceExpansionReport, findOfficialSourceExpansionLeaks, formatOfficialSourceExpansionMarkdown } from "../lib/domain/official-source-expansion-diagnostic.js";

const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(args["output-dir"] || process.env.OFFICIAL_SOURCE_EXPANSION_OUTPUT_DIR || "artifacts/official-source-expansion-diagnostic");
if (args.command === "scan") {
  const files = ["official-source-expansion-diagnostic.json", "official-source-expansion-diagnostic.md"].map((name) => ({ name, text: fs.readFileSync(path.join(outputDir, name), "utf8") }));
  const leaks = findOfficialSourceExpansionLeaks(files, explicitSecretValues());
  if (leaks.length) throw new Error(`Official source expansion diagnostic secret scan failed for ${leaks.length} file(s).`);
  console.log(JSON.stringify({ ok: true, files: files.map((file) => file.name) }));
  process.exit(0);
}
const expectedSha = text(args["expected-main-sha"] || process.env.GITHUB_SHA);
const headSha = currentHeadSha();
if (expectedSha && expectedSha !== headSha) throw new Error("Official source expansion diagnostic main SHA mismatch.");
const mode = normalizeOfficialSourceExpansionMode(args.mode || process.env.OFFICIAL_SOURCE_EXPANSION_MODE);
const snapshot = await fetchOfficialSourceExpansionDiagnostic({ mode, providerCursors: parseCursor(args.cursor || process.env.OFFICIAL_SOURCE_EXPANSION_CURSOR) });
const report = buildOfficialSourceExpansionReport({ snapshot, workflow: { run_id: args["run-id"] || process.env.GITHUB_RUN_ID, head_sha: headSha, event_name: process.env.GITHUB_EVENT_NAME || "local" } });
const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = formatOfficialSourceExpansionMarkdown(report);
const leaks = findOfficialSourceExpansionLeaks([{ name: "official-source-expansion-diagnostic.json", text: json }, { name: "official-source-expansion-diagnostic.md", text: markdown }], explicitSecretValues());
if (leaks.length) throw new Error(`Official source expansion diagnostic secret scan failed for ${leaks.length} file(s).`);
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "official-source-expansion-diagnostic.json"), json);
fs.writeFileSync(path.join(outputDir, "official-source-expansion-diagnostic.md"), markdown);
console.log(JSON.stringify({ ok: true, final_verdict: report.final_verdict, database_writes: 0, output_directory: outputDir }, null, 2));

function currentHeadSha() { const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Current Git revision is unavailable."); return sha; }
function parseArgs(values) { return { command: values.find((value) => !value.startsWith("--")) || "run", ...Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("=")).map((value) => { const [key, ...rest] = value.slice(2).split("="); return [key, rest.join("=")] })) }; }
function parseCursor(value) { if (!value) return {}; try { const parsed = JSON.parse(value); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); return parsed; } catch { throw new Error("Official source expansion cursor must be a JSON object."); } }
function explicitSecretValues() { return [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.RAKUTEN_APPLICATION_ID, process.env.YAHOO_SHOPPING_APP_ID].map(text).filter(Boolean); }
function text(value) { return value == null ? "" : String(value).trim(); }
