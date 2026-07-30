const BRACKET_PAIRS = new Map([
  ["[", "]"],
  ["［", "］"],
  ["【", "】"],
  ["(", ")"],
  ["（", "）"],
]);

const IGNORED_LABEL_PATTERNS = [
  /^(?:ネコポス|ゆうパケット|メール便|宅配便)(?:配送)?(?:対応)?$/i,
  /^(?:即納|在庫品|在庫あり|予約|新品|中古)$/i,
  /^(?:数量限定|期間限定|店舗限定|限定)$/i,
  /^(?:単品|バラ売り|セット)$/i,
  /^全\s*\d+\s*種$/i,
  /^(?:ガチャ|カプセルトイ|送料無料)$/i,
  /^c$/i,
];

const LEADING_ITEM_NUMBER = /^\s*(?:\d{1,2})\s*[.．:：\-]\s*/u;
const EXPLICIT_EDITION_PREFIX = /^(?:第2弾|第二弾|vol(?:ume)?2|part2)/iu;
const EXPLICIT_EDITION_WORD = /^(?:クラシック|classic)/iu;

export function analyzeExplicitMarketLabels(title, variants = [], targetVariantId = "") {
  const productLabels = extractBracketLabels(title)
    .filter((entry) => entry.topLevel && !isIgnoredLabel(entry.text))
    .map((entry) => ({
    ...entry,
    matchedVariantIds: selectMostSpecificVariantIds(variants
      .filter((variant) => explicitLabelMatchesVariant(entry.text, variant?.name))
      .map((variant) => ({
        id: String(variant.id),
        normalizedName: compact(variant.name),
      }))),
    }));
  const matchedVariantIds = [...new Set(productLabels.flatMap((entry) => entry.matchedVariantIds))];

  return {
    explicitLabelPresent: productLabels.length > 0,
    explicitLabelTargetMatch: matchedVariantIds.includes(String(targetVariantId)),
    explicitLabelOtherVariantMatch: matchedVariantIds.some((id) => id !== String(targetVariantId)),
    explicitLabelUnresolved: productLabels.some((entry) => entry.matchedVariantIds.length === 0),
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
  const closingBrackets = new Set(BRACKET_PAIRS.values());
  const stack = [];
  const result = [];

  for (let index = 0; index < source.length; index += 1) {
    const open = source[index];
    const close = BRACKET_PAIRS.get(open);
    if (close) {
      stack.push({
        start: index,
        close,
        depth: stack.length,
        parentStart: stack.at(-1)?.start ?? null,
      });
      continue;
    }

    if (!closingBrackets.has(source[index])) continue;
    const current = stack.at(-1);
    if (!current || current.close !== source[index]) continue;
    stack.pop();
    const text = source.slice(current.start + 1, index).trim();
    if (!text) continue;
    result.push({
      text,
      start: current.start,
      end: index + 1,
      depth: current.depth,
      parentStart: current.parentStart,
    });
  }

  const ordered = result.sort((left, right) => left.start - right.start || right.end - left.end);
  return ordered.map((entry) => {
    const parent = entry.parentStart === null
      ? null
      : ordered.find((candidate) => candidate.start === entry.parentStart) ?? null;
    return {
      text: entry.text,
      start: entry.start,
      end: entry.end,
      depth: entry.depth,
      parentRange: parent ? { start: parent.start, end: parent.end } : null,
      containedByAnotherLabel: entry.depth > 0,
      topLevel: entry.depth === 0,
    };
  });
}

export function explicitLabelMatchesVariant(label, variantName) {
  const variant = compact(variantName);
  if (variant.length < 2) return false;
  const withoutOrdinal = String(label ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(LEADING_ITEM_NUMBER, "")
    .trim();
  if (compact(withoutOrdinal) === variant) return true;

  const explicitSuffixRemoved = withoutOrdinal
    .replace(/\s*(?:ver\.?\s*[abc]|カラー\s*[abc])\s*$/iu, "")
    .trim();
  if (explicitSuffixRemoved !== withoutOrdinal && compact(explicitSuffixRemoved) === variant) {
    return true;
  }

  if (!containsNonAsciiLetterOrNumber(variantName)) return false;
  const shortSuffixRemoved = withoutOrdinal
    .replace(/\s*(?:iii|ii|i|[abc]|[123])\s*$/iu, "")
    .trim();
  return shortSuffixRemoved !== withoutOrdinal && compact(shortSuffixRemoved) === variant;
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
  const variantTerms = [targetVariantName, ...siblingVariantNames]
    .map(compact)
    .filter((term) => term.length >= 2)
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  if (variantTerms.some((term) => tail.startsWith(term))) return false;
  if (EXPLICIT_EDITION_PREFIX.test(tail)) return true;
  if (EXPLICIT_EDITION_WORD.test(tail)) return true;

  if (tail.startsWith("2")) {
    const afterNumber = tail.slice(1);
    return afterNumber.length === 0
      || variantTerms.some((term) => afterNumber.startsWith(term))
      || EXPLICIT_EDITION_WORD.test(afterNumber);
  }
  return false;
}

function isIgnoredLabel(value) {
  const text = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return !text || IGNORED_LABEL_PATTERNS.some((pattern) => pattern.test(text));
}

function containsNonAsciiLetterOrNumber(value) {
  return /[^\x00-\x7F]/u.test(String(value ?? ""));
}

function compact(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{Z}\s\p{P}\p{S}]+/gu, "");
}
