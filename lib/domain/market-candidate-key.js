import { createHash } from "node:crypto";

const C0_CONTROL = /[\u0000-\u001f\u007f]/g;
const DISPLAY_CONTROL = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

export function buildMarketCandidateKey(record = {}) {
  const provider = cleanText(record.source?.provider ?? record.provider ?? record.raw?.provider ?? record.source);
  const listingId = cleanText(
    record.source?.listing_id
      ?? record.listing_id
      ?? record.raw?.itemCode
      ?? record.raw?.code
      ?? record.id
  );
  const publicUrl = sanitizeMarketPublicUrl(
    record.source?.public_url
      ?? record.public_url
      ?? (provider === "rakuten_ichiba" ? record.raw?.public_item_url : record.source_url)
  );

  return createHash("sha256")
    .update([provider, listingId, publicUrl || ""].join("\n"))
    .digest("hex")
    .slice(0, 16);
}

export function sanitizeMarketPublicUrl(value) {
  try {
    const url = new URL(String(value ?? "").replace(C0_CONTROL, "").replace(DISPLAY_CONTROL, ""));
    if (!/^https?:$/.test(url.protocol)) return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(DISPLAY_CONTROL, "")
    .replace(C0_CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim();
}
