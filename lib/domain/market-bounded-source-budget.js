const MARKET_BOUNDED_STAGE = "market-bounded";

export function resolveMarketBoundedProviderResultLimit({
  stage,
  fixedStage,
  discoveryRequests,
  maxCandidates,
} = {}) {
  const effectiveStage = clean(fixedStage) || clean(stage);
  if (effectiveStage !== MARKET_BOUNDED_STAGE) return null;

  const requests = integer(discoveryRequests);
  const candidateLimit = integer(maxCandidates);
  if (requests == null || requests < 0 || candidateLimit == null || candidateLimit < 1) {
    throw new Error("Market-bounded source budget requires a nonnegative discovery request count and positive candidate limit.");
  }
  if (requests === 0) return 1;

  return Math.max(1, Math.floor(candidateLimit / requests));
}

export function buildMarketBoundedFetcherOptions(input = {}) {
  const resultLimit = resolveMarketBoundedProviderResultLimit(input);
  if (resultLimit == null) return {};
  return {
    rakuten: { hits: resultLimit },
    yahoo: { results: resultLimit },
  };
}

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function clean(value) {
  return String(value ?? "").trim();
}
