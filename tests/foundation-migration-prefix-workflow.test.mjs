import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  new URL("../.github/workflows/foundation-baseline.yml", import.meta.url),
  "utf8",
);

test("Foundation workflow preserves the reviewed migration prefix while allowing later migrations", () => {
  assert.match(workflow, /if \[ "\$\{#actual\[@\]\}" -lt "\$\{#expected\[@\]\}" \]; then/);
  assert.match(workflow, /for i in "\$\{!expected\[@\]\}"; do/);
  assert.match(workflow, /"\$\{actual\[\$i\]\}" != "\$\{expected\[\$i\]\}"/);
  assert.match(workflow, /Foundation migration prefix verified/);
  assert.doesNotMatch(workflow, /"\$\{actual\[\*\]\}" != "\$\{expected\[\*\]\}"/);
});

test("Foundation workflow keeps disposable-stack and no-Production-mutation safety rails", () => {
  assert.match(workflow, /SUPABASE_CLI_VERSION:\s*2\.109\.1/);
  assert.match(workflow, /db reset --local --no-seed/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /stop --no-backup/);
  assert.doesNotMatch(workflow, /--linked|db push|migration repair|include-all/);
});
