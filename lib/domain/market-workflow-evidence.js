import { createHash } from "node:crypto";

// The Phase 4 manifest remains immutable. Reviewed safety-only workflow revisions are
// allowlisted here so canary evidence stays usable without rewriting historical proof.
export const REVIEWED_PRODUCTION_WORKFLOW_DIGESTS = Object.freeze([
  "be6644f99a5f7636ffa64faad287e3e98c8b5ab87b34fc986a5bb062a6e10da2",
  "038a20d1e323d8fc1f7e84eaead6bd983b6aa61d05e20c1bf300491b78febab1",
  // Phase 6-C: scheduled runs resolve the reviewed staged-rollout gate.
  "7ed80bf106ba0f0a7cc50baf7cc58af3d845c28ca56d88f04d368535e351bd82",
  // Phase 6-D: exact gated bounded persistence with disabled-by-default arming.
  "f18afcb0ec0bbec8e1bf69a12c95d00c2914759f1fa801f44db11550668208f8",
]);

export function productionWorkflowDigest(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function isReviewedProductionWorkflow(source, historicalDigest) {
  const digest = productionWorkflowDigest(source);
  const historical = String(historicalDigest ?? "").toLowerCase();
  return digest === historical || REVIEWED_PRODUCTION_WORKFLOW_DIGESTS.includes(digest);
}
