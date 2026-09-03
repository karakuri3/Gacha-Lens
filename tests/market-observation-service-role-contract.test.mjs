import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20260903183530_market_observation_service_role_contract.sql",
    import.meta.url,
  ),
  "utf8",
);

test("fresh R4 path restores only the server-side observation table contract", () => {
  assert.match(
    migration,
    /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+table\s+public\.market_listing_observations\s+to\s+service_role/i,
  );
  assert.doesNotMatch(migration, /\bto\s+anon\b/i);
  assert.doesNotMatch(migration, /\bto\s+authenticated\b/i);
  assert.doesNotMatch(migration, /\bto\s+public\b/i);
});
