import assert from "node:assert/strict";
import test from "node:test";
import {
  collectManualMarketAuditSecretValues,
  findManualMarketAuditSecretLeaks,
} from "../lib/domain/manual-market-audit-safety.js";

test("manual audit secret collection excludes public provider identifiers", () => {
  const values = collectManualMarketAuditSecretValues({
    RAKUTEN_APPLICATION_ID: "public-rakuten-application-12345",
    RAKUTEN_AFFILIATE_ID: "public-rakuten-affiliate-12345",
    YAHOO_SHOPPING_APP_ID: "public-yahoo-app-12345",
    YAHOO_AFFILIATE_TRACKING_ID: "public-yahoo-tracking-12345",
    RAKUTEN_ACCESS_KEY: "private-rakuten-access-12345",
    SUPABASE_SERVICE_ROLE_KEY: "private-service-role-12345",
    OTHER_TOKEN: "private-token-12345",
  });

  assert.equal(values.includes("public-rakuten-application-12345"), false);
  assert.equal(values.includes("public-rakuten-affiliate-12345"), false);
  assert.equal(values.includes("public-yahoo-app-12345"), false);
  assert.equal(values.includes("public-yahoo-tracking-12345"), false);
  assert.ok(values.includes("private-rakuten-access-12345"));
  assert.ok(values.includes("private-service-role-12345"));
  assert.ok(values.includes("private-token-12345"));
});

test("public Rakuten provider identifiers are not treated as secret leaks", () => {
  const env = {
    RAKUTEN_APPLICATION_ID: "public-rakuten-application-12345",
    RAKUTEN_AFFILIATE_ID: "public-rakuten-affiliate-12345",
    RAKUTEN_ACCESS_KEY: "private-rakuten-access-12345",
  };
  const secretValues = collectManualMarketAuditSecretValues(env);
  const publicText = [
    "applicationId=public-rakuten-application-12345",
    "https://item.rakuten.co.jp/example/item-1/?scid=af_pc_etc&sc2id=af_101_0_0&affiliateId=public-rakuten-affiliate-12345",
  ].join("\n");

  assert.deepEqual(
    findManualMarketAuditSecretLeaks([{ name: "market-candidate-audit.json", text: publicText }], secretValues),
    [],
  );
});

test("manual audit scan still catches real configured secrets", () => {
  const env = {
    RAKUTEN_APPLICATION_ID: "public-rakuten-application-12345",
    RAKUTEN_AFFILIATE_ID: "public-rakuten-affiliate-12345",
    RAKUTEN_ACCESS_KEY: "private-rakuten-access-12345",
    SUPABASE_SERVICE_ROLE_KEY: "private-service-role-12345",
  };
  const secretValues = collectManualMarketAuditSecretValues(env);

  assert.deepEqual(
    findManualMarketAuditSecretLeaks([{ name: "audit.json", text: "private-rakuten-access-12345" }], secretValues),
    ["audit.json"],
  );
  assert.deepEqual(
    findManualMarketAuditSecretLeaks([{ name: "audit.md", text: "private-service-role-12345" }], secretValues),
    ["audit.md"],
  );
});

test("manual audit scan retains token and JWT pattern detection", () => {
  assert.deepEqual(
    findManualMarketAuditSecretLeaks([{ name: "audit.txt", text: "Authorization: Bearer abcdefghijklmnop" }]),
    ["audit.txt"],
  );
  assert.deepEqual(
    findManualMarketAuditSecretLeaks([{
      name: "audit.json",
      text: "eyJaaaaaaaaaaaaaaaaaaaaa.eyJbbbbbbbbbbbbbbbbbbbbb.cccccccccccccc",
    }]),
    ["audit.json"],
  );
});
