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

// Scheduled market-bounded runs execute up to hourly. Rotating the tie-break
// bucket per hour (instead of the default per day) keeps runs that found no
// persistable candidates from re-querying the same five variants all day.
export function scheduledBoundedRotationOptions(options = {}, env = process.env, now = new Date()) {
  if (options.readOnlySeedAudit) return {};
  const stage = String(env.FIXED_ROLLOUT_STAGE || env.AUTOMATIC_INGESTION_ROLLOUT_STAGE || "").trim();
  if (stage !== "market-bounded" || String(env.GITHUB_EVENT_NAME || "") !== "schedule") return {};
  return { rotationKey: `market-bounded-hourly:${now.toISOString().slice(0, 13)}` };
}

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function clean(value) {
  return String(value ?? "").trim();
}
