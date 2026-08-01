import { createHash } from "node:crypto";

// The Phase 4 manifest remains immutable. Reviewed safety-only workflow revisions are
// allowlisted here so canary evidence stays usable without rewriting historical proof.
export const REVIEWED_PRODUCTION_WORKFLOW_DIGESTS = Object.freeze([
  "be6644f99a5f7636ffa64faad287e3e98c8b5ab87b34fc986a5bb062a6e10da2",
  "038a20d1e323d8fc1f7e84eaead6bd983b6aa61d05e20c1bf300491b78febab1",
]);

export function productionWorkflowDigest(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function isReviewedProductionWorkflow(source, historicalDigest) {
  const digest = productionWorkflowDigest(source);
  const historical = String(historicalDigest ?? "").toLowerCase();
  return digest === historical || REVIEWED_PRODUCTION_WORKFLOW_DIGESTS.includes(digest);
}
