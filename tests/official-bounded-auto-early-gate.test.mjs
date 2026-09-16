import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(".github/workflows/gacha-official-bounded-auto.yml", "utf8");
const script = fs.readFileSync("scripts/official-bounded-auto.mjs", "utf8");

test("F0 keeps its reviewed schedule while the pre-gate runs before dependency setup", () => {
  assert.match(workflow, /cron: "27 2 \* \* \*"/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);

  const checkout = workflow.indexOf("actions/checkout@v6");
  const preGate = workflow.indexOf("Resolve false-by-default official automatic pre-gate");
  const setupNode = workflow.indexOf("actions/setup-node@v6");
  const npmCi = workflow.indexOf("- run: npm ci");
  const exactMain = workflow.indexOf("Verify exact current main revision");
  const fullGate = workflow.indexOf("Resolve exact-main official automatic gate");
  const audit = workflow.indexOf("Run read-only official live audit");

  assert.ok(checkout >= 0 && checkout < preGate);
  assert.ok(preGate < setupNode);
  assert.ok(setupNode < npmCi);
  assert.ok(npmCi < exactMain);
  assert.ok(exactMain < fullGate);
  assert.ok(fullGate < audit);

  const setupBlock = workflow.slice(setupNode, npmCi);
  const npmBlock = workflow.slice(npmCi, exactMain);
  const mainBlock = workflow.slice(exactMain, fullGate);
  assert.match(setupBlock, /if: \$\{\{ steps\.pre_gate\.outputs\.execute == 'true' \}\}/);
  assert.match(npmBlock, /if: \$\{\{ steps\.pre_gate\.outputs\.execute == 'true' \}\}/);
  assert.match(mainBlock, /if: \$\{\{ steps\.pre_gate\.outputs\.execute == 'true' \}\}/);
  assert.match(workflow, /if: \$\{\{ always\(\) && steps\.pre_gate\.outputs\.execute == 'true' \}\}/);
});

test("disabled F0 terminal handling does not require npm-installed database modules", () => {
  assert.match(workflow, /node scripts\/official-bounded-auto\.mjs pre-gate/);
  assert.match(workflow, /node scripts\/official-bounded-auto\.mjs scan/);
  assert.match(workflow, /node scripts\/official-bounded-auto\.mjs verify/);

  assert.doesNotMatch(script, /^import .* from "pg";/m);
  assert.doesNotMatch(script, /^import .*official-bounded-postgres\.js";/m);
  assert.match(script, /if \(command === "pre-gate"\) resolvePreGate\(\);/);
  assert.match(script, /originMainSha: headSha/);
  assert.match(script, /if \(gate\.state !== "enabled"\)/);
  assert.match(script, /import\("pg"\)/);
  assert.match(script, /import\("\.\.\/lib\/server\/official-bounded-postgres\.js"\)/);
});

test("armed F0 still requires the existing exact-main full gate before provider access", () => {
  const fullGateBlock = workflow.slice(
    workflow.indexOf("Resolve exact-main official automatic gate"),
    workflow.indexOf("Run read-only official live audit"),
  );
  const auditBlock = workflow.slice(
    workflow.indexOf("Run read-only official live audit"),
    workflow.indexOf("Decide bounded official automatic plan"),
  );

  assert.match(fullGateBlock, /OFFICIAL_BOUNDED_AUTO_ENABLED/);
  assert.match(fullGateBlock, /OFFICIAL_BOUNDED_AUTO_APPROVAL/);
  assert.match(fullGateBlock, /--origin-main-sha=\$\{\{ steps\.main\.outputs\.origin_main_sha \}\}/);
  assert.match(auditBlock, /steps\.main\.outcome == 'success'/);
  assert.match(auditBlock, /steps\.gate\.outputs\.execute == 'true'/);
  assert.match(workflow, /group: gacha-official-bounded-write/);
  assert.match(workflow, /cancel-in-progress: false/);
});
