const SOLD = new Set(["sold", "completed", "sold_completed", "売却済み", "成約済み"]);
const SOLD_OUT = new Set(["sold_out", "soldout", "out_of_stock", "売り切れ", "在庫切れ", "品切れ"]);
const ACTIVE = new Set(["active", "in_stock", "available"]);
const PRE_RELEASE = new Set(["pre_release", "予約", "発売前"]);

export function normalizeMarketplaceStatus(value) {
  const status = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (SOLD.has(status)) return "sold";
  if (SOLD_OUT.has(status)) return "sold_out";
  if (ACTIVE.has(status)) return "active";
  if (PRE_RELEASE.has(status)) return "pre_release";
  return status || "active";
}
