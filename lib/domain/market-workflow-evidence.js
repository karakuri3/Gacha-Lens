import { createHash } from "node:crypto";

// The Phase 4 manifest remains immutable. Reviewed safety-only workflow revisions are
// allowlisted here so canary evidence stays usable without rewriting historical proof.
export const REVIEWED_PRODUCTION_WORKFLOW_DIGESTS = Object.freeze([
  "be6644f99a5f7636ffa64faad287e3e98c8b5ab87b34fc986a5bb062a6e10da2",
  "038a20d1e323d8fc1f7e84eaead6bd983b6aa61d05e20c1bf300491b78febab1",
  // Phase 6-C: scheduled runs resolve the reviewed staged-rollout gate.
  "7ed80bf106ba0f0a7cc50baf7cc58af3d845c28ca56d88f04d368535e351bd82",
  // Phase 6-D: digest of the final committed workflow with LF line endings.
  "f09197b1c6599fa7a624ce31260d2345a376da66e2af1ff54a6a6a072133d9b8",
  // Phase 6-F.2: official and stock scheduled routes are explicit no-ops.
  "11f35c5bba9c4dbd7559d06d5273da15bae939e0134b7c5419e82939212d183e",
]);

function normalizeWorkflowLineEndings(source) {
  const text = Buffer.isBuffer(source)
    ? source.toString("utf8")
    : String(source ?? "");

  return text.replace(/\r\n?/g, "\n");
}

export function productionWorkflowDigest(source) {
  return createHash("sha256")
    .update(normalizeWorkflowLineEndings(source))
    .digest("hex");
}

export function isReviewedProductionWorkflow(source, historicalDigest) {
  const digest = productionWorkflowDigest(source);
  const historical = String(historicalDigest ?? "").toLowerCase();
  return digest === historical || REVIEWED_PRODUCTION_WORKFLOW_DIGESTS.includes(digest);
}
