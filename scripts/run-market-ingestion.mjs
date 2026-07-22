import fs from "node:fs";
import { getGeneratedDataPath } from "./generated-paths.mjs";

await import("./collect-market-data.mjs");
await import("./upsert-market-data.mjs");
await import("./cleanup-irrelevant-market-data.mjs");

const generatedPath = getGeneratedDataPath("market-raw.json");
const generated = fs.existsSync(generatedPath) ? JSON.parse(fs.readFileSync(generatedPath, "utf8")) : {};
console.log(JSON.stringify({
  ok: true,
  task: "market",
  ...(generated.runSummary ?? {}),
}, null, 2));
