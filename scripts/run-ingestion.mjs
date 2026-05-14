import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const steps = [
  { name: "official", file: "./upsert-official-data.mjs" },
  { name: "market", file: "./upsert-market-data.mjs" },
  { name: "x", file: "./upsert-x-reactions.mjs" },
  { name: "stock", file: "./upsert-stock-data.mjs" },
];

for (const step of steps) {
  await runStep(step);
}

console.log(JSON.stringify({
  ok: true,
  steps: steps.map((step) => step.name),
}, null, 2));

function runStep(step) {
  const scriptPath = fileURLToPath(new URL(step.file, import.meta.url));
  console.log(`\n[ingestion] running ${step.name}`);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: "inherit",
      env: process.env,
      shell: false,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step.name} exited with code ${code}`));
    });
  });
}
