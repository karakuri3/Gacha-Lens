const CANDIDATE_KEY = /^[0-9a-f]{16}$/;

export const MARKET_BOUNDED_PERSISTENCE_HARD_CAP = 2;

export class MarketBoundedSelectionError extends Error {
  constructor(message = "Bounded market candidate selection is invalid.") {
    super(message);
    this.name = "MarketBoundedSelectionError";
  }
}

export function selectDeterministicMarketPersistenceCandidates({
  candidates = [],
  selectedVariants = [],
  capacity = MARKET_BOUNDED_PERSISTENCE_HARD_CAP,
} = {}) {
  const limit = Number(capacity);
  if (!Number.isInteger(limit) || limit < 0 || limit > MARKET_BOUNDED_PERSISTENCE_HARD_CAP) {
    throw new MarketBoundedSelectionError("Bounded persistence capacity is invalid.");
  }
  if (!Array.isArray(candidates) || !Array.isArray(selectedVariants)) {
    throw new MarketBoundedSelectionError();
  }

  const variantOrder = selectedVariants.map((entry) => String(entry?.variant_id ?? "").trim());
  if (variantOrder.some((id) => !id) || new Set(variantOrder).size !== variantOrder.length) {
    throw new MarketBoundedSelectionError("Selected variant identity is invalid or duplicated.");
  }

  const keys = candidates.map((candidate) => String(candidate?.candidate_key ?? ""));
  if (keys.some((key) => !CANDIDATE_KEY.test(key)) || new Set(keys).size !== keys.length) {
    throw new MarketBoundedSelectionError("Candidate identity is invalid or duplicated.");
  }

  const selectionByVariant = new Map(selectedVariants.map((entry) => [
    String(entry.variant_id),
    String(entry.series_id ?? "").trim(),
  ]));
  const grouped = new Map(variantOrder.map((variantId) => [variantId, []]));
  for (const candidate of candidates) {
    const variantId = String(candidate?.target?.variant_id ?? "").trim();
    const seriesId = String(candidate?.target?.series_id ?? "").trim();
    if (!grouped.has(variantId) || !seriesId || selectionByVariant.get(variantId) !== seriesId) {
      throw new MarketBoundedSelectionError("Candidate target is outside the approved catalog selection.");
    }
    grouped.get(variantId).push(candidate);
  }
  for (const values of grouped.values()) values.sort(compareWithinVariant);

  const orderedCandidates = [];
  const maximumDepth = Math.max(0, ...[...grouped.values()].map((values) => values.length));
  for (let depth = 0; depth < maximumDepth; depth += 1) {
    for (const variantId of variantOrder) {
      const candidate = grouped.get(variantId)[depth];
      if (candidate) orderedCandidates.push(candidate);
    }
  }

  const selected = orderedCandidates.slice(0, limit);
  const selectedKeys = new Set(selected.map((candidate) => candidate.candidate_key));
  const safeNotSelected = orderedCandidates
    .filter((candidate) => !selectedKeys.has(candidate.candidate_key))
    .sort((left, right) => left.candidate_key.localeCompare(right.candidate_key, "en"));

  return {
    selected,
    safeNotSelected,
    selectedCandidateKeys: selected.map((candidate) => candidate.candidate_key),
    safeNotSelectedCandidateKeys: safeNotSelected.map((candidate) => candidate.candidate_key),
    selectedDistinctVariantCount: new Set(selected.map((candidate) => candidate.target.variant_id)).size,
  };
}

function compareWithinVariant(left, right) {
  for (const [leftValue, rightValue] of [
    [left?.checks?.explicit_label_target_match === true, right?.checks?.explicit_label_target_match === true],
    [left?.checks?.parent_series_exact_evidence_present === true, right?.checks?.parent_series_exact_evidence_present === true],
    [discriminatorSatisfied(left), discriminatorSatisfied(right)],
  ]) {
    if (leftValue !== rightValue) return leftValue ? -1 : 1;
  }

  const confidenceDifference = Number(right?.assessment?.confidence) - Number(left?.assessment?.confidence);
  if (Number.isFinite(confidenceDifference) && confidenceDifference !== 0) return confidenceDifference;
  return String(left?.candidate_key ?? "").localeCompare(String(right?.candidate_key ?? ""), "en");
}

function discriminatorSatisfied(candidate) {
  return candidate?.checks?.parent_series_discriminator_required !== true
    || candidate?.checks?.parent_series_discriminator_evidence_present === true;
}
