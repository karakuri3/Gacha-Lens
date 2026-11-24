// Official catalog names are scraped from HTML and occasionally keep entity
// references (for example "MLB&trade; サイン入りユニフォーム"). Marketplace
// titles never contain the literal entity text, so matching and search must
// compare the decoded characters instead.
const NAMED_ENTITIES = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  trade: "\u2122",
  reg: "\u00ae",
  copy: "\u00a9",
  hellip: "\u2026",
  ndash: "\u2013",
  mdash: "\u2014",
  times: "\u00d7",
  hearts: "\u2665",
  star: "\u2606",
});

const ENTITY_PATTERN = /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z][a-z0-9]{1,15}));/gi;

export function decodeCatalogHtmlEntities(value) {
  const source = String(value ?? "");
  if (!source.includes("&")) return source;
  return source.replace(ENTITY_PATTERN, (match, decimal, hex, name) => {
    if (decimal || hex) {
      const codePoint = Number.parseInt(decimal ?? hex, decimal ? 10 : 16);
      if (!Number.isInteger(codePoint) || codePoint <= 0x1f || codePoint > 0x10ffff) return match;
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match;
      return String.fromCodePoint(codePoint);
    }
    const decoded = NAMED_ENTITIES[String(name).toLowerCase()];
    return decoded ?? match;
  });
}

// Decoded text with trademark marks removed. NFKC would otherwise expand
// "\u2122" to "TM", so "MLB&trade;" and a marketplace title "MLB" would never
// compare equal.
export function catalogMatchText(value) {
  return decodeCatalogHtmlEntities(value).replace(/[\u2122\u00ae\u00a9\u2120]/g, " ");
}
