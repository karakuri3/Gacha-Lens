export const DATA_ENGINE_SCHEDULE = "17 */6 * * *";
export const DATA_ENGINE_MARKET_PRIORITIES = Object.freeze([3, 5, 2, 1]);
export const DATA_ENGINE_MARKET_LIMIT = 25;
export const DATA_ENGINE_MARKET_QUERY_LIMIT = 25;
export const DATA_ENGINE_MARKET_MAX_VARIANTS_PER_SERIES = 1;
export const DATA_ENGINE_RAKUTEN_QUERY_LIMIT = 25;
export const DATA_ENGINE_YAHOO_QUERY_LIMIT = 25;
export const DATA_ENGINE_ALLOWED_PROVIDERS = Object.freeze(["rakuten_ichiba", "yahoo_shopping"]);
export const DATA_ENGINE_MARKET_ACCEPTED_REASON = "variant_and_parent_evidence_confirmed";
export const DATA_ENGINE_MARKET_MIN_CONFIDENCE = 0.86;

export function validateDataEngineInvocation({ eventName, ref, headSha, originMainSha } = {}) {
  const head = String(headSha ?? "").trim();
  const origin = String(originMainSha ?? "").trim();
  if (!["schedule", "push"].includes(eventName) || ref !== "refs/heads/main") {
    throw new Error("Data Engine may run only from scheduled or bootstrap main events.");
  }
  if (!/^[0-9a-f]{40}$/.test(head) || head !== origin) {
    throw new Error("Data Engine main revision is not exact.");
  }
  return true;
}

export function marketLaneName(priority) {
  const value = Number(priority);
  if (![1, 2, 3, 5].includes(value)) throw new Error("Unsupported Data Engine market priority.");
  return `market-p${value}`;
}
