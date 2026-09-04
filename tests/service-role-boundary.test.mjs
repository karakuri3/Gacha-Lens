import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const serviceClient = fs.readFileSync(new URL("../lib/supabase/service-role-client.js", import.meta.url), "utf8");
const ingestionRunStore = fs.readFileSync(new URL("../lib/data/ingestion-run-store.js", import.meta.url), "utf8");

for (const [name, source] of [
  ["service-role client", serviceClient],
  ["ingestion run store", ingestionRunStore],
]) {
  test(`${name} has an explicit server-only boundary before reading the service-role key`, () => {
    const marker = source.indexOf('import "server-only"');
    const secretRead = source.indexOf("SUPABASE_SERVICE_ROLE_KEY");
    assert.ok(marker >= 0, `${name}: missing server-only import`);
    assert.ok(secretRead > marker, `${name}: service-role key read must occur after server-only marker`);
  });
}

test("ingestion run store is currently consumed only by the Node ingestion runner", () => {
  const runner = fs.readFileSync(new URL("../lib/ingestion-runner.js", import.meta.url), "utf8");
  assert.match(runner, /from ["']\.\/data\/ingestion-run-store\.js["']/);
  assert.match(runner, /from ["']node:path["']/);
});
