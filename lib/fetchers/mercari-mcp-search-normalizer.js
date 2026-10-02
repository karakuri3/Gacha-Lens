const MERCARI_C2C_PRODUCT_ID = /^m\d+$/i;
const MERCARI_PROVIDER = "mercari_chatgpt_app_mcp";
const MERCARI_SOURCE = "mercari";
const COMMERCIAL_STORAGE_BLOCK = "commercial_storage_and_republication_rights_unverified";

export function normalizeMercariMcpSearchResponse(response = {}, options = {}) {
  const query = text(options.query ?? response.query ?? response.keyword);
  const fetchedAt = normalizeTimestamp(options.fetchedAt ?? response.fetched_at ?? response.fetchedAt) || new Date().toISOString();
  const products = Array.isArray(response.products) ? response.products : [];
  const records = [];
  const rejectionCounts = {
    missing_query: 0,
    missing_product_id: 0,
    non_c2c_product: 0,
    not_sold: 0,
    missing_title: 0,
    invalid_price: 0,
    duplicate_product_id: 0,
  };
  const seen = new Set();

  for (const product of products) {
    if (!query) {
      rejectionCounts.missing_query += 1;
      continue;
    }

    const productId = text(product?.product_id ?? product?.id);
    if (!productId) {
      rejectionCounts.missing_product_id += 1;
      continue;
    }
    if (!MERCARI_C2C_PRODUCT_ID.test(productId)) {
      rejectionCounts.non_c2c_product += 1;
      continue;
    }
    if (seen.has(productId)) {
      rejectionCounts.duplicate_product_id += 1;
      continue;
    }

    const status = text(product?.status).toLowerCase();
    if (status !== "sold") {
      rejectionCounts.not_sold += 1;
      continue;
    }

    const title = text(product?.title ?? product?.name);
    if (!title) {
      rejectionCounts.missing_title += 1;
      continue;
    }

    const price = number(product?.price);
    if (!Number.isFinite(price) || price <= 0) {
      rejectionCounts.invalid_price += 1;
      continue;
    }

    seen.add(productId);
    records.push({
      id: `mercari-${productId}`,
      title,
      price,
      status: "sold",
      source: MERCARI_SOURCE,
      source_type: "marketplace",
      source_url: `https://jp.mercari.com/item/${productId}`,
      listed_at: null,
      sold_at: null,
      last_observed_at: fetchedAt,
      variant_id: null,
      series_id: null,
      raw: {
        provider: MERCARI_PROVIDER,
        query,
        keyword: query,
        product_id: productId,
        seller_id: text(product?.seller_id) || null,
        category_id: integerOrNull(product?.category_id),
        category_name: text(product?.category_name) || null,
        condition_id: integerOrNull(product?.condition_id),
        condition: text(product?.condition) || null,
        image_url: text(product?.image_url) || null,
        created_age: text(product?.created_age) || null,
        updated_age: text(product?.updated_age) || null,
        observed_at: fetchedAt,
        acquisition_mode: "official_chatgpt_app_search",
        commercial_storage_authorization: "unverified",
      },
    });
  }

  return {
    records,
    summary: {
      provider: MERCARI_PROVIDER,
      query,
      products_seen: products.length,
      sold_c2c_records: records.length,
      rejection_counts: rejectionCounts,
      production_write_ready: false,
      blocking_reason: COMMERCIAL_STORAGE_BLOCK,
      sold_at_semantics: "not_provided_use_first_observed_at_only",
      max_search_results_observed_contract: 120,
      pagination_exposed: false,
    },
  };
}

export function describeMercariMcpSearchSafety() {
  return {
    provider: MERCARI_PROVIDER,
    source: MERCARI_SOURCE,
    official_interface: true,
    sold_only: true,
    c2c_only: true,
    production_write_ready: false,
    blocking_reason: COMMERCIAL_STORAGE_BLOCK,
    sold_at_semantics: "not_provided_use_first_observed_at_only",
  };
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeTimestamp(value) {
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}
