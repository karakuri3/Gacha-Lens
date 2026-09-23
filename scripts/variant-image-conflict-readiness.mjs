import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVariantImageConflictReadiness } from "../lib/domain/variant-image-conflict-readiness.js";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_RECORDS = 20_000;
const SAFE_ERROR_CODES = new Set([
  "duplicate_option",
  "input_too_large",
  "invalid_input_json",
  "invalid_input_path",
  "invalid_input_schema",
  "missing_input",
  "unknown_option",
]);

export function parseArgs(argv = []) {
  let input = "";
  let sawInput = false;
  let json = false;
  let sawJson = false;

  for (const argument of argv) {
    if (argument.startsWith("--input=")) {
      if (sawInput) throw codedError("duplicate_option");
      sawInput = true;
      input = argument.slice("--input=".length);
    } else if (argument === "--json") {
      if (sawJson) throw codedError("duplicate_option");
      sawJson = true;
      json = true;
    } else {
      throw codedError("unknown_option");
    }
  }

  if (!sawInput || !input) throw codedError("missing_input");
  return { input, json };
}

export function parseInput(source) {
  let parsed;
  try {
    parsed = JSON.parse(String(source).replace(/^\uFEFF/, ""));
  } catch {
    throw codedError("invalid_input_json");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.schema_version !== 1 || !Array.isArray(parsed.records)) {
    throw codedError("invalid_input_schema");
  }
  if (parsed.records.length > MAX_RECORDS) throw codedError("invalid_input_schema");

  for (const record of parsed.records) validateRecord(record);
  return parsed;
}

export function formatReadiness(report) {
  return [
    "Offline variant image conflict readiness",
    `Records: ${report.record_count}`,
    `Safe clear candidates: ${report.safe_clear_count}`,
    `Manual review: ${report.manual_review_count}`,
    `No action: ${report.no_action_count}`,
    ...Object.entries(report.classification_counts).map(([key, value]) => `${key}: ${value}`),
    "Safety: network=0 credentials=0 production_reads=0 database_writes=0",
  ].join("\n");
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const source = options.input === "-" ? await readStdin() : readLocalFile(options.input);
  const report = buildVariantImageConflictReadiness(parseInput(source));
  process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : formatReadiness(report)}\n`);
}

function validateRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw codedError("invalid_input_schema");
  if (!record.variant || typeof record.variant !== "object" || Array.isArray(record.variant)) throw codedError("invalid_input_schema");
  if (!record.parent || typeof record.parent !== "object" || Array.isArray(record.parent)) throw codedError("invalid_input_schema");
  if (!Number.isSafeInteger(record.sibling_count) || record.sibling_count < 0 || record.sibling_count > MAX_RECORDS) {
    throw codedError("invalid_input_schema");
  }
}

function readLocalFile(inputPath) {
  if (isDisallowedPath(inputPath)) throw codedError("invalid_input_path");

  try {
    const resolved = fs.realpathSync(path.resolve(inputPath));
    if (isDisallowedPath(resolved)) throw codedError("invalid_input_path");
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw codedError("invalid_input_path");
    if (stat.size > MAX_INPUT_BYTES) throw codedError("input_too_large");
    return fs.readFileSync(resolved, "utf8");
  } catch (error) {
    if (SAFE_ERROR_CODES.has(error?.code)) throw error;
    throw codedError("invalid_input_path");
  }
}

async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_INPUT_BYTES) throw codedError("input_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isDisallowedPath(value) {
  const input = String(value || "");
  return input.includes("\0")
    || input.startsWith("\\\\")
    || input.startsWith("//")
    || (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^[a-z]:[\\/]/i.test(input));
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isDirectExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    await run();
  } catch (error) {
    const code = SAFE_ERROR_CODES.has(error?.code) ? error.code : "unexpected_error";
    process.stderr.write(`Variant image conflict readiness failed: ${code}\n`);
    process.exitCode = 2;
  }
}
