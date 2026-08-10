import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isReviewedProductionWorkflow,
  productionWorkflowDigest,
  REVIEWED_PRODUCTION_WORKFLOW_DIGESTS,
} from "../lib/domain/market-workflow-evidence.js";

const PHASE_6_F_2_DIGEST = "11f35c5bba9c4dbd7559d06d5273da15bae939e0134b7c5419e82939212d183e";
const STALE_DIGEST = "f18afcb0ec0bbec8e1bf69a12c95d00c2914759f1fa801f44db11550668208f8";
const WINDOWS_RAW_DIGEST = "031e7133203c2cd6866f1b82c4e7721a6ba76ef95b6e517df7509a17f4b63877";

test("LF, CRLF, and standalone CR produce the same workflow digest", () => {
  const lf = "name: Gacha ingestion\non:\n  workflow_dispatch:\n";
  assert.equal(productionWorkflowDigest(lf.replaceAll("\n", "\r\n")), productionWorkflowDigest(lf));
  assert.equal(productionWorkflowDigest(lf.replaceAll("\n", "\r")), productionWorkflowDigest(lf));
});

test("Buffer and string inputs produce the same workflow digest", () => {
  const source = "name: Gacha ingestion\non:\n  workflow_dispatch:\n";
  assert.equal(productionWorkflowDigest(Buffer.from(source)), productionWorkflowDigest(source));
});

test("content changes and trailing newline changes remain detectable", () => {
  const source = "name: Gacha ingestion\n";
  assert.notEqual(productionWorkflowDigest(source), productionWorkflowDigest("name: Gacha Ingestion\n"));
  assert.notEqual(productionWorkflowDigest(source), productionWorkflowDigest(source.trimEnd()));
});

test("the committed Production workflow resolves to the reviewed Phase 6-F.2 digest", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gacha-ingestion.yml", import.meta.url));
  assert.equal(productionWorkflowDigest(workflow), PHASE_6_F_2_DIGEST);
  assert.equal(isReviewedProductionWorkflow(workflow), true);
});

test("the allowlist contains the reviewed Phase 6-F.2 digest once", () => {
  assert.equal(REVIEWED_PRODUCTION_WORKFLOW_DIGESTS.filter((digest) => digest === PHASE_6_F_2_DIGEST).length, 1);
  assert.equal(REVIEWED_PRODUCTION_WORKFLOW_DIGESTS.includes(STALE_DIGEST), false);
  assert.equal(REVIEWED_PRODUCTION_WORKFLOW_DIGESTS.includes(WINDOWS_RAW_DIGEST), false);
});
