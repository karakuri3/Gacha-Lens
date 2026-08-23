const MAX_VARIANTS = 5;
const MAX_QUERY_LENGTH = 160;
const CONTROL = /[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const FORBIDDEN = /(application.?id|access.?key|app.?id|affiliate.?id|api.?key|authorization|cookie|headers?|environment|token|secret|password|service.?role|raw|seller|credential|response)/i;

export function buildPriorityThreeSeedQueryPlanArtifact(plan = {}) {
  if (!Array.isArray(plan.selected) || !Array.isArray(plan.queries)) {
    throw new Error("Priority 3 seed query plan is incomplete.");
  }
  inspect(plan);

  const selectedByVariant = new Map(plan.selected.map((entry) => [String(entry?.variantId || ""), entry]));
  const entries = [];
  const seenVariantIds = new Set();

  for (const query of plan.queries) {
    const variantId = text(query?.variant_id, 140);
    if (!variantId || seenVariantIds.has(variantId)) continue;
    const selected = selectedByVariant.get(variantId);
    if (!selected || Number(query?.priority) !== 3 || Number(selected.priority) !== 3) {
      throw new Error("Priority 3 seed query plan contains an invalid selection.");
    }
    const primaryQuery = queryText(query?.query);
    const primaryKey = primaryQuery.toLowerCase();
    const fallbackQueries = uniqueQueries(query?.fallback_queries).filter((value) => value.toLowerCase() !== primaryKey);
    entries.push({
      variant_id: variantId,
      variant_name: text(selected.variantName, 160),
      series_id: text(query?.series_id || selected.seriesId, 140),
      series_name: text(selected.seriesName, 200),
      priority: 3,
      priority_reason: text(query?.priority_reason || selected.priorityReason, 100),
      primary_query: primaryQuery,
      fallback_queries: fallbackQueries,
    });
    seenVariantIds.add(variantId);
  }

  if (!entries.length || entries.length > MAX_VARIANTS || entries.length !== plan.selected.length) {
    throw new Error("Priority 3 seed query plan selection is invalid.");
  }

  const artifact = {
    schema_version: 1,
    kind: "priority_3_seed_read_only_query_plan",
    priority: 3,
    selected_variant_count: entries.length,
    query_attempt_count: entries.reduce((count, entry) => count + 1 + entry.fallback_queries.length, 0),
    selected_variants: entries,
  };
  assertSafeArtifact(artifact);
  return artifact;
}

export function renderPriorityThreeSeedQueryPlanMarkdown(artifact) {
  assertSafeArtifact(artifact);
  const lines = [
    "# Priority 3 Seed Query Plan",
    "",
    "- Priority: 3",
    "- Read-only: true",
    "- Canary/write eligible: false",
    `- Selected variants: ${artifact.selected_variant_count}`,
    `- Planned query attempts: ${artifact.query_attempt_count}`,
    "",
    "| Variant | Series | Primary query | Fallback queries |",
    "|---|---|---|---|",
    ...artifact.selected_variants.map((entry) => [
      entry.variant_name || entry.variant_id,
      entry.series_name || entry.series_id,
      entry.primary_query,
      entry.fallback_queries.join(" / ") || "-",
    ].map(markdown).join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
  ];
  return lines.join("\n");
}

function assertSafeArtifact(artifact) {
  if (!artifact || artifact.kind !== "priority_3_seed_read_only_query_plan" || artifact.priority !== 3) {
    throw new Error("Priority 3 seed query plan contract is invalid.");
  }
  if (!Array.isArray(artifact.selected_variants) || artifact.selected_variants.length < 1 || artifact.selected_variants.length > MAX_VARIANTS) {
    throw new Error("Priority 3 seed query plan variant count is invalid.");
  }
  if (artifact.selected_variant_count !== artifact.selected_variants.length) {
    throw new Error("Priority 3 seed query plan count is invalid.");
  }
  const variantIds = new Set();
  for (const entry of artifact.selected_variants) {
    if (!entry.variant_id || variantIds.has(entry.variant_id) || entry.priority !== 3 || !entry.primary_query) {
      throw new Error("Priority 3 seed query plan entry is invalid.");
    }
    variantIds.add(entry.variant_id);
  }
  if (!Number.isInteger(artifact.query_attempt_count) || artifact.query_attempt_count < artifact.selected_variant_count) {
    throw new Error("Priority 3 seed query plan attempt count is invalid.");
  }
  inspect(artifact);
}

function uniqueQueries(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(queryText).filter((query) => {
    const key = query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function queryText(value) {
  const result = text(value, MAX_QUERY_LENGTH);
  if (!result) throw new Error("Priority 3 seed query plan contains an empty query.");
  return result;
}

function text(value, limit) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(CONTROL, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function inspect(value) {
  if (Array.isArray(value)) return value.forEach(inspect);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN.test(key)) throw new Error("Priority 3 seed query plan contains a forbidden field.");
    inspect(child);
  }
}

function markdown(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}
