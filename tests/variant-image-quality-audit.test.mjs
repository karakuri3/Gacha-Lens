import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildVariantImageQualityAudit,
  formatVariantImageQualityAudit,
  MAX_IMAGE_AUDIT_INPUT_BYTES,
  parseVariantImageAuditArgs,
  parseVariantImageAuditJson,
} from "../scripts/variant-image-quality-audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "variant-image-quality-audit.mjs");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "variant-image-quality-audit.json");
const fixtureText = fs.readFileSync(FIXTURE, "utf8");
const fixture = JSON.parse(fixtureText);

test("fixture outcomes reuse truthful presentation semantics", () => {
  const result = buildVariantImageQualityAudit(fixture);

  assert.deepEqual(result.outcome_counts, {
    trusted_variant: 1,
    series_fallback: 2,
    missing: 3,
  });
  assert.deepEqual(result.suppression_counts, {
    generated_placeholder: 1,
    provisional: 1,
  });
  assert.deepEqual(result.records, [
    { index: 0, outcome: "trusted_variant", has_variant_image: true, suppressions: [] },
    { index: 1, outcome: "series_fallback", has_variant_image: false, suppressions: [] },
    { index: 2, outcome: "series_fallback", has_variant_image: false, suppressions: [] },
    { index: 3, outcome: "missing", has_variant_image: false, suppressions: [] },
    { index: 4, outcome: "missing", has_variant_image: false, suppressions: ["generated_placeholder"] },
    { index: 5, outcome: "missing", has_variant_image: false, suppressions: ["provisional"] },
  ]);
  assert.deepEqual(result.safety, {
    network_requests: 0,
    credential_reads: 0,
    production_reads: 0,
    database_writes: 0,
  });
});

test("file and stdin JSON modes are deterministic and equivalent", () => {
  const fileRun = run([`--input=${FIXTURE}`, "--json"]);
  const stdinRun = run(["--input=-", "--json"], fixtureText);

  assert.equal(fileRun.status, 0);
  assert.equal(stdinRun.status, 0);
  assert.equal(fileRun.stderr, "");
  assert.equal(stdinRun.stderr, "");
  assert.equal(fileRun.stdout, stdinRun.stdout);
  assert.deepEqual(JSON.parse(fileRun.stdout), buildVariantImageQualityAudit(fixture));
});

test("human output is deterministic, practical, and contains no source values", () => {
  const report = buildVariantImageQualityAudit(fixture);
  const expected = [
    "Offline variant image audit",
    "Records: 6",
    "Trusted variant: 1",
    "Series fallback: 2",
    "Missing: 3",
    "Generated placeholders suppressed: 1",
    "Provisional variants suppressed: 1",
    "#1 trusted_variant",
    "#2 series_fallback",
    "#3 series_fallback",
    "#4 missing",
    "#5 missing [generated_placeholder]",
    "#6 missing [provisional]",
    "Safety: network=0 credentials=0 production_reads=0 database_writes=0",
  ].join("\n");

  assert.equal(formatVariantImageQualityAudit(report), expected);
  const first = run([`--input=${FIXTURE}`]);
  const second = run([`--input=${FIXTURE}`]);
  assert.equal(first.status, 0);
  assert.equal(first.stdout, `${expected}\n`);
  assert.equal(second.stdout, first.stdout);
  assert.doesNotMatch(first.stdout, /images\.example|bandai-variant|provisional\.jpg/);
});

test("ordinary missing and suppression findings exit successfully", () => {
  const result = run(["--input=-", "--json"], JSON.stringify({
    schema_version: 1,
    records: [{
      variant: { image: "data:image/svg+xml,%3Csvg%3E", variant_type: "provisional" },
      parent: {},
      sibling_count: 1,
    }],
  }));

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).outcome_counts.missing, 1);
  assert.deepEqual(JSON.parse(result.stdout).suppression_counts, {
    generated_placeholder: 1,
    provisional: 1,
  });
});

test("CLI options require one explicit input and reject unknown options", () => {
  assert.deepEqual(parseVariantImageAuditArgs(["--input=-", "--json"]), { input: "-", json: true });
  assert.throws(() => parseVariantImageAuditArgs([]), (error) => error.code === "missing_input");
  assert.throws(() => parseVariantImageAuditArgs(["--input="]), (error) => error.code === "missing_input");
  assert.throws(() => parseVariantImageAuditArgs(["--input=-", "--input=-"]), (error) => error.code === "duplicate_option");
  assert.throws(() => parseVariantImageAuditArgs(["--json", "--json", "--input=-"]), (error) => error.code === "duplicate_option");
  assert.throws(() => parseVariantImageAuditArgs(["--input=-", "--strict"]), (error) => error.code === "unknown_option");
});

test("malformed JSON and invalid schemas fail closed with sanitized errors", () => {
  const cases = [
    { args: [], input: "", code: "missing_input" },
    { args: ["--input=-", "--json"], input: "{secret-json", code: "invalid_input_json" },
    { args: ["--input=-", "--json"], input: JSON.stringify({ schema_version: 2, records: [] }), code: "invalid_input_schema" },
    { args: ["--input=-", "--json"], input: JSON.stringify({ schema_version: 1, records: [{ variant: {}, parent: {}, sibling_count: -1 }] }), code: "invalid_input_schema" },
    { args: ["--input=-", "--json"], input: JSON.stringify({ schema_version: 1, records: [], secret_field: "do-not-print-this" }), code: "invalid_input_schema" },
  ];

  for (const item of cases) {
    const result = run(item.args, item.input);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `Image quality audit failed: ${item.code}\n`);
    assert.doesNotMatch(result.stderr, /secret-json|do-not-print-this/);
  }
});

test("file input rejects URL, UNC, and device-like paths without echoing them", () => {
  for (const input of [
    "https://secret.example/audit.json",
    "file:///secret/audit.json",
    "\\\\secret-server\\share\\audit.json",
    "//secret-server/share/audit.json",
    "\\\\?\\C:\\secret\\audit.json",
    "\\\\.\\C:\\secret\\audit.json",
  ]) {
    const result = run([`--input=${input}`, "--json"]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "Image quality audit failed: invalid_input_path\n");
    assert.equal(result.stderr.includes(input), false);
  }
});

test("file and stdin inputs are bounded", () => {
  const oversized = "x".repeat(MAX_IMAGE_AUDIT_INPUT_BYTES + 1);
  const stdinResult = run(["--input=-", "--json"], oversized);

  assert.equal(stdinResult.status, 2);
  assert.equal(stdinResult.stdout, "");
  assert.equal(stdinResult.stderr, "Image quality audit failed: input_too_large\n");

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "gacha-image-audit-"));
  const oversizedFile = path.join(temporaryDirectory, "oversized.json");
  let fileResult;
  try {
    fs.writeFileSync(oversizedFile, oversized);
    fileResult = run([`--input=${oversizedFile}`, "--json"]);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  assert.equal(fileResult.status, 2);
  assert.equal(fileResult.stdout, "");
  assert.equal(fileResult.stderr, "Image quality audit failed: input_too_large\n");
});

test("JSON output never echoes input identifiers, URLs, or configured-looking secrets", () => {
  const secret = "service-role-secret-value-123456";
  const source = JSON.stringify({
    schema_version: 1,
    records: [{
      variant: { id: secret, image: `https://images.example/item.jpg?token=${secret}`, variant_type: "normal" },
      parent: { id: secret, brand: secret, image_url: `https://images.example/parent.jpg?token=${secret}` },
      sibling_count: 1,
    }],
  });
  const result = run(["--input=-", "--json"], source, {
    SUPABASE_SERVICE_ROLE_KEY: secret,
    GITHUB_TOKEN: secret,
  });

  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, new RegExp(secret));
  assert.doesNotMatch(result.stdout, /images\.example|token=/);
  assert.equal(result.stderr, "");
});

test("implementation has no network, credential, Production, env-loader, or subprocess dependency", () => {
  const source = fs.readFileSync(SCRIPT, "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/i);
  assert.doesNotMatch(source, /@supabase\//i);
  assert.doesNotMatch(source, /process\.env/i);
  assert.doesNotMatch(source, /node:https?/i);
  assert.doesNotMatch(source, /child_process/i);
  assert.doesNotMatch(source, /load(?:Optional)?Env/i);
  assert.match(source, /buildVariantImagePresentation/);
});

test("parser accepts a BOM but rejects non-JSON and unbounded record arrays", () => {
  assert.deepEqual(parseVariantImageAuditJson(`\uFEFF${JSON.stringify({ schema_version: 1, records: [] })}`), {
    schema_version: 1,
    records: [],
  });
  assert.throws(() => parseVariantImageAuditJson("not-json"), (error) => error.code === "invalid_input_json");
  assert.throws(
    () => buildVariantImageQualityAudit({
      schema_version: 1,
      records: Array.from({ length: 10_001 }, () => ({ variant: {}, parent: {}, sibling_count: 0 })),
    }),
    (error) => error.code === "invalid_input_schema",
  );
});

function run(args, input = "", extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    input,
    encoding: "utf8",
    maxBuffer: MAX_IMAGE_AUDIT_INPUT_BYTES * 3,
    env: { ...process.env, ...extraEnv },
  });
}
