import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const steps = [
  { name: "official", file: "./upsert-official-data.mjs" },
  { name: "market", file: "./upsert-market-data.mjs" },
  { name: "x", file: "./upsert-x-reactions.mjs" },
  { name: "stock", file: "./upsert-stock-data.mjs" },
];

const startedAt = new Date();
const results = [];

try {
  for (const step of steps) {
    results.push(await runStep(step));
  }
} catch (error) {
  const failedAt = new Date();
  console.error("");
  console.error("[ingestion] failed");
  console.error(JSON.stringify({
    ok: false,
    startedAt: startedAt.toISOString(),
    failedAt: failedAt.toISOString(),
    durationMs: failedAt - startedAt,
    completedSteps: results,
    failedStep: error.stepName || "unknown",
    message: error.message,
    nextAction: "Open GitHub Actions logs, fix the failed source or env, then rerun npm run db:upsert-all. Check /review after the rerun.",
  }, null, 2));
  process.exitCode = 1;
  throw error;
}

const finishedAt = new Date();

console.log(JSON.stringify({
  ok: true,
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationMs: finishedAt - startedAt,
  steps: results,
  nextAction: "Open /review and handle high or medium import issues first.",
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
      const finishedAt = new Date();
      if (code === 0) {
        resolve({
          name: step.name,
          ok: true,
          finishedAt: finishedAt.toISOString(),
        });
        return;
      }
      const error = new Error(`${step.name} exited with code ${code}`);
      error.stepName = step.name;
      reject(error);
    });
  });
}
