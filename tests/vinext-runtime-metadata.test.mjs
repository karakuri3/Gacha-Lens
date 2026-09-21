import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("vinext runtime keeps dynamic metadata on the blocking head path", () => {
  const config = fs.readFileSync("next.config.mjs", "utf8");
  assert.match(config, /htmlLimitedBots:\s*\/\.\*\//);
});
