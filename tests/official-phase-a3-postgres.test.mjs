import assert from "node:assert/strict";
import test from "node:test";
import { executeOfficialPhaseA3VariantTransaction } from "../lib/server/official-phase-a3-postgres.js";

test("Phase A3 transaction inserts variants only and commits atomically", async () => {
  const queries = [];
  const plan = planFixture();
  const client = fakeClient({ plan, queries });
  const result = await executeOfficialPhaseA3VariantTransaction({ client, plan });

  assert.equal(result.state, "committed");
  assert.equal(result.database_writes, 2);
  assert.equal(result.inserted_variants, 2);
  assert.ok(queries.some((entry) => entry.text === "BEGIN"));
  assert.ok(queries.some((entry) => entry.text === "COMMIT"));
  assert.ok(queries.some((entry) => entry.text.includes("LOCK TABLE public.variants IN SHARE ROW EXCLUSIVE MODE")));
  assert.ok(queries.some((entry) => entry.text.startsWith("INSERT INTO public.variants")));
  assert.ok(!queries.some((entry) => /INSERT INTO public\.series|UPDATE |DELETE FROM|TRUNCATE/i.test(entry.text)));
});

test("Phase A3 transaction rolls back before commit on identity collision", async () => {
  const queries = [];
  const plan = planFixture();
  const client = fakeClient({ plan, queries, collision: true });
  const result = await executeOfficialPhaseA3VariantTransaction({ client, plan });

  assert.equal(result.state, "rolled_back");
  assert.equal(result.database_writes, 0);
  assert.equal(result.rollback_attempted, true);
  assert.equal(result.rollback_verified, true);
  assert.equal(result.reason_code, "phase_a3_variant_identity_collision");
  assert.ok(queries.some((entry) => entry.text === "ROLLBACK"));
  assert.ok(!queries.some((entry) => entry.text.startsWith("INSERT INTO public.variants")));
});

test("Phase A3 transaction rolls back on existing slug collision", async () => {
  const queries = [];
  const plan = planFixture();
  const client = fakeClient({ plan, queries, slugCollision: true });
  const result = await executeOfficialPhaseA3VariantTransaction({ client, plan });

  assert.equal(result.state, "rolled_back");
  assert.equal(result.database_writes, 0);
  assert.equal(result.reason_code, "phase_a3_variant_slug_collision");
  assert.ok(queries.some((entry) => entry.text === "ROLLBACK"));
  assert.ok(!queries.some((entry) => entry.text.startsWith("INSERT INTO public.variants")));
});

test("lost commit acknowledgement is explicit and never rolled back", async () => {
  const queries = [];
  const plan = planFixture();
  const client = fakeClient({ plan, queries, commitFails: true });
  const result = await executeOfficialPhaseA3VariantTransaction({ client, plan });

  assert.equal(result.state, "commit_outcome_unknown");
  assert.equal(result.database_writes, 2);
  assert.equal(result.rollback_attempted, false);
  assert.ok(!queries.some((entry) => entry.text === "ROLLBACK"));
});

test("variant values are parameterized and never interpolated into SQL", async () => {
  const queries = [];
  const plan = planFixture();
  plan.variant_rows[0].name = "x'); DELETE FROM public.variants; --";
  const client = fakeClient({ plan, queries });
  await executeOfficialPhaseA3VariantTransaction({ client, plan });

  const insert = queries.find((entry) => entry.text.startsWith("INSERT INTO public.variants"));
  assert.ok(insert);
  assert.doesNotMatch(insert.text, /DELETE FROM/);
  assert.ok(insert.values.includes(plan.variant_rows[0].name));
});

function planFixture() {
  return {
    targets: [
      {
        series_id: "series-1",
        official_url: "https://gashapon.jp/products/detail.php?jan_code=1",
      },
    ],
    variant_rows: [
      variant("variant-1", "One"),
      variant("variant-2", "Two"),
    ],
  };
}

function variant(id, name) {
  return {
    id,
    slug: id,
    series_id: "series-1",
    name,
    variant_type: "normal",
    image: "https://example.invalid/" + id + ".jpg",
    released: true,
    price: 400,
    brand: "Bandai",
    release_month: "9月",
    release_week: "第1週",
    release_date: "2026-09-01",
    official_url: "https://gashapon.jp/products/detail.php?jan_code=1",
    source_type: "official_site",
    review_required: false,
  };
}

function fakeClient({ plan, queries, collision = false, slugCollision = false, commitFails = false }) {
  return {
    async query(text, values = []) {
      queries.push({ text, values });
      if (text === "COMMIT" && commitFails) throw new Error("lost_commit_ack");
      if (text.startsWith("SELECT id, official_url FROM public.series")) {
        return {
          rowCount: plan.targets.length,
          rows: plan.targets.map((target) => ({
            id: target.series_id,
            official_url: target.official_url,
          })),
        };
      }
      if (text.startsWith("SELECT id, series_id FROM public.variants")) {
        return { rowCount: 0, rows: [] };
      }
      if (text.startsWith("SELECT id FROM public.variants")) {
        return collision ? { rowCount: 1, rows: [{ id: plan.variant_rows[0].id }] } : { rowCount: 0, rows: [] };
      }
      if (text.startsWith("SELECT id, slug FROM public.variants")) {
        return slugCollision ? { rowCount: 1, rows: [{ id: "other", slug: plan.variant_rows[0].slug }] } : { rowCount: 0, rows: [] };
      }
      if (text.startsWith("INSERT INTO public.variants")) {
        return { rowCount: plan.variant_rows.length, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
}
