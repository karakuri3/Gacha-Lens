import assert from "node:assert/strict";
import test from "node:test";
import { buildVerifiedAffiliatePersistenceFields } from "../lib/domain/market-affiliate-persistence.js";
import { buildP3BoundedSeedV2Rows } from "../lib/domain/market-p3-bounded-seed-v2.js";
import {
  RAKUTEN_AFFILIATE_PROVENANCE_CONTRACT,
  RAKUTEN_ITEM_SEARCH_DOCUMENTATION,
} from "../lib/domain/rakuten-affiliate-link.js";
import {
  YAHOO_AFFILIATE_DOCUMENTATION,
  YAHOO_AFFILIATE_PROVENANCE_CONTRACT,
} from "../lib/domain/yahoo-affiliate-link.js";

function rakutenCandidate(overrides = {}) {
  const publicUrl = "https://item.rakuten.co.jp/surugaya-a-too/87664313-1/";
  return {
    candidate_key: "019fc42edfe62a59",
    assessment: {
      accepted: true,
      review_required: false,
      reason: "variant_and_parent_evidence_confirmed",
      confidence: 0.9,
    },
    checks: {
      variant_evidence_present: true,
      parent_series_evidence_present: true,
      set_signal_detected: false,
      multiple_variant_candidates: false,
      explicit_variant_conflict: false,
      explicit_label_unresolved: false,
      explicit_label_other_variant_match: false,
      parent_series_edition_conflict: false,
      catalog_parent_variant_identity_ambiguous: false,
    },
    source: {
      provider: "rakuten_ichiba",
      listing_id: "surugaya-a-too:358369703",
      public_url: publicUrl,
      affiliate_destination: {
        url: "https://hb.afl.rakuten.co.jp/hgc/example/",
        source: "rakuten_api",
        contract: RAKUTEN_AFFILIATE_PROVENANCE_CONTRACT,
        documentation: RAKUTEN_ITEM_SEARCH_DOCUMENTATION,
      },
    },
    listing: {
      title: "対象ガチャ 単品",
      price: 680,
      status: "active",
      listing_type: "single",
    },
    target: {
      variant_id: "variant-safe-1",
      series_id: "series-safe-1",
      search_query: "対象ガチャ 単品",
    },
    ...overrides,
  };
}

test("verified Rakuten affiliate provenance is reduced to the persistence allowlist", () => {
  const fields = buildVerifiedAffiliatePersistenceFields(rakutenCandidate());
  assert.deepEqual(fields, {
    affiliate_url: "https://hb.afl.rakuten.co.jp/hgc/example/",
    affiliate_url_source: "rakuten_api",
    affiliate_url_contract: RAKUTEN_AFFILIATE_PROVENANCE_CONTRACT,
    source_documentation: RAKUTEN_ITEM_SEARCH_DOCUMENTATION,
  });
  assert.deepEqual(Object.keys(fields).sort(), [
    "affiliate_url",
    "affiliate_url_contract",
    "affiliate_url_source",
    "source_documentation",
  ]);
});

test("verified Yahoo affiliate provenance is reduced to the same persistence allowlist", () => {
  const publicUrl = "https://store.shopping.yahoo.co.jp/example/item-1.html";
  const vcUrl = encodeURIComponent(publicUrl);
  const fields = buildVerifiedAffiliatePersistenceFields({
    source: {
      provider: "yahoo_shopping",
      listing_id: "example:item-1",
      public_url: publicUrl,
      affiliate_destination: {
        url: `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=1&pid=2&vc_url=${vcUrl}`,
        source: "yahoo_api",
        contract: YAHOO_AFFILIATE_PROVENANCE_CONTRACT,
        documentation: YAHOO_AFFILIATE_DOCUMENTATION,
      },
    },
  });

  assert.equal(fields.affiliate_url_source, "yahoo_api");
  assert.equal(fields.affiliate_url_contract, YAHOO_AFFILIATE_PROVENANCE_CONTRACT);
  assert.equal(fields.source_documentation, YAHOO_AFFILIATE_DOCUMENTATION);
  assert.match(fields.affiliate_url, /^https:\/\/ck\.jp\.ap\.valuecommerce\.com\/servlet\/referral\?/u);
});

test("unverified or manually fabricated affiliate metadata fails closed", () => {
  const candidate = rakutenCandidate();
  candidate.source.affiliate_destination = {
    url: "https://example.com/fake",
    source: "manual",
    contract: "invented",
    documentation: "https://example.com",
  };
  assert.deepEqual(buildVerifiedAffiliatePersistenceFields(candidate), {});
  assert.deepEqual(buildVerifiedAffiliatePersistenceFields({ source: { provider: "mercari" } }), {});
  assert.deepEqual(buildVerifiedAffiliatePersistenceFields({}), {});
});

test("P3 V2 row builder persists only revalidated affiliate provenance", () => {
  const candidate = rakutenCandidate();
  const rows = buildP3BoundedSeedV2Rows({
    candidates: [candidate],
    workflow: {
      run_id: "33247095928",
      head_sha: "4b6901969b2ca9a7e5c084851c758cb75fe256e7",
    },
    observed_at: new Date("2026-08-29T10:10:00.000Z"),
    stage: "p3-bounded-seed-v2-auto",
  });

  assert.equal(rows.listingRows.length, 1);
  assert.equal(rows.observationRows.length, 1);
  assert.deepEqual(
    {
      affiliate_url: rows.listingRows[0].raw.affiliate_url,
      affiliate_url_source: rows.listingRows[0].raw.affiliate_url_source,
      affiliate_url_contract: rows.listingRows[0].raw.affiliate_url_contract,
      source_documentation: rows.listingRows[0].raw.source_documentation,
    },
    buildVerifiedAffiliatePersistenceFields(candidate),
  );
  assert.equal(Object.hasOwn(rows.listingRows[0].raw, "affiliate_id"), false);
  assert.equal(Object.hasOwn(rows.listingRows[0].raw, "application_id"), false);
  assert.equal(Object.hasOwn(rows.listingRows[0].raw, "access_key"), false);
});

test("P3 V2 row builder does not persist invalid affiliate metadata", () => {
  const candidate = rakutenCandidate();
  candidate.source.affiliate_destination = {
    url: "https://evil.example/redirect",
    source: "rakuten_api",
    contract: RAKUTEN_AFFILIATE_PROVENANCE_CONTRACT,
    documentation: RAKUTEN_ITEM_SEARCH_DOCUMENTATION,
  };
  const rows = buildP3BoundedSeedV2Rows({
    candidates: [candidate],
    workflow: {
      run_id: "33247095928",
      head_sha: "4b6901969b2ca9a7e5c084851c758cb75fe256e7",
    },
    observed_at: new Date("2026-08-29T10:10:00.000Z"),
    stage: "p3-bounded-seed-v2-auto",
  });

  assert.equal(Object.hasOwn(rows.listingRows[0].raw, "affiliate_url"), false);
  assert.equal(Object.hasOwn(rows.listingRows[0].raw, "affiliate_url_source"), false);
  assert.equal(Object.hasOwn(rows.listingRows[0].raw, "affiliate_url_contract"), false);
});
