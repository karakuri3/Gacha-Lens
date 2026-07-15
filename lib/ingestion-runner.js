import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { upsertIngestionRun } from "./data/ingestion-run-store.js";

export const INGESTION_TASKS = {
  official: { name: "official", script: "run-official-ingestion.mjs" },
  market: { name: "market", script: "run-market-ingestion.mjs" },
  x: { name: "x", script: "run-x-ingestion.mjs" },
  stock: { name: "stock", script: "run-stock-ingestion.mjs" },
};

export const INGESTION_ORDER = ["official", "market", "x", "stock"];

export function getIngestionTaskNames() {
  const xEnabled = String(process.env.X_FETCH_ENABLED || "false").toLowerCase() === "true";
  return INGESTION_ORDER.filter((taskName) => taskName !== "x" || xEnabled);
}

export async function runIngestionTask(taskName, options = {}) {
  const task = INGESTION_TASKS[taskName];
  if (!task) {
    const error = new Error(`Unknown ingestion task: ${taskName}`);
    error.code = "UNKNOWN_INGESTION_TASK";
    throw error;
  }

  const startedAt = new Date();
  const runId = randomUUID();
  const triggerSource = options.triggerSource || process.env.INGESTION_TRIGGER_SOURCE || "manual";
  await recordRunSafely({
    id: runId,
    task: taskName,
    status: "running",
    trigger_source: triggerSource,
    started_at: startedAt.toISOString(),
    summary: {},
  });
  const scriptPath = path.join(process.cwd(), "scripts", task.script);
  try {
    const result = await runNodeScript(scriptPath, {
      ...options,
      taskName,
      startedAt,
    });
    const finishedAt = new Date();
    await recordRunSafely({
      id: runId,
      task: taskName,
      status: "succeeded",
      trigger_source: triggerSource,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt - startedAt,
      summary: result.parsedOutput ?? {},
      error_message: null,
    });

    return {
      name: taskName,
      ok: true,
      runId,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt - startedAt,
      ...result,
    };
  } catch (error) {
    const failedAt = new Date();
    await recordRunSafely({
      id: runId,
      task: taskName,
      status: "failed",
      trigger_source: triggerSource,
      started_at: startedAt.toISOString(),
      finished_at: failedAt.toISOString(),
      duration_ms: failedAt - startedAt,
      summary: error.summary ?? {},
      error_message: String(error.message || error).slice(0, 2000),
    });
    throw error;
  }
}

export async function runIngestionSequence(taskNames, options = {}) {
  const requestedTasks = taskNames ?? getIngestionTaskNames();
  const startedAt = new Date();
  const results = [];

  try {
    for (const taskName of requestedTasks) {
      results.push(await runIngestionTask(taskName, options));
    }
  } catch (error) {
    const failedAt = new Date();
    error.summary = {
      ok: false,
      startedAt: startedAt.toISOString(),
      failedAt: failedAt.toISOString(),
      durationMs: failedAt - startedAt,
      completedSteps: results,
      failedStep: error.stepName || "unknown",
      message: error.message,
      nextAction: "Open ingestion logs, fix the failed source or env, then rerun the failed task. Check /review after the rerun.",
    };
    throw error;
  }

  const finishedAt = new Date();
  return {
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    steps: results,
    nextAction: "Open /review and handle high or medium import issues first.",
  };
}

function runNodeScript(scriptPath, options) {
  const { taskName, startedAt, captureOutput = false } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      shell: false,
    });

    const stdout = [];
    const stderr = [];

    child.stdout?.on("data", (chunk) => {
      stdout.push(chunk);
      if (!captureOutput) process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr.push(chunk);
      if (!captureOutput) process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      error.stepName = taskName;
      reject(error);
    });

    child.on("close", (code) => {
      const finishedAt = new Date();
      const output = bufferToLimitedText(stdout);
      const errorOutput = bufferToLimitedText(stderr);

      if (code === 0) {
        resolve({
          exitCode: code,
          output,
          errorOutput,
          parsedOutput: parseLastJsonObject(output),
        });
        return;
      }

      const error = new Error(`${taskName} exited with code ${code}`);
      error.stepName = taskName;
      error.summary = {
        ok: false,
        startedAt: startedAt.toISOString(),
        failedAt: finishedAt.toISOString(),
        durationMs: finishedAt - startedAt,
        failedStep: taskName,
        exitCode: code,
        output,
        errorOutput,
      };
      reject(error);
    });
  });
}

function bufferToLimitedText(chunks) {
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length > 12000 ? `${text.slice(-12000)}\n[truncated]` : text;
}

function parseLastJsonObject(value = "") {
  const text = String(value).trim();
  if (!text) return null;

  const end = text.lastIndexOf("}");
  if (end < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = end; index >= 0; index -= 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "}") {
      depth += 1;
      continue;
    }
    if (char === "{") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(index, end + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

async function recordRunSafely(row) {
  try {
    await upsertIngestionRun(row);
  } catch (error) {
    console.warn(`[ingestion] run log unavailable: ${error.message}`);
  }
}
