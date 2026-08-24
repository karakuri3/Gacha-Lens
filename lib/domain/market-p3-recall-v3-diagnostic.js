const PROVIDERS = new Map([
  ["rakuten", "rakuten_ichiba"],
  ["rakuten_ichiba", "rakuten_ichiba"],
  ["yahoo", "yahoo_shopping"],
  ["yahoo_shopping", "yahoo_shopping"],
]);

export function normalizeDiagnosticProvider(record = {}) {
  for (const value of [record.source, record.raw?.provider]) {
    const provider = PROVIDERS.get(String(value ?? "").trim().toLowerCase());
    if (provider) return provider;
  }
  return null;
}

export function buildRecallV3VariantArm(query, records = [], candidates = [], requestDiagnostics = {}) {
  const matching = records.filter((record) => record.raw?.query?.variant_id === query.variant_id);
  const matchedCandidates = candidates.filter((candidate) => candidate.target?.variant_id === query.variant_id);
  const providersQueried = providersForQuery(query, requestDiagnostics);
  return {
    variant_id: query.variant_id,
    series_id: query.series_id,
    root_query: safeText(query.root_query ?? query.query, 300),
    fallback_queries: (query.fallback_queries ?? []).map((value) => safeText(value, 300)),
    providers_queried: providersQueried,
    rakuten_result_count: matching.filter((record) => normalizeDiagnosticProvider(record) === "rakuten_ichiba").length,
    yahoo_result_count: matching.filter((record) => normalizeDiagnosticProvider(record) === "yahoo_shopping").length,
    candidate_count: matchedCandidates.length,
    accepted: matchedCandidates.some((candidate) => candidate.assessment?.accepted === true),
    review: matchedCandidates.some((candidate) => candidate.assessment?.review_required === true),
    safety_reasons: [...new Set(matchedCandidates.map((candidate) => candidate.assessment?.reason).filter(Boolean))].sort(),
    executed_query: safeText(matching[0]?.raw?.executed_query ?? matching[0]?.raw?.query?.query ?? "", 300),
  };
}

export function buildRecallV3Comparison(targets, series, arms) {
  return targets.map((variant, index) => {
    const base = arms.v2_baseline.per_variant[index];
    const full = arms.v2_full_provider_coverage.per_variant[index];
    const v3 = arms.recall_v3.per_variant[index];
    const baseHasResult = hasResult(base);
    const fullHasResult = hasResult(full);
    return {
      variant_id: variant.id,
      official_series: safeText(series[index]?.name, 300),
      official_variant: safeText(variant.name, 300),
      root_query: v3.root_query,
      fallback_queries: v3.fallback_queries,
      providers_queried: v3.providers_queried,
      rakuten_result_count: v3.rakuten_result_count,
      yahoo_result_count: v3.yahoo_result_count,
      baseline_has_result: baseHasResult,
      full_provider_added_result: !baseHasResult && fullHasResult,
      recall_v3_added_result: !fullHasResult && hasResult(v3),
      candidate_count: { baseline: base.candidate_count, full_provider: full.candidate_count, recall_v3: v3.candidate_count },
      accepted: v3.accepted,
      review: v3.review,
      safety_reasons: v3.safety_reasons,
      executed_query: v3.executed_query,
    };
  });
}

function providersForQuery(query, requestDiagnostics) {
  const queryTexts = new Set([query.root_query ?? query.query, ...(query.fallback_queries ?? [])].map(normalizeQuery));
  return [...new Set((requestDiagnostics.queries ?? [])
    .filter((entry) => queryTexts.has(normalizeQuery(entry.query)))
    .map((entry) => normalizeDiagnosticProvider({ source: entry.provider }))
    .filter(Boolean))]
    .sort();
}

function hasResult(arm) {
  return Number(arm?.rakuten_result_count ?? 0) + Number(arm?.yahoo_result_count ?? 0) > 0;
}

function normalizeQuery(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function safeText(value, max) {
  return String(value ?? "").normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ").trim().slice(0, max);
}
