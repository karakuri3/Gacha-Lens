const BRACKET_PAIRS = new Map([
  ["[", "]"],
  ["［", "］"],
  ["【", "】"],
  ["(", ")"],
  ["（", "）"],
]);

const IGNORED_LABEL_PATTERNS = [
  /^(?:ネコポス|ゆうパケット|メール便|宅配便).*(?:対応|配送)?$/i,
  /^(?:即納|在庫品|在庫あり|予約|新品|中古)(?:\s|・)*(?:在庫品)?$/i,
  /^(?:数量限定|期間限定|店舗限定|限定)$/i,
  /^(?:単品|バラ売り|セット)$/i,
  /^[a-z]$/i,
];

const LEADING_ITEM_NUMBER = /^\s*(?:\d{1,2})\s*[.．:：\-]\s*/u;
const TRAILING_VARIANT_MARKER = /(?:\s*(?:ver\.?\s*[abc]|カラー\s*[abc]|[abc]|[123]|iii|ii|i))\s*$/iu;
const EXPLICIT_EDITION_PREFIX = /^(?:第2弾|第二弾|vol(?:ume)?2|part2)/iu;
const EXPLICIT_EDITION_WORD = /(?:クラシック|classic)/iu;

export function analyzeExplicitMarketLabels(title, variants = [], targetVariantId = "") {
  const labels = extractBracketLabels(title).filter((entry) => !isIgnoredLabel(entry.text));
  const productLabels = labels.map((entry) => ({
    ...entry,
    matchedVariantIds: selectMostSpecificVariantIds(variants
      .filter((variant) => explicitLabelMatchesVariant(entry.text, variant?.name))
      .map((variant) => ({
        id: String(variant.id),
        normalizedName: compact(variant.name),
      }))),
  })).filter((entry) => entry.matchedVariantIds.length > 0);
  const matchedVariantIds = [...new Set(productLabels.flatMap((entry) => entry.matchedVariantIds))];

  return {
    explicitLabelPresent: productLabels.length > 0,
    explicitLabelTargetMatch: matchedVariantIds.includes(String(targetVariantId)),
    explicitLabelOtherVariantMatch: matchedVariantIds.some((id) => id !== String(targetVariantId)),
    matchedVariantIds,
    firstProductLabelStart: productLabels.length > 0
      ? Math.min(...productLabels.map((entry) => entry.start))
      : null,
  };
}

function selectMostSpecificVariantIds(matches) {
  return matches
    .filter((match) => !matches.some((other) => (
      other.id !== match.id
      && other.normalizedName.length > match.normalizedName.length
      && other.normalizedName.includes(match.normalizedName)
    )))
    .map((match) => match.id);
}

export function extractBracketLabels(value) {
  const source = String(value ?? "").normalize("NFKC").slice(0, 1000);
  const result = [];
  for (let index = 0; index < source.length; index += 1) {
    const open = source[index];
    const close = BRACKET_PAIRS.get(open);
    if (!close) continue;
    const end = findClosingBracket(source, index, open, close);
    if (end < 0) continue;
    const text = source.slice(index + 1, end).trim();
    if (text) result.push({ text, start: index, end: end + 1 });
  }
  return result;
}

export function explicitLabelMatchesVariant(label, variantName) {
  const variant = compact(variantName);
  if (variant.length < 2) return false;
  const normalizedLabel = String(label ?? "").normalize("NFKC").toLowerCase();
  const withoutOrdinal = normalizedLabel.replace(LEADING_ITEM_NUMBER, "");
  const candidates = new Set([
    compact(withoutOrdinal),
    compact(withoutOrdinal.replace(TRAILING_VARIANT_MARKER, "")),
  ]);
  return [...candidates].some((candidate) => (
    candidate === variant
    || candidate.startsWith(variant)
    || candidate.endsWith(variant)
  ));
}

export function detectParentSeriesEditionConflict({
  title,
  parentSeriesName,
  targetVariantName,
  siblingVariantNames = [],
  beforeIndex = null,
} = {}) {
  const source = String(title ?? "").normalize("NFKC").toLowerCase().slice(0, 1000);
  const bounded = Number.isInteger(beforeIndex) && beforeIndex >= 0
    ? source.slice(0, beforeIndex)
    : source;
  const compactTitle = compact(bounded);
  const compactParent = compact(parentSeriesName);
  if (compactParent.length < 3) return false;
  const parentIndex = compactTitle.indexOf(compactParent);
  if (parentIndex < 0) return false;

  const tail = compactTitle.slice(parentIndex + compactParent.length);
  if (!tail) return false;
  if (EXPLICIT_EDITION_PREFIX.test(tail)) return true;
  if (EXPLICIT_EDITION_WORD.test(tail)) return true;

  if (tail.startsWith("2")) {
    const variantTerms = [targetVariantName, ...siblingVariantNames]
      .map(compact)
      .filter((term) => term.length >= 2);
    const afterNumber = tail.slice(1);
    return variantTerms.some((term) => afterNumber.startsWith(term))
      || EXPLICIT_EDITION_WORD.test(afterNumber);
  }
  return false;
}

function findClosingBracket(source, start, open, close) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    if (source[index] !== close) continue;
    depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function isIgnoredLabel(value) {
  const text = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return !text || IGNORED_LABEL_PATTERNS.some((pattern) => pattern.test(text));
}

function compact(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{Z}\s\p{P}\p{S}]+/gu, "");
}
