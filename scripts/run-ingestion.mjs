try {
  process.loadEnvFile(".env.local");
} catch {}

const executionType = String(process.env.INGESTION_EXECUTION_TYPE || "");
const mutationExecution = ["scheduled_write", "manual_full_write"].includes(executionType);
if (String(process.env.INGESTION_WRITE_DISABLED || "false").toLowerCase() === "true") {
  throw new Error("Ingestion write entry point is disabled.");
}
if (mutationExecution && process.env.INGESTION_EXECUTION_AUTHORIZED !== "true") {
  throw new Error("Production ingestion execution was not authorized by preflight.");
}

const { getIngestionTaskNames, runIngestionSequence } = await import("../lib/ingestion-runner.js");

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
