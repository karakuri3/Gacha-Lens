import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { marketReobservationObservationId } from "../lib/domain/market-reobservation.js";
import {
  MARKET_REOBSERVATION_R2_V2_OBSERVATION_KEY,
} from "../lib/domain/market-reobservation-r2-v2-persistence.js";
import {
  R2_V2_FROZEN_LISTING_IDS,
} from "../scripts/market-reobservation-r2-v2-canary.mjs";

const EXPECTED = new Map([
  ["yahoo-lead-netstore-302507s186ook3", "market-reobservation-8a75ea4bf9142e03626b21494b70177c"],
  ["yahoo-selen-shope-5500000224314", "market-reobservation-790961862647eeaeccf27f8115a688c8"],
  ["yahoo-lead-netstore-qq222607s309ptk2", "market-reobservation-fcc0c3f5e4bace6f637bd808c44485a1"],
  ["yahoo-toysanta-g-5l960018a9-002-57393", "market-reobservation-e1ac79e10392067e6deb89991ed4ac53"],
]);

test("R2 v2 exact frozen Yahoo cohort produces the four reviewed deterministic observation IDs", () => {
  assert.equal(MARKET_REOBSERVATION_R2_V2_OBSERVATION_KEY, "reobs-v1:r2-20260902-02");
  assert.equal(R2_V2_FROZEN_LISTING_IDS.length, 4);
  assert.equal(new Set(R2_V2_FROZEN_LISTING_IDS).size, 4);
  assert.deepEqual(new Set(R2_V2_FROZEN_LISTING_IDS), new Set(EXPECTED.keys()));

  for (const listingId of R2_V2_FROZEN_LISTING_IDS) {
    assert.equal(marketReobservationObservationId({
      listingId,
      provider: "yahoo_shopping",
      observationKey: MARKET_REOBSERVATION_R2_V2_OBSERVATION_KEY,
    }), EXPECTED.get(listingId));
  }
});

test("R2 v2 SQL freezes the same four listing IDs/key and recomputes the existing v1 observation identity", () => {
  const migration = fs.readFileSync(new URL("../supabase/migrations/20260902180000_r2_yahoo_only_reobservation_canary_v2.sql", import.meta.url), "utf8");
  for (const listingId of EXPECTED.keys()) assert.match(migration, new RegExp(listingId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(migration, /reobs-v1:r2-20260902-02/);
  assert.match(migration, /\["gacha-lens","market-reobservation-v1",/);
  assert.match(migration, /extensions\.digest\(v_identity_json, 'sha256'\)/);
  assert.match(migration, /left\(encode\(extensions\.digest\(v_identity_json, 'sha256'\), 'hex'\), 32\)/);
});
