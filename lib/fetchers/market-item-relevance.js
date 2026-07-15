const STRONG_MARKET_TERMS = [
  /\u30ac\u30c1\u30e3/i,
  /\u30ac\u30b7\u30e3\u30dd\u30f3/i,
  /\u30ab\u30d7\u30bb\u30eb\u30c8\u30a4/i,
  /\u30ab\u30d7\u30bb\u30eb(?:\u30d5\u30a3\u30ae\u30e5\u30a2|\u30b3\u30ec\u30af\u30b7\u30e7\u30f3)/i,
  /\u5168\s*\d+\s*\u7a2e/i,
  /\u30b3\u30f3\u30d7(?:\u30ea\u30fc\u30c8)?(?:\u30bb\u30c3\u30c8)?/i,
  /\u30b7\u30fc\u30af\u30ec\u30c3\u30c8/i,
];

const REJECTED_MARKET_TERMS = [
  /\u30ac\u30c1\u30e3\u3067\u6700\u5927\s*\d+%?\s*off/i,
  /\u30ac\u30c1\u30e3\u30ac\u30c1\u30e3[\s\u30fb]*\d+[\s\u30fb]/i,
  /\u30ea\u30ac\u30c1\u30e3\u30fc/i,
  /\u30ac\u30b7\u30e3\u30dd\u30f3\u30a6\u30a9\u30fc\u30ba/i,
  /(?:\u6f2b\u753b|\u30b3\u30df\u30c3\u30af|\u30b2\u30fc\u30e0\u5185|\u30a2\u30d7\u30ea\u5185|\u30af\u30fc\u30dd\u30f3)/i,
];

export function isRelevantMarketItem(title = "", context = {}) {
  const value = String(title ?? "").normalize("NFKC").trim();
  if (!value || REJECTED_MARKET_TERMS.some((pattern) => pattern.test(value))) return false;
  if (STRONG_MARKET_TERMS.some((pattern) => pattern.test(value))) return true;

  const queryTerms = String(context.query ?? "")
    .replace(/(?:\u30ac\u30c1\u30e3|\u30ac\u30b7\u30e3\u30dd\u30f3|\u30ab\u30d7\u30bb\u30eb\u30c8\u30a4|\u5358\u54c1)/g, " ")
    .split(/\s+/)
    .map(normalize)
    .filter((term) => term.length >= 3);
  const normalizedTitle = normalize(value);
  return queryTerms.length > 0 && queryTerms.every((term) => normalizedTitle.includes(term));
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u30fb\uff65\-_/\uff0f()\uff08\uff09\u3010\u3011\[\]]+/g, "");
}
