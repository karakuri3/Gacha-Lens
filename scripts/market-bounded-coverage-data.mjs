import { buildMarketBoundedCoverageSnapshot } from "../lib/domain/market-bounded-coverage.js";
import { fetchRows } from "./supabase-rest.mjs";

export async function loadMarketBoundedCoverageSnapshot(options = {}) {
  const fetchRowsImpl = options.fetchRowsImpl ?? fetchRows;
  const rows = await fetchRowsImpl("market_listing_observations", {
    select: "id,listing_id,variant_id,observed_at,raw",
    pageSize: 1000,
    params: {
      id: "like.market-bounded-observation-*",
      order: "id.asc",
    },
    operationName: "market_bounded.coverage_history",
  });
  return buildMarketBoundedCoverageSnapshot(rows, {
    exclude_workflow_run_id: options.workflow?.run_id,
    exclude_workflow_run_attempt: options.workflow?.run_attempt,
  });
}
