import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildVariantImagePresentation,
  isGeneratedImagePlaceholder,
} from "../lib/domain/variant-image-presentation.js";

export const MAX_IMAGE_AUDIT_INPUT_BYTES = 1024 * 1024;
export const MAX_IMAGE_AUDIT_RECORDS = 10_000;

const MAX_STRING_LENGTH = 16_384;
const OUTCOMES = ["trusted_variant", "series_fallback", "missing"];
const SUPPRESSIONS = ["generated_placeholder", "provisional"];
const TOP_LEVEL_KEYS = new Set(["schema_version", "records"]);
const RECORD_KEYS = new Set(["variant", "parent", "sibling_count"]);
const VARIANT_KEYS = new Set(["id", "image", "image_url", "imageUrl", "variant_type", "image_scope", "raw"]);
const PARENT_KEYS = new Set(["id", "brand", "image_url", "imageUrl"]);
const RAW_KEYS = new Set(["image_scope"]);
const SAFE_ERROR_CODES = new Set([
  "duplicate_option",
  "input_too_large",
  "invalid_input_json",
  "invalid_input_path",
  "invalid_input_schema",
  "missing_input",
  "unknown_option",
]);

export function buildVariantImageQualityAudit(input) {
  validateImageAuditInput(input);
  const records = input.records.map((record, index) => auditRecord(record, index));
  const outcomeCounts = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
  const suppressionCounts = Object.fromEntries(SUPPRESSIONS.map((suppression) => [suppression, 0]));

  for (const record of records) {
    outcomeCounts[record.outcome] += 1;
    for (const suppression of record.suppressions) suppressionCounts[suppression] += 1;
  }

  return {
    schema_version: 1,
    mode: "offline",
    record_count: records.length,
    outcome_counts: outcomeCounts,
    suppression_counts: suppressionCounts,
    records,
    safety: {
      network_requests: 0,
      credential_reads: 0,
      production_reads: 0,
      database_writes: 0,
    },
  };
}

export function formatVariantImageQualityAudit(report) {
  const lines = [
    "Offline variant image audit",
    `Records: ${report.record_count}`,
    `Trusted variant: ${report.outcome_counts.trusted_variant}`,
    `Series fallback: ${report.outcome_counts.series_fallback}`,
    `Missing: ${report.outcome_counts.missing}`,
    `Generated placeholders suppressed: ${report.suppression_counts.generated_placeholder}`,
    `Provisional variants suppressed: ${report.suppression_counts.provisional}`,
  ];

  for (const record of report.records) {
    const suffix = record.suppressions.length ? ` [${record.suppressions.join(", ")}]` : "";
    lines.push(`#${record.index + 1} ${record.outcome}${suffix}`);
  }

  lines.push("Safety: network=0 credentials=0 production_reads=0 database_writes=0");
  return lines.join("\n");
}

export function parseVariantImageAuditArgs(argv = []) {
  let input = "";
  let json = false;
  let sawInput = false;
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

export function parseVariantImageAuditJson(source) {
  let parsed;
  try {
    parsed = JSON.parse(String(source).replace(/^\uFEFF/, ""));
  } catch {
    throw codedError("invalid_input_json");
  }
  validateImageAuditInput(parsed);
  return parsed;
}

export async function runVariantImageQualityAudit(argv = process.argv.slice(2)) {
  const options = parseVariantImageAuditArgs(argv);
  const source = options.input === "-"
    ? await readBoundedStdin()
    : readBoundedLocalFile(options.input);
  const report = buildVariantImageQualityAudit(parseVariantImageAuditJson(source));
  process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : formatVariantImageQualityAudit(report)}\n`);
}

function auditRecord(record, index) {
  const presentation = buildVariantImagePresentation({
    variant: record.variant,
    parent: record.parent,
    siblingCount: record.sibling_count,
  });
  const candidate = record.variant.image || record.variant.image_url || record.variant.imageUrl || "";
  const hasCandidate = String(candidate).trim().length > 0;
  const suppressions = [];

  if (!presentation.has_variant_image && hasCandidate && isGeneratedImagePlaceholder(candidate)) {
    suppressions.push("generated_placeholder");
  }
  if (!presentation.has_variant_image && hasCandidate && record.variant.variant_type === "provisional") {
    suppressions.push("provisional");
  }

  return {
    index,
    outcome: presentation.image_scope === "variant" ? "trusted_variant" : presentation.image_scope,
    has_variant_image: presentation.has_variant_image,
    suppressions,
  };
}

function validateImageAuditInput(input) {
  assertPlainObject(input);
  assertOnlyKeys(input, TOP_LEVEL_KEYS);
  if (input.schema_version !== 1 || !Array.isArray(input.records)) throw codedError("invalid_input_schema");
  if (input.records.length > MAX_IMAGE_AUDIT_RECORDS) throw codedError("invalid_input_schema");

  for (const record of input.records) {
    assertPlainObject(record);
    assertOnlyKeys(record, RECORD_KEYS);
    if (!("variant" in record) || !("parent" in record) || !("sibling_count" in record)) {
      throw codedError("invalid_input_schema");
    }
    assertPlainObject(record.variant);
    assertPlainObject(record.parent);
    assertOnlyKeys(record.variant, VARIANT_KEYS);
    assertOnlyKeys(record.parent, PARENT_KEYS);
    assertOptionalStrings(record.variant, ["id", "image", "image_url", "imageUrl", "variant_type", "image_scope"]);
    assertOptionalStrings(record.parent, ["id", "brand", "image_url", "imageUrl"]);
    if (!Number.isSafeInteger(record.sibling_count) || record.sibling_count < 0 || record.sibling_count > MAX_IMAGE_AUDIT_RECORDS) {
      throw codedError("invalid_input_schema");
    }
    if ("raw" in record.variant) {
      assertPlainObject(record.variant.raw);
      assertOnlyKeys(record.variant.raw, RAW_KEYS);
      assertOptionalStrings(record.variant.raw, ["image_scope"]);
    }
  }

  return true;
}

function assertPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw codedError("invalid_input_schema");
  }
}

function assertOnlyKeys(value, allowed) {
  if (Object.keys(value).some((key) => !allowed.has(key))) throw codedError("invalid_input_schema");
}

function assertOptionalStrings(value, keys) {
  for (const key of keys) {
    if (!(key in value) || value[key] == null) continue;
    if (typeof value[key] !== "string" || value[key].length > MAX_STRING_LENGTH) {
      throw codedError("invalid_input_schema");
    }
  }
}

function readBoundedLocalFile(inputPath) {
  if (isDisallowedPath(inputPath)) throw codedError("invalid_input_path");

  try {
    const resolved = fs.realpathSync(path.resolve(inputPath));
    if (isDisallowedPath(resolved)) throw codedError("invalid_input_path");
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw codedError("invalid_input_path");
    if (stat.size > MAX_IMAGE_AUDIT_INPUT_BYTES) throw codedError("input_too_large");
    const contents = fs.readFileSync(resolved);
    if (contents.byteLength > MAX_IMAGE_AUDIT_INPUT_BYTES) throw codedError("input_too_large");
    return contents.toString("utf8");
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
    if (bytes > MAX_IMAGE_AUDIT_INPUT_BYTES) throw codedError("input_too_large");
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
    await runVariantImageQualityAudit();
  } catch (error) {
    const code = SAFE_ERROR_CODES.has(error?.code) ? error.code : "unexpected_error";
    process.stderr.write(`Image quality audit failed: ${code}\n`);
    process.exitCode = 2;
  }
}
