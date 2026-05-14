import { getIngestionTaskNames, runIngestionSequence } from "../lib/ingestion-runner.js";

const taskNames = getRequestedTasks();

try {
  const summary = await runIngestionSequence(taskNames);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error("");
  console.error("[ingestion] failed");
  console.error(JSON.stringify(error.summary ?? {
    ok: false,
    failedStep: error.stepName || "unknown",
    message: error.message,
  }, null, 2));
  process.exitCode = 1;
  throw error;
}

function getRequestedTasks() {
  const taskArg = process.argv.find((arg) => arg.startsWith("--task="));
  const taskName = taskArg?.split("=")[1]?.trim();
  if (!taskName || taskName === "all") return getIngestionTaskNames();
  return [taskName];
}
