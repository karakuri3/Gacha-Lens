import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVariantParentImageConflictAudit } from "../lib/domain/variant-image-parent-conflict.js";

export const MAX_PARENT_IMAGE_CONFLICT_INPUT_BYTES = 4 * 1024 * 1024;
export const MAX_PARENT_IMAGE_CONFLICT_RECORDS = 10_000;

const SAFE_ERROR_CODES = new Set([
  "duplicate_option",
  "input_too_large",
  "invalid_input_json",
  "invalid_input_path",
  "invalid_input_schema",
  "missing_input",
  "unknown_option",
]);

export function parseParentImageConflictArgs(argv = []) {
  let input = "";
  let sawInput = false;
  for (const argument of argv) {
    if (argument.startsWith("--input=")) {
      if (sawInput) throw codedError("duplicate_option");
      sawInput = true;
      input = argument.slice("--input=".length);
    } else {
      throw codedError("unknown_option");
    }
  }
  if (!sawInput || !input) throw codedError("missing_input");
  return { input };
}

export function parseParentImageConflictJson(source) {
  let parsed;
  try {
    parsed = JSON.parse(String(source).replace(/^\uFEFF/, ""));
  } catch {
    throw codedError("invalid_input_json");
  }
  validateInput(parsed);
  return parsed;
}

export async function runParentImageConflictAudit(argv = process.argv.slice(2)) {
  const options = parseParentImageConflictArgs(argv);
  const source = options.input === "-"
    ? await readBoundedStdin()
    : readBoundedLocalFile(options.input);
  const report = buildVariantParentImageConflictAudit(parseParentImageConflictJson(source));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw codedError("invalid_input_schema");
  if (input.schema_version !== 1 || !Array.isArray(input.records)) throw codedError("invalid_input_schema");
  if (input.records.length > MAX_PARENT_IMAGE_CONFLICT_RECORDS) throw codedError("invalid_input_schema");

  for (const record of input.records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw codedError("invalid_input_schema");
    if (!record.variant || !record.parent || !Number.isSafeInteger(record.sibling_count)) throw codedError("invalid_input_schema");
  }
  return true;
}

function readBoundedLocalFile(inputPath) {
  if (isDisallowedPath(inputPath)) throw codedError("invalid_input_path");
  try {
    const resolved = fs.realpathSync(path.resolve(inputPath));
    if (isDisallowedPath(resolved)) throw codedError("invalid_input_path");
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw codedError("invalid_input_path");
    if (stat.size > MAX_PARENT_IMAGE_CONFLICT_INPUT_BYTES) throw codedError("input_too_large");
    return fs.readFileSync(resolved, "utf8");
  } catch (error) {
    if (SAFE_ERROR_CODES.has(error?.code)) throw error;
    throw codedError("invalid_input_path");
  }
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_PARENT_IMAGE_CONFLICT_INPUT_BYTES) throw codedError("input_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isDisallowedPath(value) {
  const input = String(value || "");
  return input.includes("\0")
    || input.startsWith("\\\\")
    || input.startsWith("//")
    || /^[a-z][a-z\d+.-]*:/i.test(input) && !/^[a-z]:[\\/]/i.test(input);
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
    await runParentImageConflictAudit();
  } catch (error) {
    const code = SAFE_ERROR_CODES.has(error?.code) ? error.code : "unexpected_error";
    process.stderr.write(`Parent image conflict audit failed: ${code}\n`);
    process.exitCode = 2;
  }
}
